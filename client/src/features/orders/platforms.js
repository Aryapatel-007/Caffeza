/**
 * The delivery platforms. P06.
 *
 * A mirror of server/config/platforms.js, codes and names only, with no
 * imports so a server test can load it and check the two match.
 */
export const PLATFORMS = [
  { code: 'ZOMATO', name: 'Zomato' },
  { code: 'SWIGGY', name: 'Swiggy' },
];

export function platformName(code) {
  return PLATFORMS.find((platform) => platform.code === code)?.name ?? code;
}
