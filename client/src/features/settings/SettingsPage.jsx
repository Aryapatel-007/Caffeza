import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { changedSettings, getSettings, updateSettings } from '../../api/settings.js';
import { errorMessage } from './errorCopy.js';
import { clockToMinutes, minutesToClock } from './timeOfDay.js';

/**
 * A section of the form. Four of them, one per group in the contract.
 */
function Section({ title, description, children }) {
  return (
    <section className="border-t-2 border-ink pt-5">
      <h2 className="text-[17px] font-semibold leading-6">{title}</h2>
      {description && <p className="mt-1 text-[13px] leading-[18px] text-steel">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

/**
 * A labelled on/off row.
 *
 * A checkbox rather than a toggle switch: this is a desktop back-office screen,
 * not the tablet availability board, and a checkbox with a label reads
 * unambiguously without needing colour to say which way is on.
 */
function Checkbox({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-1 h-5 w-5 rounded border-2 border-ink text-chana focus:ring-2 focus:ring-chana disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span>
        <span className="text-[15px] leading-5">{label}</span>
        {hint && <span className="block text-[13px] leading-[18px] text-steel">{hint}</span>}
      </span>
    </label>
  );
}

/** Said next to the two settings that are stored and not yet read by anything. */
function NotYetWired() {
  return (
    <p className="text-[13px] leading-[18px] text-steel">
      Saved now, and takes effect once billing is updated to read it.
    </p>
  );
}

/**
 * The settings screen. Owner only, and the server is what enforces that.
 *
 * Four sections, one per group in the contract. The form loads the current
 * settings, keeps the loaded copy alongside the edited one, and sends only the
 * difference: an audit line per field is the point of this endpoint, and a
 * patch carrying fields nobody touched would fill the log with lines saying a
 * value was set to itself.
 *
 * A reason is required and the form will not submit without one. That is not a
 * client-side nicety; the server refuses the patch too, and both refuse for the
 * same reason. An owner changing the GST pricing mode with nothing recorded
 * about why is the exact gap the audit log exists to close.
 */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState(null);

  const query = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  /**
   * The loaded copy is what the diff is taken against, so it is replaced only
   * when the server answers, never as the owner types.
   */
  const original = query.data ?? null;

  useEffect(() => {
    if (original) setForm(structuredClone(original));
  }, [original]);

  const save = useMutation({
    mutationFn: updateSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      setForm(structuredClone(saved));
      setReason('');
      setToast({ tone: 'success', message: 'Settings saved.' });
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  if (query.isLoading || !form) {
    return (
      <main className="min-h-full bg-paper p-6">
        <Spinner label="Loading settings" />
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="min-h-full bg-paper p-6">
        <p className="text-[15px] text-mirch">{errorMessage(query.error)}</p>
        <Button className="mt-4" onClick={() => query.refetch()}>
          Try again
        </Button>
      </main>
    );
  }

  const set = (group, field) => (value) =>
    setForm((current) => ({ ...current, [group]: { ...current[group], [field]: value } }));

  const patch = changedSettings(original, form);
  const changedCount = Object.values(patch).reduce(
    (total, group) => total + Object.keys(group).length,
    0,
  );
  const canSave = changedCount > 0 && reason.trim().length > 0 && !save.isPending;

  const submit = (event) => {
    event.preventDefault();
    if (!canSave) return;
    save.mutate({ reason: reason.trim(), ...patch });
  };

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b-2 border-ink px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-[20px] font-semibold leading-7">Settings</h1>
          <p className="text-[13px] leading-[18px] text-steel">
            How this restaurant is configured. Every change is recorded with who made it and why.
          </p>
        </div>
      </header>

      <form onSubmit={submit} className="mx-auto grid max-w-2xl gap-6 px-4 py-6 pb-32">
        <Section
          title="Business day"
          description="When one day's takings stop and the next day's start. A restaurant that serves past midnight counts those sales under the day service began."
        >
          <Input
            label="The business day starts at"
            type="time"
            value={minutesToClock(form.business.businessDayStartsAtMinutes)}
            onChange={(event) => {
              const minutes = clockToMinutes(event.target.value);
              // A half-typed time is ignored rather than sent as a wrong number.
              if (minutes !== null) set('business', 'businessDayStartsAtMinutes')(minutes);
            }}
            hint="India time. Changing this moves which day future sales and shifts are counted under."
          />
        </Section>

        <Section title="Tax">
          <Select
            label="Menu prices are"
            value={form.tax.pricingMode}
            onChange={(event) => set('tax', 'pricingMode')(event.target.value)}
            options={[
              { value: 'EXCLUSIVE', label: 'Before GST (GST added at billing)' },
              { value: 'INCLUSIVE', label: 'After GST (GST already in the price)' },
            ]}
          />
          <NotYetWired />

          <Input
            label="Default GST rate on a new dish (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.tax.defaultTaxRateBps / 100}
            onChange={(event) => {
              const percent = Number(event.target.value);
              if (!Number.isFinite(percent)) return;
              // Basis points on the wire. 5% is 500, and the rounding keeps a
              // typed 5.005 from becoming a fraction of a basis point.
              set('tax', 'defaultTaxRateBps')(Math.round(percent * 100));
            }}
            hint="Filled in when a new dish is added without its own rate. Dishes that already exist keep the rate they were created with."
          />

          <Checkbox
            label="Round the bill total to the nearest rupee"
            checked={form.tax.roundOffEnabled}
            onChange={set('tax', 'roundOffEnabled')}
          />
          <NotYetWired />
        </Section>

        <Section
          title="Receipt"
          description="Printed on the customer's bill. Nothing prints these yet; they are collected now so the printer setup has them when it arrives."
        >
          <Input
            label="Header line 1"
            maxLength={40}
            value={form.receipt.headerLine1 ?? ''}
            onChange={(event) => set('receipt', 'headerLine1')(event.target.value)}
            hint="Up to 40 characters. A longer line wraps on a thermal roll and breaks the layout."
          />
          <Input
            label="Header line 2"
            maxLength={40}
            value={form.receipt.headerLine2 ?? ''}
            onChange={(event) => set('receipt', 'headerLine2')(event.target.value)}
          />
          <Input
            label="Footer"
            maxLength={200}
            value={form.receipt.footerText ?? ''}
            onChange={(event) => set('receipt', 'footerText')(event.target.value)}
            hint="Up to 200 characters."
          />

          <Checkbox
            label="Print the GSTIN"
            checked={form.receipt.showGstin}
            onChange={set('receipt', 'showGstin')}
          />
          <Checkbox
            label="Print the FSSAI licence number"
            checked={form.receipt.showFssai}
            onChange={set('receipt', 'showFssai')}
          />
          <Checkbox
            label="Print who took the order"
            checked={form.receipt.showServerName}
            onChange={set('receipt', 'showServerName')}
          />
        </Section>

        <Section title="Inventory">
          <Checkbox
            label="Show low stock alerts"
            hint="Switching this off hides the low-stock list and the dashboard panel. Stock levels are still tracked exactly as before."
            checked={form.inventory.lowStockAlertsEnabled}
            onChange={set('inventory', 'lowStockAlertsEnabled')}
          />
        </Section>

        {/*
          The reason sits with the save button rather than at the top, because
          it is part of committing the change, not part of describing it.
        */}
        <div className="fixed inset-x-0 bottom-0 border-t-2 border-ink bg-paper px-4 py-3">
          <div className="mx-auto grid max-w-2xl gap-3">
            <Input
              label="Why are you changing this?"
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Recorded against every change you just made"
              error={
                changedCount > 0 && reason.trim().length === 0
                  ? 'A reason is required before this can be saved.'
                  : undefined
              }
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] leading-[18px] text-steel">
                {changedCount === 0
                  ? 'No changes yet.'
                  : `${changedCount} ${changedCount === 1 ? 'change' : 'changes'} to save.`}
              </p>
              <Button type="submit" disabled={!canSave} isLoading={save.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </form>

      <Toast
        tone={toast?.tone}
        message={toast?.message}
        onDismiss={() => setToast(null)}
      />
    </main>
  );
}
