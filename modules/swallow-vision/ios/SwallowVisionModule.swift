import ExpoModulesCore
import MediaPipeTasksVision
import UIKit
import ImageIO

public final class SwallowVisionModule: Module {
  private var detector: FaceLandmarker?
  private let motion = SKMotionAnalyzer()
  private let queue = DispatchQueue(label: "keeper.vision", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("SwallowVision")
    AsyncFunction("resetAsync") { self.motion.reset() }.runOnQueue(queue)
    AsyncFunction("analyzeFrameAsync") { (encoded: String, timestamp: Double) -> [String: Any] in
      return try self.analyze(encoded, timestamp)
    }.runOnQueue(queue)
  }

  private func landmarker() throws -> FaceLandmarker {
    if let detector { return detector }
    let owner = Bundle(for: SwallowVisionModule.self)
    guard let bundleURL = owner.url(forResource: "SwallowVisionModels", withExtension: "bundle"),
          let bundle = Bundle(url: bundleURL),
          let path = bundle.path(forResource: "face_landmarker", ofType: "task") else {
      throw NSError(domain: "SwallowVision", code: 1, userInfo: [NSLocalizedDescriptionKey: "FACE_MODEL_MISSING"])
    }
    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.runningMode = .image
    options.numFaces = 1
    options.minFaceDetectionConfidence = 0.6
    options.minFacePresenceConfidence = 0.6
    let created = try FaceLandmarker(options: options)
    detector = created
    return created
  }

  private func analyze(_ encoded: String, _ timestamp: Double) throws -> [String: Any] {
    guard encoded.count <= 6_000_000,
          let data = Data(base64Encoded: encoded.components(separatedBy: "base64,").last ?? encoded),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width * height <= 2_500_000,
          let image = UIImage(data: data) else {
      throw NSError(domain: "SwallowVision", code: 2, userInfo: [NSLocalizedDescriptionKey: "FRAME_DECODE_FAILED"])
    }
    // Normalize EXIF orientation once so landmarks and OpenCV see identical pixels.
    let format = UIGraphicsImageRendererFormat(); format.scale = 1
    let size = CGSize(width: 320, height: 320 * image.size.height / image.size.width)
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let upright = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    let result = try landmarker().detect(image: MPImage(uiImage: upright))
    guard let face = result.faceLandmarks.first else {
      motion.reset()
      return ["status": "lost", "timestamp": timestamp]
    }
    let landmarks = face.map { [NSNumber(value: $0.x), NSNumber(value: $0.y)] }
    return motion.analyze(image: upright, landmarks: landmarks, timestamp: timestamp) as? [String: Any] ?? ["status": "lost", "timestamp": timestamp]
  }
}
