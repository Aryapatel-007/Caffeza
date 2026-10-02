/**
 * The restaurant's logo. P22, docs/API-CONTRACT.md M20 section P22.
 *
 * The only file that asks the server for a logo's bytes; a design guard keeps
 * it that way. Setting and removing are OWNER only on the server.
 */
import { api, downloadFile } from './client.js';

export const LOGO_SLOT_NAMES = Object.freeze(['LIGHT_GROUND', 'DARK_GROUND']);

/** `image` is the file as base64, with no `data:` prefix. */
export function uploadLogo(slot, { image, reason }) {
  return api.put(`/settings/appearance/logo/${slot}`, { image, reason });
}

export function removeLogo(slot, reason) {
  return api.delete(`/settings/appearance/logo/${slot}`, { body: { reason } });
}

/** A Blob as a `data:` URL, so it can be kept on this device and drawn before sign-in. */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** One slot's image as a `data:` URL. The server answers 404 for an empty slot. */
export async function fetchLogoDataUrl(slot) {
  const { blob } = await downloadFile(`/restaurant/logo/${slot}`);
  return blobToDataUrl(blob);
}
