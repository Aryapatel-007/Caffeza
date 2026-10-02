import StateChip from '../../components/ui/StateChip.jsx';
import { LABELS } from '../i18n/labels.js';

/**
 * A bill's status through `StateChip`. DESIGN-SYSTEM section 4b.
 *
 * Unpaid is a printed bill waiting to be paid, so it wears `bill`. Paid is
 * `ok`. On Hold (P09) is money still to come, a caution, so `open`. Voided is
 * `alert`: the bill was cancelled after it was issued.
 */
const FACES = {
  UNPAID: { state: 'bill', word: LABELS.statusUnpaid },
  PAID: { state: 'ok', word: LABELS.statusPaid },
  ON_ACCOUNT: { state: 'open', word: LABELS.statusOnAccount },
  VOIDED: { state: 'alert', word: LABELS.statusVoided },
};

export default function BillStatusBadge({ bill, size = 'md', className = '' }) {
  const face = FACES[bill.isVoided ? 'VOIDED' : bill.status] ?? FACES.UNPAID;
  return <StateChip state={face.state} word={face.word} size={size === 'lg' ? 'md' : 'sm'} className={className} />;
}
