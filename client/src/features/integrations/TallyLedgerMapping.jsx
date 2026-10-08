import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listAccounts } from '../../api/accounts.js';
import { saveIntegration } from '../../api/integrations.js';
import { listMenuItems } from '../../api/menu.js';
import { listPaymentMethods } from '../../api/paymentMethods.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import { errorText } from '../online/OnlineSheets.jsx';

const GROUPS = [
  ['sales', 'Sales'],
  ['tax', 'GST'],
  ['payment', 'Payment methods'],
  ['onHold', 'On Hold'],
  ['expense', 'Expenses and round-off'],
  ['income', 'Paid in'],
  ['bank', 'Bank'],
];

function Row({ label, value, onChange, disabled }) {
  return <Input label={label} value={value ?? ''} disabled={disabled} placeholder="Ledger name in Tally" onChange={(event) => onChange(event.target.value)} />;
}

/**
 * Ledger mapping. P25 Part L3, API-CONTRACT M21 section 9.2. Which Tally ledger
 * each figure goes to. The GST rates listed are the ones on the menu, plus any
 * already mapped; an export names any head still missing.
 */
export default function TallyLedgerMapping({ connection, canEdit, onToast }) {
  const queryClient = useQueryClient();
  const [ledgers, setLedgers] = useState(() => ({ onHold: { mode: 'ONE', byAccount: {} }, ...(connection.config.ledgers ?? {}) }));
  const methods = useQuery({ queryKey: ['payment-methods', 'all'], queryFn: () => listPaymentMethods({ includeInactive: false }) });
  const accounts = useQuery({ queryKey: ['accounts', 'list'], queryFn: () => listAccounts() });
  const items = useQuery({ queryKey: ['menu-items', 'rates'], queryFn: () => listMenuItems({ includeInactive: true, limit: 200 }) });
  const save = useMutation({
    mutationFn: () => saveIntegration('TALLY', { environment: connection.environment, credentials: {}, config: { ...connection.config, ledgers } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      onToast({ tone: 'success', message: 'Ledger mapping saved.' });
    },
    onError: (error) => onToast({ tone: 'error', message: errorText(error) }),
  });

  const set = (key) => (value) => setLedgers({ ...ledgers, [key]: value });
  const setIn = (group, key) => (value) => setLedgers({ ...ledgers, [group]: { ...(ledgers[group] ?? {}), [key]: value } });
  const rates = [...new Set([...(items.data?.data ?? []).map((item) => item.taxRateBps), ...Object.keys(ledgers.salesByRate ?? {}).map(Number)])]
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const methodRows = methods.data ?? [];
  const accountRows = Array.isArray(accounts.data) ? accounts.data : accounts.data?.data ?? [];
  const off = !canEdit;

  return (
    <section className="grid gap-4" aria-label="Ledger mapping">
      <h2 className="type-title">Ledger mapping</h2>
      <fieldset className="grid gap-3">
        <legend className="type-heading">Sales and GST</legend>
        {rates.map((rate) => (
          <Row key={rate} label={`Sales at ${rate / 100}%`} value={ledgers.salesByRate?.[rate]} disabled={off} onChange={setIn('salesByRate', String(rate))} />
        ))}
        <Row label="Sales where the platform pays GST" value={ledgers.platformSales} disabled={off} onChange={set('platformSales')} />
        <Row label="CGST output" value={ledgers.cgst} disabled={off} onChange={set('cgst')} />
        <Row label="SGST output" value={ledgers.sgst} disabled={off} onChange={set('sgst')} />
        <Row label="Round-off" value={ledgers.roundOff} disabled={off} onChange={set('roundOff')} />
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="type-heading">Payment methods</legend>
        {methodRows.map((method) => (
          <Row key={method.code} label={method.name} value={ledgers.paymentMethods?.[method.code]} disabled={off} onChange={setIn('paymentMethods', method.code)} />
        ))}
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="type-heading">On Hold</legend>
        <Select
          label="On Hold goes to"
          value={ledgers.onHold?.mode ?? 'ONE'}
          disabled={off}
          options={[{ value: 'ONE', label: 'One ledger for every account' }, { value: 'PER_ACCOUNT', label: 'A ledger per account' }]}
          onChange={(event) => setLedgers({ ...ledgers, onHold: { ...ledgers.onHold, mode: event.target.value } })}
        />
        {(ledgers.onHold?.mode ?? 'ONE') === 'ONE' ? (
          <Row label="On Hold" value={ledgers.onHold?.ledger} disabled={off} onChange={(value) => setLedgers({ ...ledgers, onHold: { ...ledgers.onHold, ledger: value } })} />
        ) : (
          accountRows.map((account) => (
            <Row
              key={account.id}
              label={account.name}
              value={ledgers.onHold?.byAccount?.[account.id]}
              disabled={off}
              onChange={(value) => setLedgers({ ...ledgers, onHold: { ...ledgers.onHold, byAccount: { ...(ledgers.onHold?.byAccount ?? {}), [account.id]: value } } })}
            />
          ))
        )}
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="type-heading">Cash drawer and payouts</legend>
        <Row label="Paid out" value={ledgers.paidOut} disabled={off} onChange={set('paidOut')} />
        <Row label="Paid in" value={ledgers.paidIn} disabled={off} onChange={set('paidIn')} />
        <Row label="Bank, for platform payouts" value={ledgers.bank} disabled={off} onChange={set('bank')} />
        {methodRows
          .filter((method) => method.kind === 'PLATFORM')
          .map((method) => (
            <Row key={method.code} label={`Commission for ${method.name}`} value={ledgers.commissionByMethod?.[method.code]} disabled={off} onChange={setIn('commissionByMethod', method.code)} />
          ))}
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="type-heading">Parent groups for the ledger list</legend>
        {GROUPS.map(([key, label]) => (
          <Input key={key} label={label} value={ledgers.parentGroups?.[key] ?? ''} disabled={off} placeholder="Tally's own group" onChange={(event) => setIn('parentGroups', key)(event.target.value)} />
        ))}
      </fieldset>
      {canEdit && <Button variant="secondary" className="w-fit" isLoading={save.isPending} onClick={() => save.mutate()}>Save ledger mapping</Button>}
    </section>
  );
}
