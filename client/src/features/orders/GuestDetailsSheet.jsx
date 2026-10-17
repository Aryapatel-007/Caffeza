import { useState } from 'react';

import Input from '../../components/ui/Input.jsx';
import Sheet from '../../components/ui/Sheet.jsx';

/**
 * P56. The guest's details, asked on a table's first Send to the kitchen.
 *
 * Moved here from seating (P27), where the captain is busiest. Everything is
 * optional: Skip sends the dishes without them. A mobile is ten digits, with
 * a leading 91 or 0 dropped; the offers tick needs one, and is ticked only when
 * the guest says yes.
 */
export default function GuestDetailsSheet({ placeName, isBusy, onCancel, onSave, onSkip }) {
  const [guestName, setGuestName] = useState('');
  const [mobile, setMobile] = useState('');
  const [agreed, setAgreed] = useState(false);
  const digits = mobile.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const mobileOk = digits.length === 10 && /^[6-9]/.test(digits);
  const mobileWrong = mobile.trim() !== '' && !mobileOk;
  const guest = {
    ...(guestName.trim() ? { customerName: guestName.trim() } : {}),
    ...(mobileOk ? { customerPhone: digits } : {}),
    ...(mobileOk && agreed ? { offersConsent: true } : {}),
  };
  const hasDetails = Boolean(guest.customerName || guest.customerPhone);

  return (
    <Sheet
      title="Guest details"
      onClose={onCancel}
      footer={
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!hasDetails || mobileWrong || isBusy}
            onClick={() => onSave(guest)}
            className="type-button flex min-h-14 w-full items-center justify-center rounded-lg bg-accent text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            {isBusy ? 'Sending…' : 'Save and send'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onSkip}
            className="type-label min-h-12 w-full rounded-lg text-ink hover:bg-sunken disabled:opacity-50"
          >
            Skip, send without details
          </button>
        </div>
      }
    >
      <p className="type-caption text-muted">
        Before the first KOT for {placeName}. Optional. Builds your customer list, and brings back their visits next time.
      </p>
      <div className="mt-3 grid gap-3">
        <Input label="Guest name" autoComplete="off" maxLength={100} value={guestName} onChange={(event) => setGuestName(event.target.value)} />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          value={mobile}
          error={mobileWrong ? 'A 10-digit Indian mobile number.' : undefined}
          onChange={(event) => {
            setMobile(event.target.value);
            if (!event.target.value.trim()) setAgreed(false);
          }}
        />
        <label className={['flex items-start gap-3', mobileOk ? '' : 'opacity-50'].join(' ')}>
          <input
            type="checkbox"
            checked={agreed}
            disabled={!mobileOk}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 h-5 w-5 rounded border border-line focus:ring-2 focus:ring-accent"
          />
          <span>
            <span className="type-body block">The guest agrees to offers and news by SMS or WhatsApp</span>
            <span className="type-caption block text-muted">Tick only if the guest says yes.</span>
          </span>
        </label>
      </div>
    </Sheet>
  );
}
