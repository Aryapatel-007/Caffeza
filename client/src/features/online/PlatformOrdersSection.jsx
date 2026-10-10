import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { acceptPlatformOrder, listPlatformOrders, rejectPlatformOrder } from '../../api/platformOrders.js';
import Button from '../../components/ui/Button.jsx';
import Money from '../../components/ui/Money.jsx';
import ReasonPicker, { isReasonComplete, reasonBody } from '../../components/ui/ReasonPicker.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';

import { errorText } from './OnlineSheets.jsx';
import { PLATFORM_REJECT_REASONS } from './platformRejectReasons.js';
import { useLiveInterval } from '../../api/live.js';

const PREP_MINUTES = [10, 15, 20, 30, 45];
const ATTENTION_WORDS = {
  UNMAPPED_ITEMS: 'A dish is not matched to your menu yet',
  CASH_ON_DELIVERY: 'Cash on delivery: collect it by hand',
  RESTAURANT_DELIVERY: 'Your own rider delivers it',
  NO_PLATFORM_PAYMENT_METHOD: 'No payment method for this platform',
  PACKAGING_NOT_MAPPED: 'Packaging charge has no menu item',
  DAY_CLOSED: 'Cancelled on a closed day: reopen it to void the bill',
};
const HANDLED_BY_STAFF = ['CASH_ON_DELIVERY', 'RESTAURANT_DELIVERY'];
const platformName = (code) => (code === 'SWIGGY' ? 'Swiggy' : 'Zomato');

/** Minutes left to answer, said plainly. */
function answerBy(acceptBy, now) {
  if (!acceptBy) return null;
  const minutes = Math.ceil((new Date(acceptBy) - now) / 60_000);
  return minutes > 0 ? `Answer within ${minutes} min` : 'Answer now';
}

/**
 * Delivery platform orders on the incoming requests screen. P25 Part H7.
 *
 * The same screen, alert, chime and spoken line as the restaurant's own online
 * orders (P23): a platform order is labelled with its platform's name and
 * number, counts down to when it must be answered, and is accepted with a
 * preparation time or rejected with a reason. Anything that needs a person
 * first is listed, with where to fix it.
 */
export default function PlatformOrdersSection({ canDecide, onToast }) {
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const interval = useLiveInterval(15_000);
  const waiting = useQuery({
    queryKey: ['platform-orders', 'WAITING'],
    queryFn: () => listPlatformOrders({ status: 'WAITING' }),
    refetchInterval: interval,
    enabled: canDecide,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-orders'] });
    queryClient.invalidateQueries({ queryKey: ['online', 'inbox'] });
  };
  const accept = useMutation({
    mutationFn: ({ id, body }) => acceptPlatformOrder(id, body),
    onSuccess: (record) => {
      setAccepting(null);
      refresh();
      onToast({ tone: 'success', message: `${platformName(record.platformCode)} ${record.platformOrderId} accepted and sent to the kitchen.` });
    },
  });
  const reject = useMutation({
    mutationFn: ({ id, body }) => rejectPlatformOrder(id, body),
    onSuccess: (record) => {
      setRejecting(null);
      refresh();
      onToast({ tone: 'success', message: `${platformName(record.platformCode)} ${record.platformOrderId} rejected. The platform has been told.` });
    },
  });

  if (!canDecide) return null;
  const rows = waiting.data ?? [];
  if (waiting.isSuccess && rows.length === 0) return null;
  const now = new Date();

  return (
    <section className="grid gap-3" aria-label="Delivery platforms">
      <h2 className="type-heading">Delivery platforms</h2>
      {waiting.isError && <p className="type-body text-alert">{errorText(waiting.error)}</p>}
      {rows.map((record) => {
        const blocking = record.attentionReasons.filter((reason) => !HANDLED_BY_STAFF.includes(reason));
        const items = record.order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <article key={record.id} className="grid gap-3 rounded-[10px] border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="type-heading">
                {platformName(record.platformCode)} {record.platformOrderId}
              </p>
              <StateChip state={record.status === 'NEEDS_ATTENTION' ? 'alert' : 'open'} word={answerBy(record.acceptBy, now) ?? `Arrived ${formatTimeIst(record.receivedAt)}`} />
            </div>
            <ul className="type-body grid gap-1">
              {record.order.items.map((item, index) => (
                <li key={`${item.externalItemId}-${index}`} className="flex justify-between gap-3">
                  <span>
                    {item.quantity} × {item.name}
                    {item.note ? <span className="type-caption block text-muted">{item.note}</span> : null}
                  </span>
                  <Money paise={item.unitPriceInPaise * item.quantity} tabular />
                </li>
              ))}
            </ul>
            <p className="type-caption text-muted">
              {items === 1 ? '1 item' : `${items} items`} · platform total <Money paise={record.order.totalInPaise} />
              {record.order.instructions ? ` · "${record.order.instructions}"` : ''}
            </p>
            {record.attentionReasons.length > 0 && (
              <ul className="type-label grid gap-1 rounded-lg border border-alert bg-alert-tint px-3 py-2 text-alert">
                {record.attentionReasons.map((reason) => (
                  <li key={reason}>
                    {ATTENTION_WORDS[reason] ?? reason}
                    {reason === 'UNMAPPED_ITEMS' && (
                      <a href="/settings/integrations" className="ml-2 underline underline-offset-4">
                        Match it now
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setRejecting(record)}>
                Reject
              </Button>
              <Button className="flex-[2]" disabled={blocking.length > 0} onClick={() => setAccepting(record)}>
                Accept
              </Button>
            </div>
          </article>
        );
      })}

      {accepting && (
        <AcceptPlatformSheet
          record={accepting}
          isPending={accept.isPending}
          error={accept.error}
          onClose={() => setAccepting(null)}
          onAccept={(body) => accept.mutate({ id: accepting.id, body })}
        />
      )}
      {rejecting && (
        <RejectPlatformSheet
          record={rejecting}
          isPending={reject.isPending}
          error={reject.error}
          onClose={() => setRejecting(null)}
          onReject={(body) => reject.mutate({ id: rejecting.id, body })}
        />
      )}
    </section>
  );
}

function AcceptPlatformSheet({ record, isPending, error, onClose, onAccept }) {
  const [minutes, setMinutes] = useState(20);
  const handled = record.attentionReasons.some((reason) => HANDLED_BY_STAFF.includes(reason));
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Sheet
      title={`Accept ${platformName(record.platformCode)} ${record.platformOrderId}`}
      subtitle="The platform is told first. Then the order goes to the kitchen."
      onClose={onClose}
      footer={
        <SheetActions
          onCancel={onClose}
          confirmLabel={isPending ? 'Accepting…' : `Accept, ready in ${minutes} min`}
          disabled={isPending || (handled && !acknowledged)}
          onConfirm={() => onAccept({ prepMinutes: minutes, acknowledgeHandling: handled && acknowledged })}
        />
      }
    >
      <fieldset className="grid gap-2">
        <legend className="type-heading mb-1">Ready in</legend>
        <div className="flex flex-wrap gap-2">
          {PREP_MINUTES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={minutes === value}
              onClick={() => setMinutes(value)}
              className={['min-h-12 rounded-lg border px-4 type-label', minutes === value ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface'].join(' ')}
            >
              {value} min
            </button>
          ))}
        </div>
      </fieldset>
      {handled && (
        <label className="mt-4 flex min-h-12 items-start gap-3">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 size-5 accent-[var(--color-accent)]" />
          <span className="type-body">I will collect the cash or send our own rider for this order.</span>
        </label>
      )}
      {error && <p className="type-body mt-3 text-alert">{errorText(error)}</p>}
    </Sheet>
  );
}

function RejectPlatformSheet({ record, isPending, error, onClose, onReject }) {
  const [reason, setReason] = useState({ reasonCode: null, note: '' });
  return (
    <Sheet
      title={`Reject ${platformName(record.platformCode)} ${record.platformOrderId}`}
      subtitle="The platform tells the customer."
      onClose={onClose}
      footer={
        <SheetActions
          onCancel={onClose}
          confirmLabel="Reject"
          danger
          disabled={!isReasonComplete(reason) || isPending}
          onConfirm={() => onReject(reasonBody(reason))}
        />
      }
    >
      <ReasonPicker reasons={PLATFORM_REJECT_REASONS} value={reason} onChange={setReason} legend="Why" />
      {error && <p className="type-body mt-3 text-alert">{errorText(error)}</p>}
    </Sheet>
  );
}
