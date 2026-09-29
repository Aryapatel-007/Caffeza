/**
 * A labelled number. The right form when the data is one current value, where
 * a one-bar bar chart would be the wrong one.
 *
 * `HeroFigure` is the same idea at the size a dashboard leads with. Exactly one
 * hero per view: if two numbers are both the biggest thing on screen, neither
 * is.
 *
 * Numbers are Plex Mono here, not Plex Sans. The general rule for a hero figure
 * is "the same sans as everything else, never a display or serif face", and the
 * reason behind it is that a decorative face reads as off-brand. Plex Mono is
 * not decorative in this product: DESIGN-SYSTEM section 4 makes it the face for
 * every number in every module, precisely because this software is about prices
 * and counts. Switching to Sans for report figures alone would be the
 * inconsistency, not the fix.
 *
 * `tabular-nums` is deliberately NOT applied to the large values -- equal-width
 * digits make a number like 121 look loose at display size. It is applied in
 * the table components, where columns of figures have to align.
 */
export function StatTile({ label, value, hint, className = '' }) {
  return (
    <div className={`rounded-[10px] border-2 border-ink/15 px-4 py-3 ${className}`}>
      <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
        {label}
      </p>
      <p className="mt-1 font-mono text-[24px] font-semibold leading-8 text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] leading-4 text-steel">{hint}</p>}
    </div>
  );
}

/** The one number the screen leads with. One per view. */
export function HeroFigure({ label, value, hint }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
        {label}
      </p>
      <p className="mt-1 font-mono text-[48px] font-semibold leading-none text-ink">{value}</p>
      {hint && <p className="mt-2 text-[13px] leading-[18px] text-steel">{hint}</p>}
    </div>
  );
}

export default StatTile;
