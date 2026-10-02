/**
 * Cafezza's logo, served from our own build like the fonts, never fetched from
 * another site at the till.
 *
 * - `LOGO`: the square original, beige lettering on the brand brown.
 * - `LOGO_WIDE`: the same, cropped to the lettering, for the top bar.
 * - `LOGO_PRINT`: black on white, for thermal paper on the printed bill.
 *
 * Every restaurant shows Cafezza's logo until a logo can be uploaded per
 * restaurant, which is a later prompt. Caffeza is the only restaurant today.
 */
import logo from '../../assets/brand/cafezza-logo.jpg';
import logoPrint from '../../assets/brand/cafezza-logo-print.png';
import logoWide from '../../assets/brand/cafezza-logo-wide.jpg';

export const LOGO = logo;
export const LOGO_WIDE = logoWide;
export const LOGO_PRINT = logoPrint;
