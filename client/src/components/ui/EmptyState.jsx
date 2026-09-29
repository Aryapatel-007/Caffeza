/**
 * The nothing-here state.
 *
 * Distinct from loading and from failure. A brand new restaurant has an empty
 * menu, an empty stock list and no orders, and every one of those screens
 * needs to say what to do next rather than showing a blank rectangle that
 * looks like a bug.
 */
export default function EmptyState({ title, description, action, className = '' }) {
  return (
    <div
      className={`rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center ${className}`}
    >
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
