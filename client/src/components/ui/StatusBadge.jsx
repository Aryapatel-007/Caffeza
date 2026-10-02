import StateChip from './StateChip.jsx';

/**
 * REMOVED IN P20B. Version 1's generic status badge, now a thin wrapper over
 * `StateChip` for the one back-office screen that still imports it (stock).
 *
 * `faces` maps a state key to `{ state, label }`, where `state` is one of the
 * six `StateChip` states.
 */
export default function StatusBadge({ state, faces, size = 'md', className = '' }) {
  const face = faces[state] ?? faces[Object.keys(faces)[0]];
  return <StateChip state={face.state ?? 'free'} word={face.label} size={size === 'lg' ? 'md' : 'sm'} className={className} />;
}
