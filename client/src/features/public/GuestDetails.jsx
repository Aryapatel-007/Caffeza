/**
 * Name, phone, note and the offers box, shared by ordering and booking. P23.
 *
 * The offers box is unticked by default and its sentence is the server's,
 * versioned, so what a guest agreed to can be shown later.
 */
export function GuestDetails({ site, details, onChange, notePlaceholder }) {
  const set = (field) => (event) => onChange((current) => ({ ...current, [field]: event.target.value }));
  const phoneOk = details.phone === '' || /^[6-9]\d{9}$/.test(details.phone);
  const field = 'type-body min-h-12 w-full rounded-lg border-2 border-masala/25 bg-cream px-3 text-masala focus:border-masala';
  return (
    <div className="grid gap-4">
      <label className="grid gap-1">
        <span className="type-label">Your name</span>
        <input autoComplete="name" maxLength={60} value={details.name} onChange={set('name')} className={field} />
      </label>
      <label className="grid gap-1">
        <span className="type-label">Mobile number</span>
        <span className="flex items-stretch gap-2">
          <span aria-hidden="true" className="flex min-h-12 items-center rounded-lg border-2 border-masala/25 bg-saffron-tint px-3 font-anek font-[700]">
            +91
          </span>
          <input
            autoComplete="tel-national"
            inputMode="numeric"
            maxLength={10}
            value={details.phone}
            onChange={(event) => onChange((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '') }))}
            aria-invalid={!phoneOk || undefined}
            className={field}
          />
        </span>
        <span className={`type-caption ${phoneOk ? 'text-masala-soft' : 'text-alert'}`}>
          {phoneOk ? 'The cafe calls this number if anything changes.' : 'Enter a 10 digit mobile number.'}
        </span>
      </label>
      <label className="grid gap-1">
        <span className="type-label">Note, optional</span>
        <input maxLength={200} value={details.note} onChange={set('note')} placeholder={notePlaceholder} className={field} />
      </label>
      <label className="flex min-h-12 items-start gap-3">
        <input
          type="checkbox"
          checked={details.consent}
          onChange={(event) => onChange((current) => ({ ...current, consent: event.target.checked }))}
          className="mt-1 size-5 flex-none accent-[var(--color-stall)]"
        />
        <span className="type-body">{site.consentText}</span>
      </label>
    </div>
  );
}

/**
 * A field people never see and bots fill in. Off-screen rather than hidden,
 * and out of the tab order. The server refuses any request where it has text.
 */
export function Honeypot({ value, onChange }) {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label>
        Website
        <input tabIndex={-1} autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  );
}
