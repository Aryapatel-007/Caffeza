import { useTheme } from '../../context/ThemeProvider.jsx';
import { printLogo } from '../../features/brand/brand.js';

/**
 * The restaurant's logo. P22, DESIGN-SYSTEM sections 4d and 15.
 *
 * The one component that draws a logo; a design guard fails the build on an
 * `<img>` anywhere else. The image is shown whole, at its own proportions:
 * never recoloured, filtered, inverted, cropped or stretched.
 *
 * Which logo: the one made for the ground it sits on. A day screen is a light
 * ground and wants `LIGHT_GROUND`; a night screen or the sign-in brand panel
 * is a dark ground and wants `DARK_GROUND`. When that slot is empty the other
 * logo is shown on a plate of its own ground: a dark-ground logo on `brand`,
 * a light-ground logo on the light plate, with an 8px radius. The plate has no
 * padding of its own: a logo file carries its own margin. With no logo at
 * all, the wordmark is drawn as text, exactly as before P22.
 *
 * `shape`:
 *   `lockup`, the full logo at `height` pixels tall, for top bars and the
 *     sign-in panel;
 *   `mark`, a square tile `height` pixels on each side with a 10px radius,
 *     the logo contained in it on its plate, for the top of the rail.
 *
 *   `paper`, the logo that prints above a bill, shown whole above the receipt
 *     preview at the width the className gives it, or nothing with no logo.
 *
 * `ground` defaults to the theme: `light` by day, `dark` by night.
 *
 * `slot` shows exactly that slot's logo with no fallback and nothing at all
 * when it is empty: the Appearance page's preview of each slot.
 */
export default function BrandLogo({ shape = 'lockup', height = 40, ground, slot, maxWidth, textClassName = 'type-heading', className = '' }) {
  const { theme, brand, name } = useTheme();
  const surface = ground ?? (theme === 'night' ? 'dark' : 'light');

  if (shape === 'paper') {
    const source = printLogo(brand);
    if (!source) return null;
    return <img src={source} alt={name} draggable={false} className={`block h-auto object-contain ${className}`} />;
  }

  const forThis = surface === 'dark' ? brand.logos?.DARK_GROUND : brand.logos?.LIGHT_GROUND;
  const forOther = surface === 'dark' ? brand.logos?.LIGHT_GROUND : brand.logos?.DARK_GROUND;
  const logo = slot
    ? (brand.logos?.[slot]?.dataUrl ? brand.logos[slot] : null)
    : forThis?.dataUrl ? forThis : forOther?.dataUrl ? forOther : null;

  if (!logo) {
    if (slot) return null;
    return <span className={`${textClassName} truncate ${className}`}>{name}</span>;
  }

  const isDarkArtwork = logo === brand.logos?.LIGHT_GROUND;
  const plate = isDarkArtwork ? 'bg-plate-light' : 'bg-brand';
  const needsPlate = logo !== forThis || shape === 'mark';

  const image = (
    <img
      src={logo.dataUrl}
      alt={name}
      draggable={false}
      className="block h-full w-auto max-w-full object-contain"
    />
  );

  if (shape === 'mark') {
    return (
      <span
        className={`flex flex-none items-center justify-center overflow-hidden rounded-[10px] p-1 ${plate} ${className}`}
        style={{ width: height, height }}
      >
        {image}
      </span>
    );
  }

  return (
    <span
      className={`flex flex-none items-center overflow-hidden rounded-lg ${needsPlate ? plate : ''} ${className}`}
      style={{ height, maxWidth }}
    >
      {image}
    </span>
  );
}
