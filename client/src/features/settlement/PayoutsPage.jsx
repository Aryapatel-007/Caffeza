import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { listPayouts, recordPayout, voidPayout } from '../../api/accounts.js';
import { listPaymentMethods } from '../../api/paymentMethods.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { businessDateToday, formatBusinessDate } from '../../utils/formatDate.js';
import { formatPaise, parseRupeesToPaise } from '../../utils/formatMoney.js';
import { errorMessage } from '../billing/errorCopy.js';
import { ROLES } from '../users/roles.js';
import InlineVoid from './InlineVoid.jsx';

/**
 * Platform payouts. P09. OWNER and MANAGER.
 *
 * Money a platform sends in a batch covering some business dates, set beside
 * what it should have sent: each covered payment less its own frozen
 * commission. A negative difference is shown in `mirch`, because it means the
 * platform paid less than it owed. Payments taken while no commission was set
 * are counted separately and never estimated.
 */
function PayoutForm({ methods, onDone, onError }) {
  const today = businessDateToday();
  const [draft, setDraft] = useState({
    method: methods[0]?.code ?? '',
    periodFrom: today,
    periodTo: today,
    amount: '',
    receivedOn: today,
    reference: '',
  });
  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const amountInPaise = parseRupeesToPaise(draft.amount);

  const save = useMutation({
    mutationFn: () =>
      recordPayout({
        method: draft.method,
        periodFrom: draft.periodFrom,
        periodTo: draft.periodTo,
        amountReceivedInPaise: amountInPaise,
        receivedOn: draft.receivedOn,
        reference: draft.reference.trim(),
      }),
    onSuccess: onDone,
    onError,
  });

  return (
    <div className="grid gap-3 rounded-[10px] border-2 border-ink/20 p-3">
      <p className="text-[15px] font-semibold leading-6">Record payout</p>
      <Select
        label="Platform"
        value={draft.method}
        onChange={set('method')}
        options={methods.map((method) => ({ value: method.code, label: method.name }))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Covers business dates from" type="date" value={draft.periodFrom} onChange={set('periodFrom')} />
        <Input label="To" type="date" value={draft.periodTo} onChange={set('periodTo')} />
        <Input label="Amount received" inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={set('amount')} />
        <Input label="Reached the bank on" type="date" value={draft.receivedOn} onChange={set('receivedOn')} />
      </div>
      <Input label="Reference, optional" maxLength={100} value={draft.reference} onChange={set('reference')} />
      <div>
        <Button
          type="button"
          disabled={!draft.method || amountInPaise === null || amountInPaise < 0}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          Record payout
        </Button>
      </div>
    </div>
  );
}

export default function PayoutsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [toast, setToast] = useState(null);
  const isOwner = user?.role === ROLES.OWNER;

  const payouts = useQuery({ queryKey: ['payouts'], queryFn: () => listPayouts() });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => listPaymentMethods() });
  const platformMethods = (methods.data ?? []).filter((method) => method.kind === 'PLATFORM');

  const refresh = (message) => {
    queryClient.invalidateQueries({ queryKey: ['payouts'] });
    setToast({ tone: 'success', message });
  };
  const fail = (error) => setToast({ tone: 'error', message: errorMessage(error) });

  const voiding = useMutation({
    mutationFn: ({ id, reason }) => voidPayout(id, reason),
    onSuccess: () => refresh('Payout voided.'),
    onError: fail,
  });

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b-2 border-ink px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Platform payouts</h1>
            <p className="text-[13px] leading-[18px] text-steel">What each platform sent, against what it owed.</p>
          </div>
          <Link to="/dashboard" className="text-[13px] font-medium text-steel underline">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        {payouts.isPending && <Spinner label="Loading payouts" />}
        {payouts.isError && <p className="text-[15px] text-mirch">{errorMessage(payouts.error)}</p>}

        {payouts.isSuccess && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] leading-[18px]">
              <thead>
                <tr className="border-b-2 border-ink text-left text-[12px] uppercase tracking-[0.06em] text-steel">
                  <th className="py-2 pr-3 font-medium">Platform</th>
                  <th className="py-2 pr-3 font-medium">Period</th>
                  <th className="py-2 pr-3 text-right font-medium">Received payout</th>
                  <th className="py-2 pr-3 text-right font-medium">Expected payout</th>
                  <th className="py-2 pr-3 text-right font-medium">Payout difference</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-steel/15">
                {payouts.data.map((payout) => (
                  <tr key={payout.id} className={payout.isVoided ? 'text-steel line-through' : ''}>
                    <td className="py-2 pr-3">{payout.methodName}</td>
                    <td className="py-2 pr-3 font-mono">
                      {formatBusinessDate(payout.periodFrom)}
                      {payout.periodTo !== payout.periodFrom ? ` to ${formatBusinessDate(payout.periodTo)}` : ''}
                      {payout.rateNotSet.length > 0 && (
                        <span className="block font-sans text-[12px] text-steel no-underline">
                          {payout.rateNotSet.length} payment{payout.rateNotSet.length === 1 ? '' : 's'} with no
                          commission set, not counted
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{formatPaise(payout.amountReceivedInPaise)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{formatPaise(payout.expectedInPaise)}</td>
                    <td
                      className={[
                        'py-2 pr-3 text-right font-mono',
                        payout.differenceInPaise < 0 && !payout.isVoided ? 'text-mirch' : '',
                      ].join(' ')}
                    >
                      {formatPaise(payout.differenceInPaise)}
                    </td>
                    <td className="py-2 text-right">
                      {isOwner && !payout.isVoided && (
                        <InlineVoid
                          isBusy={voiding.isPending}
                          onConfirm={(reason) => voiding.mutate({ id: payout.id, reason })}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payouts.data.length === 0 && <p className="py-4 text-[15px] text-steel">No payouts recorded yet.</p>}
          </div>
        )}

        {methods.isSuccess && platformMethods.length === 0 && (
          <p className="text-[13px] text-steel">
            There are no platform payment methods yet. An owner adds them in Settings.
          </p>
        )}
        {platformMethods.length > 0 && (
          <PayoutForm
            key={platformMethods.map((method) => method.code).join(',')}
            methods={platformMethods}
            onDone={() => refresh('Payout recorded.')}
            onError={fail}
          />
        )}
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
