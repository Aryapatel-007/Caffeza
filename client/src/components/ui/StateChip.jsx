import { DotIcon, PlateIcon, ReceiptIcon, RingIcon, TickIcon, TriangleIcon } from './icons/index.jsx';

/**
 * Any state, drawn one way. DESIGN-SYSTEM-V2 sections 4b and 9.
 *
 * Tint, icon and word together, so colour is never the only signal. Replaces
 * version 1's `StatusBadge` and the rotated availability stamp.
 *
 * The six states are fixed, and no theme or owner setting changes them:
 *   free    no colour at all: absence of colour means absence of activity
 *   open    in progress, or a caution
 *   served  food is out
 *   bill    a bill is printed and waiting to be paid
 *   alert   late, destructive, failed, out of stock
 *   ok      done, paid, available, balanced
 *
 * `word` is what the chip says. It defaults to the state's own word, and a
 * caller passes its own for the same state in another meaning ("Paid",
 * "Available", "Void"). `onClick` turns the chip into a toggle button, as the
 * availability board needs.
 */
export const STATES = Object.freeze({
  free: { word: 'Free', Icon: RingIcon, chip: 'bg-surface text-muted border-line', edge: 'border-line', bar: 'bg-line', text: 'text-muted' },
  open: { word: 'Open', Icon: DotIcon, chip: 'bg-open-tint text-open border-open', edge: 'border-open', bar: 'bg-open', text: 'text-open' },
  served: { word: 'Served', Icon: PlateIcon, chip: 'bg-served-tint text-served border-served', edge: 'border-served', bar: 'bg-served', text: 'text-served' },
  bill: { word: 'Bill printed', Icon: ReceiptIcon, chip: 'bg-bill-tint text-bill border-bill', edge: 'border-bill', bar: 'bg-bill', text: 'text-bill' },
  alert: { word: 'Late', Icon: TriangleIcon, chip: 'bg-alert-tint text-alert border-alert', edge: 'border-alert', bar: 'bg-alert', text: 'text-alert' },
  ok: { word: 'Done', Icon: TickIcon, chip: 'bg-ok-tint text-ok border-ok', edge: 'border-ok', bar: 'bg-ok', text: 'text-ok' },
});

const SIZES = {
  sm: { box: 'h-6 gap-1 px-2 type-caption', icon: 14 },
  md: { box: 'h-8 gap-1.5 px-3 type-label', icon: 16 },
  lg: { box: 'h-12 gap-2 px-4 type-button', icon: 20 },
};

export default function StateChip({ state = 'free', word, size = 'md', onClick, disabled = false, ariaLabel, className = '' }) {
  const look = STATES[state] ?? STATES.free;
  const sizing = SIZES[size] ?? SIZES.md;
  const skin = [
    'inline-flex flex-none items-center whitespace-nowrap rounded-full border',
    'transition-colors duration-200',
    look.chip,
    sizing.box,
    className,
  ].join(' ');
  const face = (
    <>
      <look.Icon size={sizing.icon} />
      <span>{word ?? look.word}</span>
    </>
  );

  if (!onClick) return <span className={skin}>{face}</span>;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${skin} min-h-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60`}
    >
      {face}
    </button>
  );
}
