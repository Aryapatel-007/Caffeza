import StateChip from './StateChip.jsx';

/**
 * REMOVED IN P20B. Version 1's availability stamp, now a thin wrapper over
 * `StateChip` so the back-office screens that still import it (the menu
 * builder, the availability board, the clock screen) draw the version 2 chip
 * until P20B moves them across. The rotated stamp is retired: a signature
 * element should carry information, and rotation carried none.
 *
 * `kind`: `availability` reads Available / Out of stock, `clock` reads In / Out.
 */
const KINDS = {
  availability: { positive: ['ok', 'Available'], negative: ['alert', 'Out of stock'] },
  clock: { positive: ['ok', 'In'], negative: ['free', 'Out'] },
};

export default function AvailabilityStamp({ state, kind = 'availability', onToggle, size = 'md', disabled = false, className = '' }) {
  const set = KINDS[kind] ?? KINDS.availability;
  const [chipState, word] = state === 'available' ? set.positive : set.negative;
  const chipSize = size === 'xl' || size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md';
  return (
    <StateChip
      state={chipState}
      word={word}
      size={chipSize}
      onClick={onToggle}
      disabled={disabled}
      ariaLabel={onToggle ? `${word}. Tap to change.` : undefined}
      className={className}
    />
  );
}
