package expo.modules.cafehce

import java.util.Random
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class Type4TagEmulatorTest {
  private val message = hex("D101075504636166652F31")

  private fun armed(size: Int = 1024) = Type4TagEmulator(size).apply { arm("offer-1", message) }

  private fun hex(value: String): ByteArray = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

  private fun command(tag: Type4TagEmulator, value: String) = tag.process(hex(value))

  private fun assertStatus(code: String, result: ApduResult) {
    assertArrayEquals(hex(code), result.response)
    assertTrue(result.events.isEmpty())
  }

  private fun selectNdef(tag: Type4TagEmulator) {
    assertStatus("9000", command(tag, "00A4040007D276000085010100"))
    assertStatus("9000", command(tag, "00A4000C02E104"))
  }

  private fun read(tag: Type4TagEmulator, offset: Int, length: Int): ApduResult = tag.process(
    byteArrayOf(0x00, 0xb0.toByte(), (offset ushr 8).toByte(), offset.toByte(), length.toByte())
  )

  private fun write(tag: Type4TagEmulator, offset: Int, data: ByteArray): ApduResult = tag.process(
    byteArrayOf(0x00, 0xd6.toByte(), (offset ushr 8).toByte(), offset.toByte(), data.size.toByte()) + data
  )

  private fun assertRead(result: ApduResult, offerId: String = "offer-1") {
    assertEquals(1, result.events.size)
    assertEquals(TagEvent.Read(offerId), result.events.single())
  }

  private fun assertWritten(result: ApduResult, bytes: ByteArray, offerId: String = "offer-1") {
    assertArrayEquals(hex("9000"), result.response)
    assertEquals(1, result.events.size)
    val event = result.events.single()
    assertTrue(event is TagEvent.Written)
    event as TagEvent.Written
    assertEquals(offerId, event.offerId)
    assertArrayEquals(bytes, event.message)
  }

  @Test fun iphoneSequenceServesExactCapabilityContainerAndEmitsReadOnce() {
    val tag = armed()
    assertStatus("9000", command(tag, "00A4040007D276000085010100"))
    assertStatus("9000", command(tag, "00A4000C02E103"))
    val cc = command(tag, "00B000000F")
    assertArrayEquals(hex("000F2000FF00FF0406E104040000009000"), cc.response)
    assertTrue(cc.events.isEmpty())
    assertStatus("9000", command(tag, "00A4000C02E104"))
    val nlen = command(tag, "00B0000002")
    assertArrayEquals(byteArrayOf(0, message.size.toByte(), 0x90.toByte(), 0), nlen.response)
    assertTrue(nlen.events.isEmpty())
    val payload = read(tag, 2, message.size)
    assertArrayEquals(message + hex("9000"), payload.response)
    assertRead(payload)
    assertTrue(read(tag, 0, message.size + 2).events.isEmpty())
  }

  @Test fun androidSelectAcceptsP2ZeroWithoutLeAndReturnsNoFci() {
    val tag = armed()
    assertStatus("9000", command(tag, "00A4040007D2760000850101"))
    assertStatus("9000", command(tag, "00A4000002E104"))
    assertRead(read(tag, 0, message.size + 2))
  }

  @Test fun bothSelectModesAcceptP2VariantsAndOptionalLe() {
    for (p2 in listOf("00", "0C")) {
      for (le in listOf("", "00")) {
        val tag = armed()
        assertStatus("9000", command(tag, "00A404${p2}07D2760000850101$le"))
        assertStatus("9000", command(tag, "00A400${p2}02E104$le"))
      }
    }
  }

  @Test fun outOfOrderOddChunksAndOverlapsCompleteExactlyOnce() {
    val tag = armed()
    selectNdef(tag)
    // 13-byte file content: three odd-sized chunks, delivered out of order.
    assertTrue(read(tag, 5, 3).events.isEmpty())
    assertTrue(read(tag, 0, 5).events.isEmpty())
    assertTrue(read(tag, 3, 4).events.isEmpty())
    assertRead(read(tag, 8, 5))
    assertTrue(read(tag, 0, 13).events.isEmpty())
  }

  @Test fun leZeroMeans256AndReadPayloadIncludesZeroPadding() {
    val tag = armed()
    selectNdef(tag)
    val result = command(tag, "00B0000000")
    assertEquals(258, result.response.size)
    assertArrayEquals(message, result.response.copyOfRange(2, 2 + message.size))
    assertTrue(result.response.copyOfRange(2 + message.size, 256).all { it == 0.toByte() })
    assertArrayEquals(hex("9000"), result.response.takeLast(2).toByteArray())
    assertRead(result)
  }

  @Test fun readsAndWritesRequireFileSelectionAndFileSelectionRequiresApplication() {
    val tag = armed()
    assertStatus("6986", read(tag, 0, 2))
    assertStatus("6986", write(tag, 0, hex("0000")))
    assertStatus("6A82", command(tag, "00A4000C02E104"))
    assertStatus("9000", command(tag, "00A4040007D2760000850101"))
    assertStatus("6986", read(tag, 0, 2))
  }

  @Test fun disarmedAndUnknownApplicationsAreNotFound() {
    val tag = Type4TagEmulator()
    assertStatus("6A82", command(tag, "00A4040007D2760000850101"))
    tag.arm("offer-1", message)
    selectNdef(tag)
    assertStatus("6A82", command(tag, "00A4040007D2760000850102"))
    assertStatus("6986", read(tag, 0, 2))
    tag.disarm()
    assertNull(tag.armedOfferId)
    assertStatus("6A82", command(tag, "00A4040007D2760000850101"))
    assertStatus("6986", read(tag, 0, 2))
  }

  @Test fun unknownFileAndInvalidSelectParametersHaveDefinedStatuses() {
    val tag = armed()
    selectNdef(tag)
    assertStatus("6A82", command(tag, "00A4000C02E105"))
    assertStatus("6986", read(tag, 0, 2))
    assertStatus("6A86", command(tag, "00A4010002E104"))
    assertStatus("6A86", command(tag, "00A4000102E104"))
    assertStatus("6700", command(tag, "00A4000001E1"))
  }

  @Test fun readOffsetsAndMissingLeAreValidatedAndPastEndClamps() {
    val tag = armed(16)
    selectNdef(tag)
    assertStatus("6B00", read(tag, 16, 2))
    assertStatus("6B00", read(tag, 0x8000, 2))
    assertStatus("6700", command(tag, "00B00000"))
    assertStatus("6700", command(tag, "00B00000010002"))
    val clamped = read(tag, 14, 255)
    assertArrayEquals(hex("00009000"), clamped.response)
    assertTrue(clamped.events.isEmpty())
  }

  @Test fun unknownInstructionAndClassAreRejected() {
    val tag = armed()
    assertStatus("6D00", command(tag, "00FF0000"))
    assertStatus("6E00", command(tag, "80B0000001"))
  }

  @Test fun malformedAndExtendedApdusAreRejectedWithoutCrashing() {
    val tag = armed()
    for (value in listOf(
      "", "00", "00A4", "00A400", "00A4040007D276", "00D60000040000",
      "00B00000000001", "00A40400000007D2760000850101", "00D6000001000000"
    )) {
      assertStatus("6700", command(tag, value))
    }
  }

  @Test fun threeStepWriteEmitsOnlyAtNlenCommitAndReadsWrittenContent() {
    val tag = armed()
    val ack = hex("D10104550461636B")
    selectNdef(tag)
    assertStatus("9000", write(tag, 0, hex("0000")))
    assertStatus("9000", write(tag, 2, ack))
    assertWritten(write(tag, 0, byteArrayOf(0, ack.size.toByte())), ack)
    val result = read(tag, 0, 2 + ack.size)
    assertArrayEquals(byteArrayOf(0, ack.size.toByte()) + ack + hex("9000"), result.response)
    assertTrue(result.events.isEmpty())
    tag.onDeactivated()
    selectNdef(tag)
    assertTrue(read(tag, 0, 255).events.isEmpty())
  }

  @Test fun singleShotWriteAndCaseFourUpdateCommitExactMessage() {
    for (withLe in listOf(false, true)) {
      val tag = armed()
      selectNdef(tag)
      val ack = hex("D10102550061")
      val data = byteArrayOf(0, ack.size.toByte()) + ack
      val apdu = hex("00D60000") + byteArrayOf(data.size.toByte()) + data +
        (if (withLe) hex("00") else ByteArray(0))
      assertWritten(tag.process(apdu), ack)
    }
  }

  @Test fun eitherNlenByteCanCommitButZeroAndOversizeNlenNeverEmit() {
    val tag = armed(300)
    selectNdef(tag)
    assertStatus("9000", write(tag, 0, hex("0000")))
    assertStatus("9000", write(tag, 2, hex("112233")))
    assertWritten(write(tag, 1, hex("03")), hex("112233"))
    assertStatus("9000", write(tag, 0, hex("FFFF")))
    assertStatus("9000", write(tag, 0, hex("0000")))
    assertStatus("9000", write(tag, 2, ByteArray(254) { 0x55.toByte() }))
    assertWritten(write(tag, 0, hex("0100")), ByteArray(256) { if (it < 254) 0x55.toByte() else 0 })
    assertStatus("9000", write(tag, 0, hex("00")))
    assertWritten(write(tag, 1, hex("03")), hex("555555"))
    assertWritten(write(tag, 0, hex("01")), ByteArray(259) { if (it < 254) 0x55.toByte() else 0 })
  }

  @Test fun writeOverflowAndCcAccessAreRejectedWithoutChangingOffer() {
    val tag = armed(16)
    selectNdef(tag)
    assertStatus("6A84", write(tag, 15, hex("0000")))
    assertStatus("6A84", write(tag, 0x8000, hex("01")))
    assertStatus("6700", command(tag, "00D60000"))
    assertRead(read(tag, 0, 16))
    assertStatus("9000", command(tag, "00A4000C02E103"))
    assertStatus("6982", write(tag, 0, hex("0000")))
  }

  @Test fun maximumShortLcOf255IsAccepted() {
    val tag = armed()
    selectNdef(tag)
    val ack = ByteArray(253) { it.toByte() }
    assertWritten(write(tag, 0, byteArrayOf(0, 253.toByte()) + ack), ack)
  }

  @Test fun anySuccessfulUpdateStopsReadCompletionEvenIfContentUnchanged() {
    val tag = armed()
    selectNdef(tag)
    assertStatus("9000", write(tag, 2, message.copyOfRange(0, 1)))
    assertTrue(read(tag, 0, message.size + 2).events.isEmpty())
  }

  @Test fun deactivationClearsSelectionButKeepsContentAndReadDeduplication() {
    val tag = armed()
    selectNdef(tag)
    assertRead(read(tag, 0, message.size + 2))
    tag.onDeactivated()
    assertEquals("offer-1", tag.armedOfferId)
    assertStatus("6986", read(tag, 0, 2))
    assertStatus("6A82", command(tag, "00A4000C02E104"))
    selectNdef(tag)
    val result = read(tag, 2, message.size)
    assertArrayEquals(message + hex("9000"), result.response)
    assertTrue(result.events.isEmpty())
  }

  @Test fun partialReadCoverageSurvivesFieldSessions() {
    val tag = armed()
    selectNdef(tag)
    assertTrue(read(tag, 0, 2).events.isEmpty())
    tag.onDeactivated()
    selectNdef(tag)
    assertRead(read(tag, 2, message.size))
  }

  @Test fun rearmResetsReadWriteTrackingContentAndSelection() {
    val tag = armed()
    selectNdef(tag)
    assertRead(read(tag, 0, 255))
    assertWritten(write(tag, 0, hex("000111")), hex("11"))
    tag.arm("offer-2", message)
    assertStatus("6986", read(tag, 0, 2))
    selectNdef(tag)
    val result = read(tag, 0, message.size + 2)
    assertArrayEquals(byteArrayOf(0, message.size.toByte()) + message + hex("9000"), result.response)
    assertRead(result, "offer-2")
    tag.arm("offer-2", message)
    selectNdef(tag)
    assertRead(read(tag, 0, 255), "offer-2")
  }

  @Test fun messagesMustBeNonemptyAndFitIncludingNlen() {
    val tag = Type4TagEmulator(16)
    for (invalid in listOf(ByteArray(0), ByteArray(15), ByteArray(100_000))) {
      var thrown: IllegalArgumentException? = null
      try { tag.arm("invalid", invalid) } catch (error: IllegalArgumentException) { thrown = error }
      assertNotNull(thrown)
      assertNull(tag.armedOfferId)
    }
    tag.arm("fits", ByteArray(14) { 1 })
    selectNdef(tag)
    assertRead(read(tag, 0, 16), "fits")
  }

  @Test fun failedArmLeavesPreviousOfferUsable() {
    val tag = armed(16)
    selectNdef(tag)
    try { tag.arm("invalid", ByteArray(15)) } catch (_: IllegalArgumentException) { }
    assertEquals("offer-1", tag.armedOfferId)
    assertRead(read(tag, 0, 16))
  }

  @Test fun inputResponseAndEventArraysDoNotAliasEngineStorage() {
    val input = message.copyOf()
    val tag = Type4TagEmulator()
    tag.arm("offer-1", input)
    input.fill(0)
    selectNdef(tag)
    val result = read(tag, 2, message.size)
    assertArrayEquals(message + hex("9000"), result.response)
    result.response.fill(0)
    assertArrayEquals(message + hex("9000"), read(tag, 2, message.size).response)
    val written = write(tag, 0, hex("00021122")).events.single() as TagEvent.Written
    written.message.fill(0)
    assertArrayEquals(hex("11229000"), read(tag, 2, 2).response)
  }

  @Test fun seededRandomApdusNeverThrowAndAlwaysReturnStatusWords() {
    val random = Random(4132L)
    val tag = armed()
    repeat(10_000) { iteration ->
      if (iteration % 100 == 0) selectNdef(tag)
      val bytes = ByteArray(random.nextInt(600))
      random.nextBytes(bytes)
      val result = tag.process(bytes)
      assertTrue("iteration $iteration", result.response.size >= 2)
    }
  }
}
