/**
 * What an uploaded image really is, read from its bytes. P22.
 * docs/API-CONTRACT.md M20 section P22, "The file".
 *
 * The file name, a data URL prefix and anything a client says about the type
 * are never read. The type comes from the file signature and the dimensions
 * from the image header, so a text file renamed `logo.png` is refused and a
 * PNG that claims to be 10 pixels wide is measured, not believed.
 *
 * No image library: PNG, WebP and JPEG all say how big they are in the first
 * few dozen bytes, and reading those is a handful of fixed offsets. Nothing
 * here decodes pixels.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** SVG, or any XML, starts with markup once a byte-order mark and whitespace are skipped. */
function looksLikeSvg(buffer) {
  const head = buffer.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  return head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg') || /<svg[\s>]/.test(head);
}

function readPng(buffer) {
  // The first chunk of every PNG is IHDR: width and height as big-endian 32-bit.
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { contentType: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readWebp(buffer) {
  if (buffer.length < 30) return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // Lossy: a 3-byte frame tag, the start code 9D 01 2A, then 14-bit sizes.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return { contentType: 'image/webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // Lossless: the signature byte 2F, then width minus one and height minus one in 14 bits each.
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return { contentType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // Extended: the canvas width minus one and height minus one, 24-bit little-endian.
    const width = buffer.readUIntLE(24, 3) + 1;
    const height = buffer.readUIntLE(27, 3) + 1;
    return { contentType: 'image/webp', width, height };
  }
  return null;
}

/** The start-of-frame markers that carry a size. C4, C8 and CC are other things. */
const isStartOfFrame = (marker) => marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

function readJpeg(buffer) {
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    let marker = buffer[offset + 1];
    // Fill bytes: any number of FFs may sit before a marker.
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    // Markers with no length of their own.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // End of image, or the pixels, before any frame.
    if (offset + 4 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (isStartOfFrame(marker)) {
      if (offset + 9 > buffer.length) return null;
      return { contentType: 'image/jpeg', width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/**
 * `{ ok: true, contentType, width, height }` for a PNG, WebP or JPEG whose
 * header could be read, or `{ ok: false, reason }` with `reason` one of `SVG`,
 * `NOT_AN_IMAGE` or `UNREADABLE`.
 */
export function inspectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, reason: 'NOT_AN_IMAGE' };

  let found = null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    found = readPng(buffer);
  } else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    found = readWebp(buffer);
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    found = readJpeg(buffer);
  } else if (looksLikeSvg(buffer)) {
    return { ok: false, reason: 'SVG' };
  } else {
    return { ok: false, reason: 'NOT_AN_IMAGE' };
  }

  if (!found || !found.width || !found.height) return { ok: false, reason: 'UNREADABLE' };
  return { ok: true, ...found };
}

export default { inspectImage };
