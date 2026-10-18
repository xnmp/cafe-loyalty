package expo.modules.cafehce

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.nfc.cardemulation.CardEmulation
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class CafeHceModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  // These fields are only accessed on the main thread.
  private var destroyed = false
  private var preferredActivity: WeakReference<Activity>? = null

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("React context is unavailable")

  private val eventListener: (TagEvent) -> Unit = { event ->
    when (event) {
      is TagEvent.Read -> sendEvent("onRead", mapOf("offerId" to event.offerId))
      is TagEvent.Written -> sendEvent(
        "onWrite",
        mapOf("offerId" to event.offerId, "message" to Base64.encodeToString(event.message, BASE64_FLAGS))
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CafeHce")
    Events("onRead", "onWrite")

    Function("isSupported") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION) &&
        NfcAdapter.getDefaultAdapter(context) != null
    }
    Function("isEnabled") { NfcAdapter.getDefaultAdapter(context)?.isEnabled == true }
    Function("isServiceEnabled") {
      val component = ComponentName(context, CafeHceService::class.java)
      when (context.packageManager.getComponentEnabledSetting(component)) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> {
          @Suppress("DEPRECATION")
          context.packageManager.getServiceInfo(component, PackageManager.MATCH_DISABLED_COMPONENTS).enabled
        }
        else -> false
      }
    }
    Function("openNfcSettings") {
      val ctx = context
      try {
        ctx.startActivity(Intent(Settings.ACTION_NFC_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: ActivityNotFoundException) {
        ctx.startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
    Function("setServiceEnabled") { enabled: Boolean ->
      val ctx = context
      ctx.packageManager.setComponentEnabledSetting(
        ComponentName(ctx, CafeHceService::class.java),
        if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP
      )
      onMainThread { if (enabled) preferServiceIfResumed() else releasePreferredService() }
    }
    Function("setOffer") { offerId: String, ndefBase64Url: String ->
      // Android's decoder ignores whitespace; validate the wire format before decoding.
      if (!BASE64_URL.matches(ndefBase64Url) || ndefBase64Url.length % 4 == 1) {
        throw CodedException("ERR_INVALID_NDEF", "Invalid base64url NDEF message", null)
      }
      try {
        HceRuntime.arm(offerId, Base64.decode(ndefBase64Url, BASE64_FLAGS))
      } catch (error: IllegalArgumentException) {
        throw CodedException("ERR_INVALID_NDEF", error.message ?: "Invalid NDEF message", error)
      }
      onMainThread { preferServiceIfResumed() }
    }
    Function("clearOffer") {
      HceRuntime.disarm()
      onMainThread { releasePreferredService() }
    }

    OnCreate { HceRuntime.setListener(eventListener) }
    OnDestroy {
      HceRuntime.clearListener(eventListener)
      onMainThread {
        destroyed = true
        releasePreferredService()
      }
    }
    OnActivityEntersForeground { onMainThread { preferServiceIfResumed() } }
    OnActivityEntersBackground { onMainThread { releasePreferredService() } }
  }

  // Function bodies execute synchronously on the JS thread. Only routing preference
  // changes are posted; validation/arming and their errors remain synchronous.
  private fun onMainThread(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else mainHandler.post { action() }
  }

  private fun preferServiceIfResumed() {
    if (destroyed || HceRuntime.armedOfferId == null) return
    // setPreferredService rejects a non-resumed activity; that's caught below.
    val activity = appContext.currentActivity ?: return
    try {
      val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
      if (CardEmulation.getInstance(adapter).setPreferredService(
          activity, ComponentName(activity, CafeHceService::class.java)
        )) {
        preferredActivity = WeakReference(activity)
      }
    } catch (_: Exception) {
      // Unsupported devices and OEM routing restrictions must not prevent QR use.
    }
  }

  private fun releasePreferredService() {
    val activity = preferredActivity?.get() ?: appContext.currentActivity
    preferredActivity = null
    if (activity == null) return
    try {
      val adapter = NfcAdapter.getDefaultAdapter(activity) ?: return
      CardEmulation.getInstance(adapter).unsetPreferredService(activity)
    } catch (_: Exception) {
      // Some OEMs reject preference changes during lifecycle transitions.
    }
  }

  private companion object {
    const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
    val BASE64_URL = Regex("^[A-Za-z0-9_-]*$")
  }
}
