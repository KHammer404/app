package expo.modules.swallowvision
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

internal object UsbRemoteBridge {
  val handler = Handler(Looper.getMainLooper())
  var emit: ((String) -> Unit)? = null
  var ready = false
  var foreground = true
  val pending = mutableMapOf<String, (Boolean) -> Unit>()
  val finished = linkedMapOf<String, Boolean>()
  fun complete(id: String, accepted: Boolean) {
    val finish = pending.remove(id) ?: return
    finished[id] = accepted
    if (finished.size > 128) finished.remove(finished.keys.first())
    finish(accepted)
  }
  fun stop() { ready = false; emit = null; pending.keys.toList().forEach { complete(it, false) } }
}
class RemoteSwallowReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != "com.swallowkeeper.app.REMOTE_SWALLOW") return
    if (intent.getBooleanExtra("probe", false)) { resultCode = 1; resultData = if (UsbRemoteBridge.ready) "READY" else "BUSY"; return }
    val id = intent.getStringExtra("request_id") ?: ""
    if (!Regex("^[0-9a-f]{12}$").matches(id)) { resultCode = 0; resultData = "INVALID"; return }
    UsbRemoteBridge.finished[id]?.let { resultCode = if (it) 1 else 0; resultData = "DUPLICATE"; return }
    if (!UsbRemoteBridge.ready || !UsbRemoteBridge.foreground || UsbRemoteBridge.emit == null || UsbRemoteBridge.pending.isNotEmpty()) {
      resultCode = 0; resultData = "BUSY"; return
    }
    val reply = goAsync()
    UsbRemoteBridge.pending[id] = { accepted ->
      reply.resultCode = if (accepted) 1 else 0; reply.resultData = if (accepted) "RECORDED" else "BUSY"; reply.finish()
    }
    UsbRemoteBridge.handler.postDelayed({ UsbRemoteBridge.complete(id, false) }, 5000)
    UsbRemoteBridge.emit?.invoke(id)
  }
}
class SwallowRemoteModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SwallowRemote")
    Events("onRemoteSwallow")
    AsyncFunction("startAsync") { UsbRemoteBridge.handler.post { UsbRemoteBridge.emit = { id -> sendEvent("onRemoteSwallow", mapOf("id" to id)) } } }
    AsyncFunction("stopAsync") { UsbRemoteBridge.handler.post { UsbRemoteBridge.stop() } }
    AsyncFunction("setReadyAsync") { value: Boolean -> UsbRemoteBridge.handler.post { UsbRemoteBridge.ready = value } }
    AsyncFunction("completeAsync") { id: String, accepted: Boolean -> UsbRemoteBridge.handler.post { UsbRemoteBridge.complete(id, accepted) } }
    OnActivityEntersBackground { UsbRemoteBridge.foreground = false }
    OnActivityEntersForeground { UsbRemoteBridge.foreground = true }
    OnDestroy { UsbRemoteBridge.handler.post { UsbRemoteBridge.stop() } }
  }
}
