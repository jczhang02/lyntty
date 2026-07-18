package dev.jczhang.lyntty.dev

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

class LynttyFileHashModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "LynttyFileHash"

  @ReactMethod
  fun sha256(uriValue: String, promise: Promise) {
    executor.execute {
      try {
        val uri = Uri.parse(uriValue)
        val input = if (uri.scheme == "file") {
          FileInputStream(requireNotNull(uri.path) { "File URI has no path" })
        } else {
          requireNotNull(context.contentResolver.openInputStream(uri)) {
            "Unable to open URI"
          }
        }
        val digest = MessageDigest.getInstance("SHA-256")
        input.use { stream ->
          val buffer = ByteArray(1024 * 1024)
          while (true) {
            val count = stream.read(buffer)
            if (count < 0) break
            if (count > 0) digest.update(buffer, 0, count)
          }
        }
        val hex = digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
        promise.resolve(hex)
      } catch (error: Throwable) {
        promise.reject("LYNTTY_SHA256_FAILED", "Failed to hash downloaded APK", error)
      }
    }
  }

  override fun invalidate() {
    executor.shutdownNow()
    super.invalidate()
  }
}
