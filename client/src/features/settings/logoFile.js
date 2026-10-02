/**
 * The logo file, checked in the browser before it is sent. P22.
 *
 * Only so the owner hears what is wrong straight away, in the same words the
 * server uses. The server reads the bytes again and decides; nothing here is
 * trusted. The type comes from the file's first bytes, never its name.
 */
export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MAX_SIDE = 1024;
export const LOGO_MIN_SIDE = 128;

const startsWith = (bytes, signature) => signature.every((value, index) => bytes[index] === value);
const ascii = (bytes, from, to) => String.fromCharCode(...bytes.slice(from, to));

function kindOf(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const text = new TextDecoder().decode(bytes.slice(0, 512)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (text.startsWith('<?xml') || text.startsWith('<svg') || /<svg[\s>]/.test(text)) return 'svg';
  return null;
}

/** The file as base64, with no `data:` prefix. */
function base64Of(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** `{ ok: true, image, width, height }` or `{ ok: false, message }`. */
export async function checkLogoFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = kindOf(bytes);
  if (kind === 'svg') return { ok: false, message: 'This is an SVG. Upload a PNG, WebP or JPEG instead.' };
  if (!kind) return { ok: false, message: 'This file is not a PNG, WebP or JPEG image.' };
  if (bytes.length > LOGO_MAX_BYTES) {
    return { ok: false, message: `This image is ${Math.ceil(bytes.length / 1024)} KB. The largest allowed is 200 KB.` };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: kind }));
  } catch {
    return { ok: false, message: 'This file is not a PNG, WebP or JPEG image.' };
  }
  const { width, height } = bitmap;
  bitmap.close?.();
  if (Math.max(width, height) > LOGO_MAX_SIDE) {
    const [side, value] = width >= height ? ['wide', width] : ['tall', height];
    return { ok: false, message: `This image is ${value} pixels ${side}. The largest allowed is ${LOGO_MAX_SIDE}.` };
  }
  if (Math.min(width, height) < LOGO_MIN_SIDE) {
    const [side, value] = width <= height ? ['wide', width] : ['tall', height];
    return { ok: false, message: `This image is ${value} pixels ${side}. The smallest allowed is ${LOGO_MIN_SIDE}.` };
  }
  return { ok: true, image: base64Of(bytes), width, height };
}
