package expo.modules.cafehce

sealed interface TagEvent {
  data class Read(val offerId: String) : TagEvent
  class Written(val offerId: String, val message: ByteArray) : TagEvent
}

class ApduResult(val response: ByteArray, val events: List<TagEvent>)

/** Stateful protocol engine; HceRuntime serializes access, independently of Android. */
class Type4TagEmulator(private val maxNdefFileSize: Int = 1024) {
  init {
    require(maxNdefFileSize in 3..0xffff) { "NDEF file size must fit an unsigned 16-bit value" }
  }

  var armedOfferId: String? = null
    private set

  private val capabilityContainer = byteArrayOf(
    0x00, 0x0f, 0x20, 0x00, 0xff.toByte(), 0x00, 0xff.toByte(),
    0x04, 0x06, 0xe1.toByte(), 0x04,
    (maxNdefFileSize ushr 8).toByte(), maxNdefFileSize.toByte(), 0x00, 0x00
  )
  private var ndefFile = ByteArray(maxNdefFileSize)
  private var applicationSelected = false
  private var selectedFile: Int? = null
  private var returnedBytes = BooleanArray(0)
  private var remainingReadBytes = 0
  private var readEmitted = false
  private var contentModified = false

  fun arm(offerId: String, ndefMessage: ByteArray) {
    require(ndefMessage.isNotEmpty()) { "NDEF message must not be empty" }
    require(ndefMessage.size <= maxNdefFileSize - 2) { "NDEF message is too large" }
    val file = ByteArray(maxNdefFileSize)
    file[0] = (ndefMessage.size ushr 8).toByte()
    file[1] = ndefMessage.size.toByte()
    ndefMessage.copyInto(file, 2)
    ndefFile = file
    armedOfferId = offerId
    returnedBytes = BooleanArray(2 + ndefMessage.size)
    remainingReadBytes = returnedBytes.size
    readEmitted = false
    contentModified = false
    onDeactivated()
  }

  fun disarm() {
    armedOfferId = null
    ndefFile = ByteArray(maxNdefFileSize)
    returnedBytes = BooleanArray(0)
    remainingReadBytes = 0
    readEmitted = false
    contentModified = false
    onDeactivated()
  }

  fun onDeactivated() {
    applicationSelected = false
    selectedFile = null
  }

  fun process(apdu: ByteArray): ApduResult {
    val command = parse(apdu) ?: return status(0x6700)
    if (command.cla != 0) return status(0x6e00)
    return when (command.ins) {
      0xa4 -> select(command)
      0xb0 -> read(command)
      0xd6 -> update(command)
      else -> status(0x6d00)
    }
  }

  private fun select(command: Command): ApduResult {
    if (command.p2 != 0x00 && command.p2 != 0x0c) return status(0x6a86)
    return when (command.p1) {
      0x04 -> {
        onDeactivated()
        if (armedOfferId == null || !command.data.contentEquals(NDEF_AID)) {
          status(0x6a82)
        } else {
          applicationSelected = true
          status(0x9000)
        }
      }
      0x00 -> {
        selectedFile = null
        if (!applicationSelected) return status(0x6a82)
        if (command.data.size != 2) return status(0x6700)
        val file = (unsigned(command.data[0]) shl 8) or unsigned(command.data[1])
        if (file != CC_FILE && file != NDEF_FILE) return status(0x6a82)
        selectedFile = file
        status(0x9000)
      }
      else -> status(0x6a86)
    }
  }

  private fun read(command: Command): ApduResult {
    val file = when (selectedFile) {
      CC_FILE -> capabilityContainer
      NDEF_FILE -> ndefFile
      else -> return status(0x6986)
    }
    if (command.p1 and 0x80 != 0) return status(0x6b00)
    val length = command.le ?: return status(0x6700)
    if (command.data.isNotEmpty()) return status(0x6700)
    val offset = command.offset
    if (offset >= file.size) return status(0x6b00)
    val end = minOf(offset + length, file.size)
    val events = if (selectedFile == NDEF_FILE && !contentModified && !readEmitted) {
      for (index in offset until minOf(end, returnedBytes.size)) {
        if (!returnedBytes[index]) {
          returnedBytes[index] = true
          remainingReadBytes--
        }
      }
      if (remainingReadBytes == 0) {
        readEmitted = true
        listOf(TagEvent.Read(requireNotNull(armedOfferId)))
      } else emptyList()
    } else emptyList()
    return ApduResult(file.copyOfRange(offset, end) + statusBytes(0x9000), events)
  }

  private fun update(command: Command): ApduResult {
    when (selectedFile) {
      null -> return status(0x6986)
      CC_FILE -> return status(0x6982)
    }
    if (command.data.isEmpty()) return status(0x6700)
    val offset = command.offset
    if (offset + command.data.size > maxNdefFileSize) return status(0x6a84)
    command.data.copyInto(ndefFile, offset)
    contentModified = true
    val nlen = (unsigned(ndefFile[0]) shl 8) or unsigned(ndefFile[1])
    val events = if (offset < 2 && nlen > 0 && nlen <= maxNdefFileSize - 2) {
      listOf(TagEvent.Written(requireNotNull(armedOfferId), ndefFile.copyOfRange(2, 2 + nlen)))
    } else emptyList()
    return ApduResult(statusBytes(0x9000), events)
  }

  private class Command(
    val cla: Int,
    val ins: Int,
    val p1: Int,
    val p2: Int,
    val data: ByteArray,
    val le: Int?
  ) {
    val offset: Int get() = (p1 shl 8) or p2
  }

  private fun parse(apdu: ByteArray): Command? {
    if (apdu.size < 4) return null
    val data: ByteArray
    val le: Int?
    when (apdu.size) {
      4 -> { data = ByteArray(0); le = null }
      5 -> { data = ByteArray(0); le = readLength(apdu[4]) }
      else -> {
        val lc = unsigned(apdu[4])
        // A zero Lc introduces extended APDUs, which this short-APDU tag rejects.
        if (lc == 0 || (apdu.size != 5 + lc && apdu.size != 6 + lc)) return null
        data = apdu.copyOfRange(5, 5 + lc)
        le = if (apdu.size == 6 + lc) readLength(apdu.last()) else null
      }
    }
    return Command(unsigned(apdu[0]), unsigned(apdu[1]), unsigned(apdu[2]), unsigned(apdu[3]), data, le)
  }

  private fun status(code: Int) = ApduResult(statusBytes(code), emptyList())
  private fun statusBytes(code: Int) = byteArrayOf((code ushr 8).toByte(), code.toByte())
  private fun unsigned(byte: Byte) = byte.toInt() and 0xff
  private fun readLength(byte: Byte) = unsigned(byte).let { if (it == 0) 256 else it }

  private companion object {
    const val CC_FILE = 0xe103
    const val NDEF_FILE = 0xe104
    val NDEF_AID = byteArrayOf(0xd2.toByte(), 0x76, 0x00, 0x00, 0x85.toByte(), 0x01, 0x01)
  }
}
