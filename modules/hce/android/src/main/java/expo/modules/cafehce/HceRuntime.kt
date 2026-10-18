package expo.modules.cafehce

/** One engine shared by the Expo module and Android-created service instances. */
object HceRuntime {
  private val lock = Any()
  private val emulator = Type4TagEmulator()
  private var listener: ((TagEvent) -> Unit)? = null

  val armedOfferId: String?
    get() = synchronized(lock) { emulator.armedOfferId }

  fun arm(offerId: String, message: ByteArray) = synchronized(lock) {
    emulator.arm(offerId, message)
  }

  fun disarm() = synchronized(lock) { emulator.disarm() }

  fun setListener(value: (TagEvent) -> Unit) = synchronized(lock) { listener = value }

  fun clearListener(value: (TagEvent) -> Unit) = synchronized(lock) {
    // A retiring JS runtime must not clear a newer runtime's listener.
    if (listener === value) listener = null
  }

  fun process(apdu: ByteArray): ByteArray = synchronized(lock) {
    val result = emulator.process(apdu)
    for (event in result.events) {
      try {
        listener?.invoke(event)
      } catch (_: Throwable) {
        // A detached JS runtime must not turn a successful NFC command into a failure.
      }
    }
    result.response
  }

  fun onDeactivated() = synchronized(lock) { emulator.onDeactivated() }
}
