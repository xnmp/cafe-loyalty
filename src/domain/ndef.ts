import { concatBytes, utf8Decode, utf8Encode } from './bytes';

/**
 * Minimal NDEF (NFC Forum Data Exchange Format) codec for single URI records,
 * enough for the counter device to serve a token and to parse what customers
 * write back. Spec: NFC Forum NDEF 1.0 and URI RTD 1.0.
 */

const TNF_WELL_KNOWN = 0x01;
const TYPE_URI = 0x55; // 'U'
const TYPE_TEXT = 0x54; // 'T'

const FLAG_MB = 0x80;
const FLAG_ME = 0x40;
const FLAG_CF = 0x20;
const FLAG_SR = 0x10;
const FLAG_IL = 0x08;

/** URI RTD identifier codes (abbreviations), index = code. */
const URI_PREFIXES: readonly string[] = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
  'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://',
  'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:',
  'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://',
  'file://', 'urn:epc:id:', 'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:',
  'urn:nfc:',
];

export interface NdefRecord {
  readonly tnf: number;
  readonly type: Uint8Array;
  readonly payload: Uint8Array;
}

/** Encodes an NDEF message holding exactly one URI record (identifier code 0, full URI). */
export function encodeUriMessage(uri: string): Uint8Array {
  const payload = concatBytes(Uint8Array.of(0x00), utf8Encode(uri));
  const short = payload.length <= 0xff;
  const header = FLAG_MB | FLAG_ME | (short ? FLAG_SR : 0) | TNF_WELL_KNOWN;
  const length = short
    ? Uint8Array.of(payload.length)
    : Uint8Array.of((payload.length >>> 24) & 0xff, (payload.length >>> 16) & 0xff, (payload.length >>> 8) & 0xff, payload.length & 0xff);
  return concatBytes(Uint8Array.of(header, 1), length, Uint8Array.of(TYPE_URI), payload);
}

/** Parses an NDEF message into records. Returns null if the bytes are not well formed. Chunked records are rejected. */
export function decodeMessage(bytes: Uint8Array): NdefRecord[] | null {
  const records: NdefRecord[] = [];
  let i = 0;
  while (i < bytes.length) {
    const header = bytes[i++];
    if (header & FLAG_CF) return null;
    if (i >= bytes.length) return null;
    const typeLength = bytes[i++];
    let payloadLength: number;
    if (header & FLAG_SR) {
      if (i + 1 > bytes.length) return null;
      payloadLength = bytes[i++];
    } else {
      if (i + 4 > bytes.length) return null;
      payloadLength = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      i += 4;
    }
    let idLength = 0;
    if (header & FLAG_IL) {
      if (i + 1 > bytes.length) return null;
      idLength = bytes[i++];
    }
    const end = i + typeLength + idLength + payloadLength;
    if (end > bytes.length) return null;
    const type = bytes.slice(i, i + typeLength);
    const payload = bytes.slice(i + typeLength + idLength, end);
    records.push({ tnf: header & 0x07, type, payload });
    i = end;
    if (header & FLAG_ME) break;
  }
  return records.length > 0 ? records : null;
}

/** Extracts the URI from a URI record, or the text from a Text record (some writers use those for links). */
export function recordToUri(record: NdefRecord): string | null {
  if (record.tnf !== TNF_WELL_KNOWN || record.type.length !== 1 || record.payload.length === 0) return null;
  if (record.type[0] === TYPE_URI) {
    const prefix = URI_PREFIXES[record.payload[0]];
    const rest = utf8Decode(record.payload.subarray(1));
    return prefix === undefined || rest === null ? null : prefix + rest;
  }
  if (record.type[0] === TYPE_TEXT) {
    const status = record.payload[0];
    if (status & 0x80) return null; // UTF-16 text; never produced by us
    const langLength = status & 0x3f;
    return utf8Decode(record.payload.subarray(1 + langLength));
  }
  return null;
}

/** All URIs in an NDEF message, in record order. */
export function messageUris(records: readonly NdefRecord[]): string[] {
  return records.map(recordToUri).filter((u): u is string => u !== null);
}
