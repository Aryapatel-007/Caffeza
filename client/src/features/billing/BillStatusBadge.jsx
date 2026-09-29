import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { STATUS_LABELS } from './labels.js';

/**
 * A bill's status: UNPAID, PAID, or VOIDED. A thin wrapper over the shared
 * `StatusBadge`, which M4's stock state badge also uses -- one component, two
 * modules' words. English only here, not the Gujarati pairing `labels.js`
 * also carries: that pairing is for the handful of words a cashier actively
 * acts on, and a two-line stack does not fit a compact status pill.
 */
const FACES = {
  UNPAID: { icon: '○', label: STATUS_LABELS.UNPAID.en, classes: 'border-steel/50 text-steel' },
  PAID: { icon: '✓', label: STATUS_LABELS.PAID.en, classes: 'border-patta bg-patta-tint text-ink' },
  VOIDED: { icon: '✕', label: STATUS_LABELS.VOIDED.en, classes: 'border-mirch text-mirch' },
};

export default function BillStatusBadge({ bill, size = 'md', className = '' }) {
  const state = bill.isVoided ? 'VOIDED' : bill.status;
  return <StatusBadge state={state} faces={FACES} size={size} className={className} />;
}
