import Money from '../../components/ui/Money.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { describeReason, LINE_CANCEL_REASONS } from '../orders/cancelReasons.js';

/**
 * Each change to a bill before payment, oldest first. P29 Part B.
 *
 * The same number, so the bill's history is here rather than in the voided
 * bills: what came off or went on, the total before and after, and whether the
 * guest had already been shown the printed bill.
 */
export default function RevisionTimeline({ revisions }) {
  if (revisions.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="type-label mb-2 text-muted">Changed before payment</p>
      <ol className="flex flex-col gap-2">
        {revisions.map((revision) => {
          const items = revision.lines
            .map((line) => `${line.quantity} × ${line.variantName ? `${line.itemName} (${line.variantName})` : line.itemName}`)
            .join(', ');
          const reason = describeReason(LINE_CANCEL_REASONS, revision.reasonCode, revision.note);
          return (
            <li key={revision.revision} className="rounded-lg border border-line px-3 py-2">
              <p className="type-body">
                {revision.kind === 'REMOVED' ? 'Removed' : 'Added'}: {items}
              </p>
              <p className="type-caption text-muted">
                <span className="type-num-meta">{formatTimeIst(revision.at)}</span>
                {' · '}
                <Money paise={revision.previousGrandTotalInPaise} /> to <Money paise={revision.newGrandTotalInPaise} />
                {revision.wasPrinted ? ' · after printing' : ''}
                {reason ? ` · ${reason}` : ''}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
