package expo.modules.cafehce

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

class CafeHceService : HostApduService() {
  override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray = try {
    HceRuntime.process(commandApdu ?: ByteArray(0))
  } catch (_: Throwable) {
    byteArrayOf(0x6f, 0x00)
  }

  override fun onDeactivated(reason: Int) {
    try {
      HceRuntime.onDeactivated()
    } catch (_: Throwable) {
      // Android must always be able to tear down an RF session.
    }
  }
}
