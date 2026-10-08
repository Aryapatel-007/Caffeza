/**
 * A dish photo, resized on this device before it is sent. P24.
 *
 * Phone cameras make 4000-pixel photos of several megabytes; the server takes
 * at most 2000 pixels and 300 KB. Drawn onto a canvas at 1200 pixels on the
 * longer side and saved as WebP, a photo comes out around 100 KB and looks the
 * same on a phone. The server checks the bytes again and decides.
 */
const TARGET_SIDE = 1200;
const MIN_SIDE = 320;
const MAX_BYTES = 300 * 1024;

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));

const dataUrlOf = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/** `{ ok: true, image, previewUrl, width, height }` or `{ ok: false, message }`. */
export async function preparePhoto(file) {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    return { ok: false, message: 'This is an SVG. Choose a PNG, WebP or JPEG photo instead.' };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: 'This file is not a photo this browser can read.' };
  }
  if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE) {
    bitmap.close?.();
    return { ok: false, message: `This photo is too small. It needs to be at least ${MIN_SIDE} pixels on its shorter side.` };
  }

  const scale = Math.min(1, TARGET_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) {
      return { ok: true, image: await dataUrlOf(blob), previewUrl: URL.createObjectURL(blob), width, height };
    }
  }
  return { ok: false, message: 'This photo is still too large after resizing. Try another.' };
}
