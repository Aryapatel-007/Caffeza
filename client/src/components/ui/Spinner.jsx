/**
 * Loading. DESIGN-SYSTEM sections 10 and 13c (P22).
 *
 * A screen showing nothing while it loads looks broken, and a screen that
 * looks broken during a Friday rush costs us the account. So while a screen
 * loads, it shows its own shape: a heading's worth of placeholder and a few
 * rows, in `sunken`, still. Never a lone spinner in the middle of the page and
 * never motion that loops: P22 replaced the spinning ring this file used to
 * draw. The name stays so the screens that use it did not have to change.
 *
 * `size` sets how much of the shape to draw: `sm` one row, inline; `md` a
 * heading and three rows; `lg` a heading and six rows.
 */
const ROWS = { sm: 1, md: 3, lg: 6 };

export default function Spinner({ size = 'md', label = 'Loading', className = '' }) {
  const rows = ROWS[size] ?? ROWS.md;
  return (
    <div role="status" aria-live="polite" className={`flex w-full flex-col gap-3 ${className}`}>
      {size !== 'sm' && <span aria-hidden="true" className="block h-8 w-1/3 max-w-60 rounded-lg bg-sunken" />}
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} aria-hidden="true" className={`block h-12 rounded-lg bg-sunken ${index % 2 ? 'w-5/6' : 'w-full'}`} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
