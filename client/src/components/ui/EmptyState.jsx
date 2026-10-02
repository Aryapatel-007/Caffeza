/**
 * Nothing to show. DESIGN-SYSTEM section 9.
 *
 * Distinct from loading and from failure. A new restaurant has an empty menu
 * and no orders, and each of those screens says what to do next rather than
 * showing a blank rectangle that looks like a bug.
 */
export default function EmptyState({ title, description, action, className = '' }) {
  return (
    <div className={`rounded-[10px] border border-dashed border-line bg-surface px-6 py-12 ${className}`}>
      <h3 className="type-heading text-ink">{title}</h3>
      {description && <p className="type-body mt-1 max-w-md text-muted">{description}</p>}
      {action && <div className="mt-6 flex">{action}</div>}
    </div>
  );
}
