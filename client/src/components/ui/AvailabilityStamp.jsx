/**
 * The availability stamp. The signature element of this product.
 *
 * One rendering, reused everywhere a two-state badge appears: the dense builder
 * row, the big board tile, and M5's clock screen IN / OUT. Not two drawings of
 * the same idea. Spec is in docs/DESIGN-SYSTEM.md section 5.
 *
 * The label carries the state, so colour is never the only signal. Someone who
 * cannot separate red from green still reads OUT OF STOCK, or OUT.
 *
 * `kind` picks the label set. `availability` (default) reads AVAILABLE /
 * OUT OF STOCK; `clock` reads IN / OUT. `state` is `'available'` for the
 * positive state and anything else for the other one.
 */

const SIZES = {
  sm: 'border-2 px-2.5 py-1 text-[10px]',
  md: 'border-[3px] px-3.5 py-1.5 text-[11px]',
  lg: 'border-[3px] px-4 py-2 text-xs',
  xl: 'border-4 px-6 py-3 text-lg',
};

const KINDS = {
  availability: {
    positive: { label: 'AVAILABLE', fill: 'bg-patta-tint text-ink' },
    // Out of stock is a problem the kitchen needs to fix, so it wears mirch.
    negative: { label: 'OUT OF STOCK', fill: 'bg-paper text-mirch' },
  },
  clock: {
    positive: { label: 'IN', fill: 'bg-patta-tint text-ink' },
    // Being clocked out is not a problem, just the other state, so it is steel.
    negative: { label: 'OUT', fill: 'bg-paper text-steel' },
  },
};

export default function AvailabilityStamp({
  state,
  kind = 'availability',
  onToggle,
  size = 'md',
  disabled = false,
  className = '',
}) {
  const set = KINDS[kind] ?? KINDS.availability;
  const face = state === 'available' ? set.positive : set.negative;

  const skin = [
    'inline-flex items-center justify-center whitespace-nowrap rounded-full',
    'border-ink font-mono font-bold uppercase tracking-[0.08em]',
    '-rotate-6',
    face.fill,
    SIZES[size] ?? SIZES.md,
  ].join(' ');

  if (!onToggle) {
    return <span className={`${skin} ${className}`}>{face.label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={state === 'available'}
      aria-label={`${face.label}. Tap to change.`}
      className={[
        skin,
        // Press down 2px and settle. Nothing more elaborate. Reduced motion is
        // handled globally in index.css, which turns this into an instant change.
        'transition-transform duration-100 active:translate-y-0.5',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        'disabled:opacity-60',
        className,
      ].join(' ')}
    >
      {face.label}
    </button>
  );
}
