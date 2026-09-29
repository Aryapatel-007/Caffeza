/**
 * A badge for a field with three or more named states, each read by an icon,
 * a colour and a word together -- never any one alone.
 *
 * `AvailabilityStamp` stays what DESIGN-SYSTEM.md section 5 says it is: a
 * two-state, rotated, signature element, reserved for availability and the
 * clock. This is the generic version for everything else with more than two
 * states -- M3's bill status (UNPAID/PAID/VOIDED) first, M4's stock state
 * (IN_STOCK/LOW/OUT) second, reusing this rather than each drawing its own.
 *
 * `faces` is a map of state key to `{ icon, label, classes }`. The caller
 * owns the words and the Tailwind classes; this component only owns the
 * shared shell -- sizing, the pill shape, the icon-plus-word layout -- so
 * every module's badge reads as one family of component even though the
 * meanings differ.
 */
export default function StatusBadge({ state, faces, size = 'md', className = '' }) {
  const face = faces[state] ?? faces[Object.keys(faces)[0]];
  const sizing = size === 'lg' ? 'px-3 py-1.5 text-[13px]' : 'px-2.5 py-1 text-[12px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 font-mono font-semibold uppercase tracking-[0.04em] ${sizing} ${face.classes} ${className}`}
    >
      <span aria-hidden="true">{face.icon}</span>
      {face.label}
    </span>
  );
}
