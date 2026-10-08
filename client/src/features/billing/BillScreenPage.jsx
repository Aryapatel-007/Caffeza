import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { BackIcon, PrintIcon } from '../../components/ui/icons/index.jsx';
import Button from '../../components/ui/Button.jsx';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import {
  applyDiscount,
  correctPayment,
  getBill,
  recordPayment,
  applyAdvance,
  voidBill,
} from '../../api/bills.js';
import { chargeToAccount, createAccount } from '../../api/accounts.js';
import { listPaymentMethods } from '../../api/paymentMethods.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatBasisPoints } from '../../utils/formatMoney.js';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { ROLES } from '../users/roles.js';
import Bilingual from '../i18n/Bilingual.jsx';
import BillStatusBadge from './BillStatusBadge.jsx';
import ChargeToAccountPanel from './ChargeToAccountPanel.jsx';
import CorrectPaymentPanel from './CorrectPaymentPanel.jsx';
import DiscountPanel from './DiscountPanel.jsx';
import { discountReasonLabel } from './discountReasons.js';
import { errorMessage } from './errorCopy.js';
import InlinePayment from './InlinePayment.jsx';
import { methodsForBill, paymentMethodName } from './paymentMethodsForBill.js';
import { printBill } from '../printing/printBill.js';
import { useTheme } from '../../context/ThemeProvider.jsx';
import { useDeviceSettings } from '../printing/useDeviceSettings.js';
import VoidBillPanel from './VoidBillPanel.jsx';
import { BILL_VOID_REASONS, describeReason } from '../orders/cancelReasons.js';
import { placeLabel } from '../orders/orderLabel.js';

const CAN_DISCOUNT_OR_VOID = [ROLES.OWNER, ROLES.MANAGER];

/**
 * One bill. The screen a cashier looks at more than any other in this module,
 * so the total is the largest thing on it.
 *
 * Which action is primary changes with the bill's own state, and that is the
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
  const [justPaid, setJustPaid] = useState(false);

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
      // DESIGN-SYSTEM section 10: the one moment of celebration.
      if (updated.status === 'PAID') setJustPaid(true);
      setToast({
        tone: 'success',
        message: updated.status === 'PAID' ? 'Payment recorded. Bill paid in full.' : 'Payment recorded.',
      });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  // P24. The advance paid online goes on the bill first, with one tap.
  const advanceMutation = useMutation({
    mutationFn: () => applyAdvance(billId),
    onSuccess: (updated) => {
      invalidate(updated);
      if (updated.status === 'PAID') setJustPaid(true);
      const refunded = updated.advanceRefundedInPaise > 0 ? ` ${moneyText(updated.advanceRefundedInPaise)} of the advance was refunded to the guest.` : '';
      setToast({
        tone: 'success',
        message: (updated.status === 'PAID' ? 'Online advance applied. Bill paid in full.' : 'Online advance applied. Collect the rest.') + refunded,
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

  // P05. The printer belongs to this device, not to whoever signs in.
  const [device] = useDeviceSettings();
  const { brand } = useTheme();

  const print = async () => {
    setPrinting(true);
    try {
      // P25. A thermal receipt, or a full A4 or A5 tax invoice, by this device's printer.
      await printBill(billId, { printer: device.printer, logoDataUrl: brand.logos?.LIGHT_GROUND?.dataUrl ?? null });
    } catch (error) {
      setToast({ tone: 'error', message: errorMessage(error) });
    } finally {
      setPrinting(false);
    }
  };

  if (billQuery.isPending) {
    return (
      <main className="v2 flex min-h-full items-center justify-center bg-ground">
        <Spinner label="Loading the bill" />
      </main>
    );
  }

  if (billQuery.isError) {
    return (
      <main className="v2 flex min-h-full flex-col items-start gap-3 bg-ground px-4 py-6">
        <p className="type-body text-alert">{errorMessage(billQuery.error)}</p>
        <Link to="/floor" className="type-caption underline">
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

  // Paid or On Hold, the next useful thing is the printed bill; unpaid, it is the payment.
  const printIsPrimary = !bill.isVoided && !isSettleable;

  return (
    <main className="v2 min-h-full bg-ground px-4 py-4 text-ink lg:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/bills"
              aria-label="All bills"
              className="flex size-12 flex-none items-center justify-center rounded-lg border border-line bg-surface hover:bg-sunken"
            >
              <BackIcon />
            </Link>
            <div>
              <h1 className="type-title">{placeLabel(bill)}</h1>
              <p className="type-caption text-muted">
                Bill <span className="type-num-meta text-ink">{bill.billNumber}</span> · business date{' '}
                <span className="type-num-meta">{bill.businessDate}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canDiscount && (
              <ActionButton onClick={() => setPanel('discount')}>
                <Bilingual k="applyDiscount" />
              </ActionButton>
            )}
            {canCharge && <ActionButton onClick={() => setPanel('charge')}>Charge to account</ActionButton>}
            <ActionButton primary={printIsPrimary} onClick={() => print()} disabled={printing}>
              <PrintIcon />
              <Bilingual k="printReceipt" />
            </ActionButton>
            <Link
              to={`/bills/${bill.id}/receipt`}
              className="type-label flex min-h-12 items-center rounded-lg px-3 text-accent underline-offset-4 hover:underline"
            >
              Receipt preview
            </Link>
            {canVoid && (
              <button
                type="button"
                onClick={() => setPanel('void')}
                className="flex min-h-12 items-center rounded-lg px-3 text-alert hover:bg-alert-tint"
              >
                <Bilingual k="voidBill" />
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* The bill, as it prints. */}
          <article className="rounded-[10px] border border-line bg-surface p-4 sm:p-6 lg:col-span-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="type-label text-muted">Tax invoice</p>
                <p className="type-num-tile">{bill.billNumber}</p>
              </div>
              <BillStatusBadge bill={bill} size="lg" />
            </div>

            <dl className="mb-4 grid grid-cols-2 gap-3 border-y border-line py-3 sm:grid-cols-3">
              <Meta label="Table or order" value={placeLabel(bill)} />
              {bill.captainName && <Meta label="Captain" value={bill.captainName} />}
              {bill.guestCount != null && <Meta label="Covers" value={String(bill.guestCount)} mono />}
              <div className="col-span-2 flex items-center justify-between sm:col-span-3">
                <dt className="type-caption text-muted">Time issued</dt>
                <dd className="type-num-meta">
                  {formatDateIst(bill.billedAt)} · {formatTimeIst(bill.billedAt)}
                </dd>
              </div>
            </dl>

            {/* P04. Why it was voided: the fixed reason's label and the note. */}
            {bill.isVoided && (
              <p className="type-body mb-4 rounded-lg border border-line border-l-[3px] border-l-alert px-3 py-2">
                Voided: {describeReason(BILL_VOID_REASONS, bill.voidReasonCode, bill.voidReason) ?? 'no reason recorded'}
              </p>
            )}

            <div className="flex justify-between pb-1 type-label text-muted">
              <span>Item</span>
              <span>Line total</span>
            </div>
            <ul className="divide-y divide-line">
              {bill.lines.map((line) => (
                <li key={line.orderLineId} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="type-body line-clamp-2 break-words" title={line.itemName}>
                      <span className="type-num mr-2">{line.quantity}</span>
                      {line.itemName}
                      {line.variantName ? ` (${line.variantName})` : ''}
                    </p>
                    {line.addOnNames.length > 0 && <p className="type-caption pl-6 text-muted">+ {line.addOnNames.join(', ')}</p>}
                    <p className="type-num-meta pl-6 text-muted">
                      {line.quantity} × <Money paise={line.unitPriceInPaise} />
                    </p>
                  </div>
                  <Money paise={line.lineTotalInPaise} size="num" tabular />
                </li>
              ))}
            </ul>

            <dl className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
              <Row label="Item total" value={<Money paise={bill.subtotalInPaise} />} />
              {bill.discount && (
                <Row
                  label={
                    bill.discount.kind === 'PERCENT'
                      ? `Discount (${formatBasisPoints(bill.discount.rateBps)}) — ${discountText(bill.discount)}`
                      : `Discount — ${discountText(bill.discount)}`
                  }
                  value={`− ${moneyText(bill.discount.amountInPaise)}`}
                />
              )}
              {bill.taxBreakdown.map((slab) => (
                <div key={slab.taxRateBps} className="flex flex-col gap-1">
                  <Row label={`CGST @ ${formatBasisPoints(slab.taxRateBps / 2)}`} value={<Money paise={slab.cgstInPaise} />} />
                  <Row label={`SGST @ ${formatBasisPoints(slab.taxRateBps / 2)}`} value={<Money paise={slab.sgstInPaise} />} />
                </div>
              ))}
              {bill.roundOffInPaise !== 0 && <Row label="Round-off" value={<Money paise={bill.roundOffInPaise} />} />}
            </dl>

            {/* The bill total, the largest thing on this screen. */}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t-2 border-ink pt-3">
              <span className="type-heading">Bill total</span>
              <Money
                key={justPaid ? 'paid' : 'shown'}
                paise={bill.grandTotalInPaise}
                size="hero"
                className={justPaid ? 'inline-block origin-right animate-[total-settle_160ms_ease-out]' : ''}
              />
            </div>

            {/* P09. On Hold: who it is charged to, and how much. */}
            {bill.status === 'ON_ACCOUNT' && !bill.isVoided && bill.account && (
              <p className="type-body mt-3">
                On Hold on <span className="font-semibold">{bill.account.accountName}</span>:{' '}
                <Money paise={bill.chargedToAccountInPaise} tabular size="num" />
              </p>
            )}

            {bill.payments.length > 0 && (
              <div className="mt-4">
                <p className="type-label mb-2 text-muted">Payments</p>
                <ul className="flex flex-col gap-2">
                  {bill.payments.map((payment) => (
                    <li key={payment.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="type-body">
                          {paymentMethodName(payment)}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                        </span>
                        <Money paise={payment.amountInPaise} tabular size="num" />
                      </div>
                      {(payment.corrections ?? []).map((change) => (
                        <p key={`${change.at}-${change.toMethod}`} className="type-caption text-muted">
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
                          className="type-label min-h-12 text-accent underline underline-offset-4"
                        >
                          Change payment method
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>

          {/* Taking the payment, beside the bill. */}
          <div className="flex flex-col gap-4 lg:col-span-7">
            {isSettleable && canTakePayment && bill.advance?.available > 0 ? (
              <div className="rounded-[10px] border-2 border-ok bg-surface p-4 sm:p-6">
                <p className="type-label text-ok">Paid online</p>
                <p className="mt-1 flex flex-wrap items-baseline gap-2">
                  <Money paise={bill.advance.available} size="hero" tabular />
                </p>
                <p className="type-body mt-2 text-muted">
                  The guest paid this in advance. Apply it to the bill first.
                  {bill.advance.available > outstandingInPaise
                    ? ` The bill is ${moneyText(outstandingInPaise)}, so ${moneyText(bill.advance.available - outstandingInPaise)} goes back to the guest.`
                    : bill.advance.available < outstandingInPaise
                      ? ` Then collect the remaining ${moneyText(outstandingInPaise - bill.advance.available)}.`
                      : ''}
                </p>
                <Button size="lg" fullWidth className="mt-4" isLoading={advanceMutation.isPending} onClick={() => advanceMutation.mutate()}>
                  Apply {moneyText(Math.min(bill.advance.available, outstandingInPaise))} paid online
                </Button>
              </div>
            ) : isSettleable && canTakePayment ? (
              <InlinePayment
                methods={allowedMethods}
                outstandingInPaise={outstandingInPaise}
                isBusy={paymentMutation.isPending}
                error={paymentMutation.isError ? errorMessage(paymentMutation.error) : null}
                onConfirm={(body) => paymentMutation.mutate(body)}
              />
            ) : (
              <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-6">
                <BillStatusBadge bill={bill} size="lg" />
                <p className="type-body mt-3 text-muted">
                  {bill.isVoided
                    ? 'This bill is voided.'
                    : bill.status === 'PAID'
                      ? 'This bill is paid in full. Print it for the guest.'
                      : bill.status === 'ON_ACCOUNT'
                        ? 'This bill is on an On Hold account.'
                        : 'Nothing to collect on this bill.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {panel === 'discount' && (
        <DiscountPanel
          billNumber={bill.billNumber}
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
      <dt className="type-body text-muted">{label}</dt>
      <dd className="type-num">{value}</dd>
    </div>
  );
}

function Meta({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-muted">{label}</dt>
      <dd className={['truncate', mono ? 'type-num' : 'type-body'].join(' ')}>{value}</dd>
    </div>
  );
}

/** A header action: secondary by default, the screen's one primary when `primary`. */
function ActionButton({ primary = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'type-button flex min-h-12 items-center gap-2 rounded-lg px-4 disabled:opacity-50',
        primary ? 'bg-accent text-on-accent hover:brightness-110' : 'border border-ink bg-surface hover:bg-sunken',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
