import Money from './Money.jsx';
import StateChip from './StateChip.jsx';
import TimeEdge, { ElapsedTime } from './TimeEdge.jsx';

/**
 * One table on the floor. DESIGN-SYSTEM sections 7a and 9.
 *
 *   ┌─────────────────────┐
 *   │ T 14          ● Open│
 *   │ 3 guests            │
 *   │ ₹1,240       34 min │
 *   │█████████████░░░░░░░░│  the time edge
 *   └─────────────────────┘
 *
 * The name in `tile-name`, the expanded width, so "T 14" reads across a room.
 * A free table has no state colour at all. A taken one has a 3px edge in its
 * state's colour, its chip, the guests, the amount in `num-tile`, the minutes
 * open and the time edge against the restaurant's long-open threshold.
 *
 * The whole tile is the tap target. `menu` is drawn in the top corner, outside
 * the tile's button, for the "⋯" actions.
 */
export const FLOOR_STATES = Object.freeze({
  FREE: { state: 'free', word: 'Free' },
  OPEN: { state: 'open', word: 'Open' },
  SERVED: { state: 'served', word: 'Served' },
  BILL_PRINTED: { state: 'bill', word: 'Bill printed' },
});

const EDGES = { free: 'border-line', open: 'border-open', served: 'border-served', bill: 'border-bill' };

/**
 * P48. PetPooja's Table View words and fills, which Z Chaat's staff know:
 * Blank, Running KOT (food with the kitchen), Running (served), Printed.
 * The word stays on the tile, so a state never rests on colour alone.
 */
export const PETPOOJA_WORDS = Object.freeze({ FREE: 'Blank', OPEN: 'Running KOT', SERVED: 'Running', BILL_PRINTED: 'Printed' });
const FILLS = { free: 'bg-surface', open: 'bg-open-tint', served: 'bg-served-tint', bill: 'bg-bill-tint' };

export default function TableTile({
  name,
  floorState = 'FREE',
  guestCount = null,
  amountInPaise = null,
  openedAt = null,
  targetMinutes,
  isLong = false,
  captainName = null,
  compact = false,
  shape = 'SQUARE',
  fill = false,
  onTap,
  ariaLabel,
  menu = null,
  // P23. A free table with a confirmed booking soon: "Reserved 8:00 PM, 4".
  reservedLabel = null,
  // P48. PetPooja's square tile, with its actions drawn underneath.
  square = false,
  actions = null,
}) {
  const look = FLOOR_STATES[floorState] ?? FLOOR_STATES.FREE;
  const taken = floorState !== 'FREE';
  const edge = isLong ? 'border-alert' : EDGES[look.state];

  if (square) {
    return (
      <div className="relative flex flex-col items-stretch gap-1">
        <button
          type="button"
          onClick={onTap}
          aria-label={ariaLabel}
          className={[
            'flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[10px] p-2 text-center text-ink transition-colors duration-200 hover:brightness-95',
            taken ? `${FILLS[look.state]} border-2 ${edge}` : 'border-2 border-dashed border-line bg-surface',
            isLong ? 'ring-2 ring-alert' : '',
          ].join(' ')}
        >
          <span className="type-label line-clamp-2 break-words" title={name}>
            {name}
          </span>
          {taken ? (
            <>
              <span className="type-caption font-semibold">{PETPOOJA_WORDS[floorState]}</span>
              <span className="type-caption text-muted">
                {guestCount != null ? `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}` : ''}
              </span>
              {amountInPaise != null && <Money paise={amountInPaise} className="type-caption" />}
              {isLong && <span className="type-caption font-semibold text-alert">Long</span>}
            </>
          ) : (
            reservedLabel && <span className="type-caption text-open">{reservedLabel}</span>
          )}
        </button>
        {actions}
        {menu}
      </div>
    );
  }

  return (
    <div className={`relative ${fill ? 'h-full' : ''}`}>
      <button
        type="button"
        onClick={onTap}
        aria-label={ariaLabel}
        className={[
          'relative flex w-full flex-col overflow-hidden bg-surface text-left text-ink transition-colors duration-200',
          'hover:bg-sunken',
          shape === 'ROUND' ? 'rounded-full items-center justify-center text-center' : 'rounded-[10px]',
          taken ? `border-[3px] ${edge}` : 'border border-line',
          fill ? 'h-full p-1' : compact ? 'min-h-24 gap-1 p-3' : 'min-h-36 gap-2 p-4 pb-5',
        ].join(' ')}
      >
        {fill ? (
          <PlanFace name={name} look={look} taken={taken} isLong={isLong} reservedLabel={reservedLabel} />
        ) : (
          <>
            <span className={`flex w-full items-start justify-between gap-2 ${menu ? 'pr-8' : ''}`}>
              <span className="type-tile-name line-clamp-2" title={name}>
                {name}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {!taken && reservedLabel ? (
                <StateChip state="open" word={reservedLabel} size="sm" />
              ) : (
                <StateChip state={look.state} word={look.word} size="sm" />
              )}
              {isLong && <StateChip state="alert" word="Long" size="sm" />}
            </span>
            {taken ? (
              <>
                <span className="type-caption text-muted">
                  {guestCount != null ? `${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}` : 'Guests not recorded'}
                  {!compact && captainName && ` · ${captainName}`}
                </span>
                <span className="mt-auto flex w-full flex-wrap items-end justify-between gap-x-2">
                  <Money paise={amountInPaise} size={compact ? 'num' : 'tile'} />
                  <ElapsedTime since={openedAt} targetMinutes={targetMinutes} />
                </span>
              </>
            ) : (
              !compact && <span className="type-caption mt-auto text-muted">Tap to seat guests</span>
            )}
          </>
        )}
        {taken && !fill && <TimeEdge since={openedAt} targetMinutes={targetMinutes} state={look.state} />}
      </button>
      {menu}
    </div>
  );
}

/** The small face drawn on a floor plan, where a table may be a few centimetres wide. */
function PlanFace({ name, look, taken, isLong, reservedLabel }) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
      <span className="font-anek text-[clamp(11px,1.6vw,20px)] font-[660] leading-tight [font-stretch:112%]">{name}</span>
      <span className={`flex items-center gap-1 text-[clamp(9px,0.9vw,12px)] font-semibold ${taken ? STATE_TEXT[look.state] : reservedLabel ? 'text-open' : 'text-muted'}`}>
        {!taken && reservedLabel ? reservedLabel : look.word}
        {isLong && <span className="text-alert">· Long</span>}
      </span>
    </span>
  );
}

const STATE_TEXT = { free: 'text-muted', open: 'text-open', served: 'text-served', bill: 'text-bill' };
