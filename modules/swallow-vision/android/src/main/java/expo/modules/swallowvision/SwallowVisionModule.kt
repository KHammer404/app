package expo.modules.swallowvision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import org.opencv.video.Video
import kotlin.math.*

class SwallowVisionModule : Module() {
  private val lock = Any()
  private var landmarker: FaceLandmarker? = null
  private var previous: Mat? = null
  private var lastTime = 0L

  override fun definition() = ModuleDefinition {
    Name("SwallowVision")
    AsyncFunction("resetAsync") { synchronized(lock) { reset() } }
    AsyncFunction("analyzeFrameAsync") { base64: String, timestamp: Double ->
      synchronized(lock) { analyze(base64, timestamp.toLong()) }
    }
    OnDestroy {
      synchronized(lock) { reset(); landmarker?.close(); landmarker = null }
    }
  }

  private fun reset() { previous?.release(); previous = null; lastTime = 0 }
  private fun result(status: String, time: Long, features: List<Double>? = null,
    overlay: Map<String, Any>? = null): Map<String, Any> {
    val output = mutableMapOf<String, Any>("status" to status, "timestamp" to time.toDouble())
    if (features != null) output["features"] = features
    if (overlay != null) output["overlay"] = overlay
    return output
  }

  private fun detector(): FaceLandmarker {
    landmarker?.let { return it }
    check(OpenCVLoader.initLocal()) { "OPENCV_UNAVAILABLE" }
    val context = appContext.reactContext ?: error("CONTEXT_UNAVAILABLE")
    val options = FaceLandmarker.FaceLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetPath("face_landmarker.task").build())
      .setRunningMode(RunningMode.IMAGE).setNumFaces(1)
      .setMinFaceDetectionConfidence(0.6f).setMinFacePresenceConfidence(0.6f).build()
    return FaceLandmarker.createFromOptions(context, options).also { landmarker = it }
  }

  private fun analyze(encoded: String, time: Long): Map<String, Any> {
    require(encoded.length <= 6_000_000) { "FRAME_TOO_LARGE" }
    val detector = detector()
    val bytes = Base64.decode(encoded.substringAfter("base64,", encoded), Base64.DEFAULT)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 2_500_000) { "FRAME_TOO_LARGE" }
    val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("FRAME_DECODE_FAILED")
    val targetHeight = (source.height * 320.0 / source.width).roundToInt()
    val bitmap = Bitmap.createScaledBitmap(source, 320, targetHeight, true)
    val image = BitmapImageBuilder(bitmap).build()
    val rgba = Mat(); val gray = Mat()
    try {
      val face = detector.detect(image).faceLandmarks().firstOrNull()
      if (face == null || face.size < 455) { reset(); return result("lost", time) }
      Utils.bitmapToMat(bitmap, rgba); Imgproc.cvtColor(rgba, gray, Imgproc.COLOR_RGBA2GRAY)
      val width = gray.cols(); val height = gray.rows()
      val left = min(face[234].x(), face[454].x()).toDouble() * width
      val right = max(face[234].x(), face[454].x()).toDouble() * width
      val top = face[10].y().toDouble() * height
      val chin = face[152].y().toDouble() * height
      val fw = right - left; val fh = chin - top; val center = (left + right) / 2
      val noseOffset = abs(face[1].x() * width - center) / max(fw, 1.0)
      if (fw < 32 || fh < 32 || top < 1 || chin + fh * 0.6 >= height || left < 1 || right >= width - 1) { reset(); return result("lost", time) }
      if (noseOffset > 0.22) { reset(); return result("turn", time) }
      val overlay = mapOf<String, Any>("width" to width, "height" to height,
        "landmarks" to face.map { listOf(it.x().toDouble(), it.y().toDouble()) })
      val old = previous
      val dt = (time - lastTime) / 1000.0
      if (old == null || old.size() != gray.size() || dt <= 0 || dt > 0.4) {
        previous?.release(); previous = gray.clone(); lastTime = time
        return result("warming", time, overlay = overlay)
      }
      fun rect(x0: Double, y0: Double, x1: Double, y1: Double) = Rect(
        max(1, floor(x0).toInt()), max(1, floor(y0).toInt()),
        max(2, floor(x1 - x0).toInt()), max(2, floor(y1 - y0).toInt()))
      val head = flow(old, gray, rect(left + fw * 0.15, top, right - fw * 0.15, top + fh * 0.35))
      val neckTop = chin - fh * 0.04; val neckHeight = fh * 0.64
      val motions = (0..2).map { band -> flow(old, gray, rect(center - fw * 0.28,
        neckTop + neckHeight * band / 3, center + fw * 0.28, neckTop + neckHeight * (band + 1) / 3)) }
      if (head[3] < 0.3 || motions.any { it[3] < 0.3 }) { reset(); return result("lost", time) }
      val mouthRect = rect(left + fw * 0.25, top + fh * 0.6, right - fw * 0.25, top + fh * 0.9)
      val mouthOld = old.submat(mouthRect); val mouthNew = gray.submat(mouthRect); val diff = Mat()
      val mouth = try { Core.absdiff(mouthOld, mouthNew, diff); Core.mean(diff).`val`[0] / 255.0 }
        finally { mouthOld.release(); mouthNew.release(); diff.release() }
      val scale = 1.0 / (fw * dt)
      val features = motions.map { -(it[1] - head[1]) * scale } +
        listOf(motions[0][2] * scale, mouth, -head[1] * scale)
      previous?.release(); previous = gray.clone(); lastTime = time
      return result("tracking", time, features.map { it.coerceIn(-10.0, 10.0) }, overlay)
    } finally {
      image.close(); rgba.release(); gray.release()
      if (bitmap !== source) bitmap.recycle()
      source.recycle()
    }
  }

  private fun flow(old: Mat, next: Mat, box: Rect): DoubleArray {
    val points = mutableListOf<Point>()
    for (y in box.y + 2 until box.y + box.height - 2 step 4)
      for (x in box.x + 2 until box.x + box.width - 2 step 4) points.add(Point(x.toDouble(), y.toDouble()))
    if (points.size < 3) return doubleArrayOf(0.0, 0.0, 0.0, 0.0)
    val before = MatOfPoint2f(*points.toTypedArray()); val after = MatOfPoint2f()
    val status = MatOfByte(); val error = MatOfFloat()
    try {
      Video.calcOpticalFlowPyrLK(old, next, before, after, status, error, Size(15.0, 15.0), 2,
        TermCriteria(TermCriteria.COUNT + TermCriteria.EPS, 20, 0.03))
      val destinations = after.toArray(); val good = status.toArray(); val errors = error.toArray()
      var sx = 0.0; var sy = 0.0; var magnitude = 0.0; var count = 0
      for (i in points.indices) if (good[i].toInt() != 0 && errors[i] < 30 && destinations[i].x.isFinite() && destinations[i].y.isFinite()) {
        val dx = destinations[i].x - points[i].x; val dy = destinations[i].y - points[i].y
        sx += dx; sy += dy; magnitude += hypot(dx, dy); count++
      }
      return if (count < 3) doubleArrayOf(0.0, 0.0, 0.0, 0.0) else doubleArrayOf(sx / count, sy / count, magnitude / count, count.toDouble() / points.size)
    } finally { before.release(); after.release(); status.release(); error.release() }
  }
}
