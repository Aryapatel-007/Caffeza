import { DotIcon, TickIcon, TriangleIcon } from './icons/index.jsx';

/**
 * The balance seal. DESIGN-SYSTEM section 7b, the signature of report screens.
 *
 * The first thing on every report. Quiet when every check passes:
 *   ┃ ✓ Balanced
 *   ┃   All 6 checks passed for 26 Sep 2026
 * impossible to miss when one fails: the triangle, "Does not balance", the
 * check's own message, and its links. A warning alone reads "Balanced, with 1
 * note", with the warning's message.
 *
 * `checks` is the report envelope's list: `{ id, passed, severity, message }`.
 * `scope` finishes the passing sentence ("for 26 Sep 2026"). `renderRefs`
 * draws the links behind a failed check, "Show the bills".
 */
export default function BalanceSeal({ checks, scope = null, renderRefs, className = '' }) {
  if (!checks?.length) return null;
  const failed = checks.filter((check) => !check.passed);
  const errors = failed.filter((check) => check.severity === 'ERROR');
  const notes = failed.filter((check) => check.severity !== 'ERROR');

  const kind = errors.length > 0 ? 'error' : notes.length > 0 ? 'note' : 'pass';
  const look = {
    pass: { edge: 'border-l-ok', text: 'text-ok', Icon: TickIcon, title: 'Balanced' },
    note: { edge: 'border-l-open', text: 'text-open', Icon: DotIcon, title: `Balanced, with ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` },
    error: { edge: 'border-l-alert', text: 'text-alert', Icon: TriangleIcon, title: 'Does not balance' },
  }[kind];
  const shown = kind === 'error' ? errors : notes;

  return (
    <section aria-label="Checks" className={`rounded-r-[10px] border border-line border-l-[3px] bg-surface px-4 py-3 ${look.edge} ${className}`}>
      <p className={`type-heading flex items-center gap-2 ${look.text}`}>
        <look.Icon />
        {look.title}
      </p>
      {kind === 'pass' ? (
        <p className="type-caption ml-7 text-muted">
          {checks.length === 1 ? 'The 1 check passed' : `All ${checks.length} checks passed`}
          {scope ? ` ${scope}` : ''}
        </p>
      ) : (
        <ul className="ml-7 mt-1 flex flex-col gap-1">
          {shown.map((check) => (
            <li key={check.id} className="type-body text-ink">
              {check.message}
              {renderRefs && <span className="ml-2">{renderRefs(check)}</span>}
            </li>
          ))}
          {kind === 'error' && notes.length > 0 && (
            <li className="type-caption text-muted">
              And {notes.length} {notes.length === 1 ? 'note' : 'notes'}: {notes.map((check) => check.message).join(' ')}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** The report's scope in words, under the seal. DESIGN-SYSTEM section 9. */
export function FilterSentence({ children, className = '' }) {
  if (!children) return null;
  return <p className={`type-caption text-muted ${className}`}>{children}</p>;
}
