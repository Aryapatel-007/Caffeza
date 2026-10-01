import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import {
  createPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from '../../api/paymentMethods.js';
import { PLATFORMS } from '../orders/platforms.js';
import { errorMessage } from './errorCopy.js';

/**
 * Payment methods. P08. OWNER only, like the rest of this page.
 *
 * Each method saves on its own, straight away, rather than through the page's
 * reason-and-save bar: a method is a configured record, not a setting, and the
 * server audits nothing about it. Code and kind are shown but cannot change
 * after a method is created, because payments and reports group by them.
 */
const ORDER_TYPES = [
  { value: 'DINE_IN', label: 'Dine-in' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
  { value: 'DELIVERY', label: 'Delivery' },
];

const PLATFORM_OPTIONS = [
  { value: '', label: 'None, a dine-in app like Zomato Gold' },
  ...PLATFORMS.map((platform) => ({ value: platform.code, label: `${platform.name} delivery orders` })),
];

const KIND_LABELS = { IN_HAND: 'Money in hand', PLATFORM: 'Platform money' };

const EMPTY_NEW = {
  code: '',
  name: '',
  kind: 'PLATFORM',
  orderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
  platformCode: '',
  tallyLedgerCode: '',
  commissionPercent: '',
  displayOrder: '0',
};

/** "20" or "12.5" percent to basis points; empty is "rate not set". */
function percentToBps(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  return Math.round(value * 100);
}

const bpsToPercent = (bps) => (bps === null || bps === undefined ? '' : String(bps / 100));

function toDraft(method) {
  return {
    name: method.name,
    orderTypes: [...method.orderTypes],
    platformCode: method.platformCode ?? '',
    tallyLedgerCode: method.tallyLedgerCode ?? '',
    commissionPercent: bpsToPercent(method.commissionBps),
    displayOrder: String(method.displayOrder),
    isActive: method.isActive,
  };
}

function OrderTypeChoices({ value, onChange }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-1 text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
        Order types
      </legend>
      {ORDER_TYPES.map((type) => {
        const on = value.includes(type.value);
        return (
          <button
            key={type.value}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? value.filter((entry) => entry !== type.value) : [...value, type.value])
            }
            className={[
              'min-h-11 rounded-[10px] border-2 px-3 text-[13px] font-medium',
              on ? 'border-ink bg-chana/20' : 'border-steel/40 text-steel',
            ].join(' ')}
          >
            {type.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function MethodEditor({ method, onSaved, onError }) {
  const [draft, setDraft] = useState(() => toDraft(method));
  const set = (field) => (value) => setDraft((current) => ({ ...current, [field]: value }));

  const save = useMutation({
    mutationFn: () => {
      const commissionBps = percentToBps(draft.commissionPercent);
      return updatePaymentMethod(method.id, {
        name: draft.name.trim(),
        orderTypes: draft.orderTypes,
        platformCode: draft.platformCode || null,
        tallyLedgerCode: draft.tallyLedgerCode.trim() || null,
        ...(method.kind === 'PLATFORM' && commissionBps !== undefined ? { commissionBps } : {}),
        displayOrder: Number(draft.displayOrder) || 0,
        isActive: draft.isActive,
      });
    },
    onSuccess: onSaved,
    onError,
  });

  return (
    <li className="grid gap-3 border-b-2 border-ink/10 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[13px] leading-[18px]">{method.code}</p>
        <p className="text-[12px] uppercase leading-4 tracking-[0.06em] text-steel">
          {KIND_LABELS[method.kind]}
        </p>
      </div>
      <Input label="Name" maxLength={30} value={draft.name} onChange={(e) => set('name')(e.target.value)} />
      <OrderTypeChoices value={draft.orderTypes} onChange={set('orderTypes')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Tally code"
          maxLength={20}
          value={draft.tallyLedgerCode}
          onChange={(e) => set('tallyLedgerCode')(e.target.value)}
        />
        {method.kind === 'PLATFORM' && (
          <Input
            label="Commission %"
            inputMode="decimal"
            value={draft.commissionPercent}
            onChange={(e) => set('commissionPercent')(e.target.value)}
            hint="Empty means not set."
          />
        )}
        <Input
          label="Display order"
          type="number"
          min="0"
          step="1"
          value={draft.displayOrder}
          onChange={(e) => set('displayOrder')(e.target.value)}
        />
      </div>
      {method.kind === 'PLATFORM' && (
        <Select
          label="Delivery platform"
          value={draft.platformCode}
          onChange={(e) => set('platformCode')(e.target.value)}
          options={PLATFORM_OPTIONS}
        />
      )}
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          checked={draft.isActive}
          onChange={(e) => set('isActive')(e.target.checked)}
          className="h-5 w-5 rounded border-2 border-ink text-chana focus:ring-2 focus:ring-chana"
        />
        <span className="text-[15px] leading-5">In use at the till</span>
      </label>
      <div>
        <Button type="button" onClick={() => save.mutate()} isLoading={save.isPending}>
          Save {method.name}
        </Button>
      </div>
    </li>
  );
}

function NewMethodForm({ onSaved, onError }) {
  const [draft, setDraft] = useState(EMPTY_NEW);
  const set = (field) => (value) => setDraft((current) => ({ ...current, [field]: value }));

  const create = useMutation({
    mutationFn: () => {
      const commissionBps = percentToBps(draft.commissionPercent);
      return createPaymentMethod({
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
        kind: draft.kind,
        orderTypes: draft.orderTypes,
        ...(draft.kind === 'PLATFORM'
          ? { platformCode: draft.platformCode || null, commissionBps: commissionBps ?? null }
          : {}),
        tallyLedgerCode: draft.tallyLedgerCode.trim() || null,
        displayOrder: Number(draft.displayOrder) || 0,
      });
    },
    onSuccess: () => {
      setDraft(EMPTY_NEW);
      onSaved();
    },
    onError,
  });

  return (
    <div className="grid gap-3 rounded-[10px] border-2 border-ink/20 p-3">
      <p className="text-[15px] font-semibold leading-6">Add a payment method</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Code"
          maxLength={20}
          value={draft.code}
          onChange={(e) => set('code')(e.target.value.toUpperCase())}
          hint="Like ZOMATO_GOLD. Never changes."
        />
        <Input label="Name" maxLength={30} value={draft.name} onChange={(e) => set('name')(e.target.value)} />
      </div>
      <Select
        label="Kind, never changes"
        value={draft.kind}
        onChange={(e) => set('kind')(e.target.value)}
        options={[
          { value: 'PLATFORM', label: 'Platform money, paid out later' },
          { value: 'IN_HAND', label: 'Money in hand' },
        ]}
      />
      <OrderTypeChoices value={draft.orderTypes} onChange={set('orderTypes')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Tally code"
          maxLength={20}
          value={draft.tallyLedgerCode}
          onChange={(e) => set('tallyLedgerCode')(e.target.value)}
        />
        {draft.kind === 'PLATFORM' && (
          <Input
            label="Commission %"
            inputMode="decimal"
            value={draft.commissionPercent}
            onChange={(e) => set('commissionPercent')(e.target.value)}
            hint="Empty means not set."
          />
        )}
        <Input
          label="Display order"
          type="number"
          min="0"
          step="1"
          value={draft.displayOrder}
          onChange={(e) => set('displayOrder')(e.target.value)}
        />
      </div>
      {draft.kind === 'PLATFORM' && (
        <Select
          label="Delivery platform"
          value={draft.platformCode}
          onChange={(e) => set('platformCode')(e.target.value)}
          options={PLATFORM_OPTIONS}
        />
      )}
      <div>
        <Button
          type="button"
          disabled={!draft.code.trim() || !draft.name.trim() || draft.orderTypes.length === 0}
          onClick={() => create.mutate()}
          isLoading={create.isPending}
        >
          Add method
        </Button>
      </div>
    </div>
  );
}

export default function PaymentMethodsSection({ onToast }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['payment-methods', 'all'],
    queryFn: () => listPaymentMethods({ includeInactive: true }),
  });

  const refresh = (message) => {
    queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    onToast({ tone: 'success', message });
  };
  const fail = (error) => onToast({ tone: 'error', message: errorMessage(error) });

  if (query.isPending) return <p className="text-[13px] text-steel">Loading payment methods…</p>;
  if (query.isError) return <p className="text-[13px] text-mirch">{errorMessage(query.error)}</p>;

  return (
    <div className="grid gap-4">
      <ul>
        {query.data.map((method) => (
          <MethodEditor
            key={`${method.id}-${method.updatedAt}`}
            method={method}
            onSaved={() => refresh(`${method.code} saved.`)}
            onError={fail}
          />
        ))}
      </ul>
      <NewMethodForm onSaved={() => refresh('Payment method added.')} onError={fail} />
    </div>
  );
}
