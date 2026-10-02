/**
 * The browser tab: the restaurant's name as the title and its logo as the icon.
 * P22, DESIGN-SYSTEM section 15.
 *
 * The icon is the logo placed, whole and unaltered, in the middle of a square
 * plate: the brand colour behind a logo for dark grounds, the light plate
 * behind one for light grounds, which is how the rail draws it too. Placing it
 * on a plate is not editing it: nothing is recoloured, filtered, cropped or
 * stretched. With no logo the tab keeps the browser's own icon.
 */
const ICON_ID = 'brand-icon';
const ICON_SIZE = 64;
/** Room around the artwork, as a share of the side. */
const ICON_PADDING = 0.08;

const cssColour = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function squareIcon(dataUrl, plate) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext('2d');
  context.fillStyle = plate;
  context.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  // Contained: the whole logo fits, at its own proportions.
  const room = ICON_SIZE * (1 - 2 * ICON_PADDING);
  const scale = Math.min(room / image.naturalWidth, room / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (ICON_SIZE - width) / 2, (ICON_SIZE - height) / 2, width, height);
  return canvas.toDataURL('image/png');
}

let lastIconSource = null;

export async function setBrowserTab({ title, brand }) {
  document.title = title;

  const dark = brand?.logos?.DARK_GROUND?.dataUrl ?? null;
  const light = brand?.logos?.LIGHT_GROUND?.dataUrl ?? null;
  const source = dark ?? light;
  const plate = dark ? brand.brandHex || cssColour('--brand') : cssColour('--plate-light');
  const key = source ? `${source.length}:${source.slice(-64)}:${plate}` : null;
  if (key === lastIconSource) return;
  lastIconSource = key;

  const existing = document.getElementById(ICON_ID);
  if (!source) {
    existing?.remove();
    return;
  }
  try {
    const href = await squareIcon(source, plate);
    const link = existing ?? Object.assign(document.createElement('link'), { id: ICON_ID, rel: 'icon', type: 'image/png' });
    link.href = href;
    if (!existing) document.head.appendChild(link);
  } catch {
    // A logo the browser cannot draw leaves the tab's own icon in place.
  }
}
