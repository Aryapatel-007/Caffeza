import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import {
  applyDiscount,
  correctPayment,
  getBill,
  getReceipt,
  recordPayment,
  voidBill,
} from '../../api/bills.js';
import { chargeToAccount, createAccount } from '../../api/accounts.js';
import { listPaymentMethods } from '../../api/paymentMethods.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatBasisPoints, formatPaise } from '../../utils/formatMoney.js';
import { ROLES } from '../users/roles.js';
import Bilingual from './Bilingual.jsx';
import BillStatusBadge from './BillStatusBadge.jsx';
import ChargeToAccountPanel from './ChargeToAccountPanel.jsx';
import CorrectPaymentPanel from './CorrectPaymentPanel.jsx';
import DiscountPanel from './DiscountPanel.jsx';
import { discountReasonLabel } from './discountReasons.js';
import { errorMessage } from './errorCopy.js';
import { BILL_LABELS } from './labels.js';
import PaymentPanel from './PaymentPanel.jsx';
import { methodsForBill, paymentMethodName } from './paymentMethodsForBill.js';
import { charactersFor, printText } from '../printing/printText.js';
import { useDeviceSettings } from '../printing/useDeviceSettings.js';
import VoidBillPanel from './VoidBillPanel.jsx';
import { BILL_VOID_REASONS, describeReason } from '../orders/cancelReasons.js';
import { placeLabel } from '../orders/orderLabel.js';

const CAN_DISCOUNT_OR_VOID = [ROLES.OWNER, ROLES.MANAGER];

/**
 * One bill. The screen a cashier looks at more than any other in this module,
 * so the total is the largest thing on it.
 *
 * Which action is `chana` changes with the bill's own state, and that is the
 * point: DESIGN-SYSTEM's "one primary action" rule is about what is true on
 * screen right now, not a button that is hard-coded primary regardless of
 * whether it is even the next useful thing to do. Unpaid, the primary action
 * is collecting the payment. Paid, it is printing the receipt.
 */
export default function BillScreenPage() {
  const { billId } = useParams();
  const queryClient = useQueryClient();
  const { user, features } = useAuth();

  const [toast, setToast] = useState(null);
  const [panel, setPanel] = useState(null); // 'payment' | 'discount' | 'void' | 'correct' | null
  const [correcting, setCorrecting] = useState(null); // the payment whose method is being changed
  const [printing, setPrinting] = useState(false);

  const billQuery = useQuery({
    queryKey: ['bill', billId],
    queryFn: () => getBill(billId),
  });

  const bill = billQuery.data;

  // P08. The restaurant's configured methods, filtered to the ones this bill may use.
  const methodsQuery = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => listPaymentMethods(),
    staleTime: 60_000,
  });
  const allowedMethods = bill && methodsQuery.data ? methodsForBill(methodsQuery.data, bill) : [];

  const invalidate = (updated) => {
    queryClient.setQueryData(['bill', billId], updated);
    queryClient.invalidateQueries({ queryKey: ['bills'] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    if (bill?.orderId) queryClient.invalidateQueries({ queryKey: ['order', bill.orderId] });
  };

  const discountMutation = useMutation({
    mutationFn: (body) => applyDiscount(billId, body),
    onSuccess: (updated) => {
      invalidate(updated);
      setPanel(null);
      setToast({ tone: 'success', message: 'Discount applied.' });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const paymentMutation = useMutation({
    mutationFn: (body) => recordPayment(billId, body),
    onSuccess: (updated) => {
      invalidate(updated);
      setPanel(null);
      setToast({
        tone: 'success',
        message: updated.status === 'PAID' ? 'Payment recorded. Bill paid in full.' : 'Payment recorded.',
      });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const correctMutation = useMutation({
    mutationFn: ({ paymentId, body }) => correctPayment(billId, paymentId, body),
    onSuccess: (updated) => {
      invalidate(updated);
      setPanel(null);
      setCorrecting(null);
      setToast({ tone: 'success', message: 'Payment method changed.' });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  const chargeMutation = useMutation({
    mutationFn: (accountId) => chargeToAccount(billId, accountId),
    onSuccess: (updated) => {
      invalidate(updated);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setPanel(null);
      setToast({ tone: 'success', message: `On Hold on ${updated.account.accountName}. The table is free.` });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  /** "Add account" inside the charge panel. Returns the new account, or null. */
  const addAccount = async (name) => {
    try {
      return await createAccount({ name });
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
      return null;
    }
  };

  const voidMutation = useMutation({
    mutationFn: (reason) => voidBill(billId, reason),
    onSuccess: (updated) => {
      invalidate(updated);
      setPanel(null);
      setToast({ tone: 'success', message: 'Bill voided.' });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  // P05. The paper width belongs to this device, not to whoever signs in.
  const [device] = useDeviceSettings();

  const print = async () => {
    setPrinting(true);
    try {
      const { text } = await getReceipt(billId, charactersFor(device.paperMm));
      await printText(text, device.paperMm);
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    } finally {
      setPrinting(false);
    }
  };

  if (billQuery.isPending) {
    return (
      <main className="flex min-h-full items-center justify-center bg-paper">
        <Spinner label="Loading the bill" />
      </main>
    );
  }

  if (billQuery.isError) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-paper px-4 text-center">
        <p className="text-[15px] text-mirch">{errorMessage(billQuery.error)}</p>
        <Link to="/floor" className="text-[13px] font-medium underline">
          Back to the floor
        </Link>
      </main>
    );
  }

  const outstandingInPaise = bill.grandTotalInPaise - bill.amountPaidInPaise;
  const canManage = CAN_DISCOUNT_OR_VOID.includes(user?.role);
  const canTakePayment = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER].includes(user?.role);
  const isSettleable = !bill.isVoided && bill.status === 'UNPAID' && outstandingInPaise > 0;
  // P09. Managers can put what is still owed on an On Hold account.
  const canCharge = canManage && isSettleable;
  // P08: a cashier sees the panel only when the owner allows platform discounts.
  const cashierPlatformOnly =
    user?.role === ROLES.CASHIER && Boolean(features?.cashierMayApplyPlatformDiscounts);
  const canDiscount =
    (canManage || cashierPlatformOnly) &&
    !bill.isVoided &&
    bill.status === 'UNPAID' &&
    bill.amountPaidInPaise === 0;
  const canCorrect = canManage && !bill.isVoided && bill.status === 'PAID';
  const canVoid = canManage && !bill.isVoided;

  return (
    <main className="min-h-full bg-paper pb-28">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-[15px] font-semibold leading-6">{bill.billNumber}</h1>
              <BillStatusBadge bill={bill} />
            </div>
            <p className="text-[13px] leading-[18px] text-steel">
              {placeLabel(bill)} · {bill.businessDate}
            </p>
          </div>
          <Link
            to="/bills"
            className="flex h-11 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            All bills
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* P04. Why it was voided: the fixed reason's label and the note. */}
        {bill.isVoided && (
          <p className="mb-4 rounded-[10px] border-2 border-mirch/40 bg-mirch/5 px-3 py-2 text-[13px] leading-[18px] text-ink">
            Voided: {describeReason(BILL_VOID_REASONS, bill.voidReasonCode, bill.voidReason) ?? 'no reason recorded'}
          </p>
        )}

        {/* The lines. A dense list, per DESIGN-SYSTEM section 6: staff scan a
            list faster than a grid of cards, and there is nothing here to tap. */}
        <ul className="mb-4 divide-y divide-steel/15 border-y-2 border-ink/10">
          {bill.lines.map((line) => (
            <li key={line.orderLineId} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="text-[15px] leading-[22px]">
                  {line.itemName}
                  {line.variantName ? ` (${line.variantName})` : ''}
                </p>
                {line.addOnNames.length > 0 && (
                  <p className="text-[13px] leading-[18px] text-steel">
                    + {line.addOnNames.join(', ')}
                  </p>
                )}
                <p className="font-mono text-[12px] leading-4 text-steel">
                  {line.quantity} × {formatPaise(line.unitPriceInPaise)}
                </p>
              </div>
              <p className="font-mono text-[15px] leading-[22px]">
                {formatPaise(line.lineTotalInPaise)}
              </p>
            </li>
          ))}
        </ul>

        {/* Subtotal, discount, tax, round-off. */}
        <dl className="mb-4 space-y-1.5 text-[13px] leading-[18px]">
          <Row label="Subtotal" value={formatPaise(bill.subtotalInPaise)} />
          {bill.discount && (
            <Row
              label={
                bill.discount.kind === 'PERCENT'
                  ? `Discount (${formatBasisPoints(bill.discount.rateBps)}) — ${discountText(bill.discount)}`
                  : `Discount — ${discountText(bill.discount)}`
              }
              value={`− ${formatPaise(bill.discount.amountInPaise)}`}
            />
          )}
          {bill.taxBreakdown.map((slab) => (
            <div key={slab.taxRateBps}>
              <Row
                label={`CGST @ ${formatBasisPoints(slab.taxRateBps / 2)}`}
                value={formatPaise(slab.cgstInPaise)}
              />
              <Row
                label={`SGST @ ${formatBasisPoints(slab.taxRateBps / 2)}`}
                value={formatPaise(slab.sgstInPaise)}
              />
            </div>
          ))}
          {bill.roundOffInPaise !== 0 && (
            <Row label="Round off" value={formatPaise(bill.roundOffInPaise)} />
          )}
        </dl>

        {/* The total. The largest thing on this screen, per the M3 operator
            constraints: numbers carry the meaning, words support it. */}
        <div className="mb-6 flex items-baseline justify-between border-t-2 border-ink pt-3">
          <span className="text-[15px] font-semibold uppercase tracking-[0.04em]">
            {BILL_LABELS.total.en}
          </span>
          <span className="font-mono text-[40px] font-semibold leading-none text-ink">
            {formatPaise(bill.grandTotalInPaise)}
          </span>
        </div>

        {/* P09. On Hold: who it is charged to, and how much. */}
        {bill.status === 'ON_ACCOUNT' && !bill.isVoided && bill.account && (
          <p className="mb-6 rounded-[10px] border-2 border-ink/30 px-3 py-2 text-center text-[13px] leading-[18px]">
            On Hold on <span className="font-semibold">{bill.account.accountName}</span>:{' '}
            <span className="font-mono">{formatPaise(bill.chargedToAccountInPaise)}</span>
          </p>
        )}

        {outstandingInPaise > 0 && !bill.isVoided && bill.status === 'UNPAID' && (
          <p className="mb-6 text-center text-[15px] leading-[22px] text-steel">
            {BILL_LABELS.outstanding.en}:{' '}
            <span className="font-mono font-semibold text-ink">{formatPaise(outstandingInPaise)}</span>
          </p>
        )}

        {bill.payments.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              Payments
            </p>
            <ul className="space-y-1.5">
              {bill.payments.map((payment) => (
                <li key={payment.id} className="text-[13px] leading-[18px]">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {paymentMethodName(payment)}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </span>
                    <span className="font-mono">{formatPaise(payment.amountInPaise)}</span>
                  </div>
                  {(payment.corrections ?? []).map((change) => (
                    <p key={`${change.at}-${change.toMethod}`} className="text-[12px] leading-4 text-steel">
                      Changed from {change.fromMethod} to {change.toMethod}: {change.reason}
                    </p>
                  ))}
                  {canCorrect && (
                    <button
                      type="button"
                      onClick={() => {
                        setCorrecting(payment);
                        setPanel('correct');
                      }}
                      className="mt-1 min-h-[40px] text-[13px] font-medium text-steel underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
                    >
                      Change payment method
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions. Exactly one of these is chana at any moment: whichever is
            the next useful thing given the bill's current state. */}
        <div className="flex flex-col gap-2">
          {isSettleable && canTakePayment && (
            <ActionButton primary onClick={() => setPanel('payment')}>
              <Bilingual label={BILL_LABELS.recordPayment} align="center" />
            </ActionButton>
          )}

          <ActionButton
            primary={!isSettleable}
            onClick={() => print()}
            disabled={printing}
          >
            <Bilingual label={BILL_LABELS.printReceipt} align="center" />
          </ActionButton>

          {canCharge && (
            <ActionButton onClick={() => setPanel('charge')}>Charge to account</ActionButton>
          )}

          {canDiscount && (
            <ActionButton onClick={() => setPanel('discount')}>
              <Bilingual label={BILL_LABELS.applyDiscount} align="center" />
            </ActionButton>
          )}

          {canVoid && (
            <button
              type="button"
              onClick={() => setPanel('void')}
              className="min-h-[48px] rounded-[10px] border-2 border-mirch/50 text-[15px] font-semibold text-mirch focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mirch"
            >
              <Bilingual label={BILL_LABELS.voidBill} align="center" />
            </button>
          )}
        </div>
      </div>

      {panel === 'payment' && (
        <PaymentPanel
          methods={allowedMethods}
          outstandingInPaise={outstandingInPaise}
          isBusy={paymentMutation.isPending}
          error={paymentMutation.isError ? errorMessage(paymentMutation.error) : null}
          onCancel={() => setPanel(null)}
          onConfirm={(body) => paymentMutation.mutate(body)}
        />
      )}

      {panel === 'discount' && (
        <DiscountPanel
          subtotalInPaise={bill.subtotalInPaise}
          platformOnly={!canManage}
          isBusy={discountMutation.isPending}
          error={discountMutation.isError ? errorMessage(discountMutation.error) : null}
          onCancel={() => setPanel(null)}
          onConfirm={(body) => discountMutation.mutate(body)}
        />
      )}

      {panel === 'charge' && (
        <ChargeToAccountPanel
          owedInPaise={outstandingInPaise}
          isBusy={chargeMutation.isPending}
          error={chargeMutation.isError ? errorMessage(chargeMutation.error) : null}
          onCancel={() => setPanel(null)}
          onConfirm={(accountId) => chargeMutation.mutate(accountId)}
          onCreate={addAccount}
        />
      )}

      {panel === 'correct' && correcting && (
        <CorrectPaymentPanel
          payment={correcting}
          methods={allowedMethods}
          isBusy={correctMutation.isPending}
          error={correctMutation.isError ? errorMessage(correctMutation.error) : null}
          onCancel={() => {
            setPanel(null);
            setCorrecting(null);
          }}
          onConfirm={(body) => correctMutation.mutate({ paymentId: correcting.id, body })}
        />
      )}

      {panel === 'void' && (
        <VoidBillPanel
          bill={bill}
          isBusy={voidMutation.isPending}
          error={voidMutation.isError ? errorMessage(voidMutation.error) : null}
          onCancel={() => setPanel(null)}
          onConfirm={(reason) => voidMutation.mutate(reason)}
        />
      )}

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

/** P08: the fixed reason's label and the note; a discount from before P08 keeps its text. */
function discountText(discount) {
  if (!discount.reasonCode) return discount.reason ?? '';
  const label = discountReasonLabel(discount.reasonCode);
  return discount.reason ? `${label}: ${discount.reason}` : label;
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-steel">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}

function ActionButton({ primary = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-h-[56px] rounded-[10px] border-2 text-[15px] font-semibold transition-transform duration-100 active:translate-y-0.5',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        'disabled:opacity-50',
        primary ? 'border-ink bg-chana' : 'border-ink bg-paper',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
