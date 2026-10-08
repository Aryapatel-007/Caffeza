/**
 * Takeaway from the restaurant's page. P23.
 *
 * Two steps: choose from the menu, then say who and when. The total shown is
 * the server's quote, worked out by the same arithmetic as a bill; this page
 * never adds up tax itself. Payment is at the counter.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getPublicMenu, getQuote, placeOrder } from '../../api/publicSite.js';
import Button from '../../components/ui/Button.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { MinusIcon, PlusIcon } from '../../components/ui/icons/index.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { GuestDetails, Honeypot } from './GuestDetails.jsx';
import ItemSheet from './ItemSheet.jsx';
import { SiteHeader } from './PublicSite.jsx';
import { newIdempotencyKey, rememberToken } from './guestTokens.js';

const STEP_MS = 15 * 60_000;

/** As soon as possible, then every 15 minutes until closing. */
function pickupChoices(takeaway) {
  if (!takeaway.earliestPickupAt) return [];
  const earliest = new Date(takeaway.earliestPickupAt).getTime();
  const latest = new Date(takeaway.latestPickupAt).getTime();
  const choices = [{ value: 'ASAP', label: `As soon as possible, about ${formatTimeIst(earliest)}` }];
  for (let at = Math.ceil(earliest / STEP_MS) * STEP_MS; at <= latest; at += STEP_MS) {
    if (at > earliest) choices.push({ value: new Date(at).toISOString(), label: formatTimeIst(at) });
  }
  return choices;
}

const lineKey = (line) => [line.menuItemId, line.variantId ?? '', ...(line.addOnIds ?? []).slice().sort()].join('|');

function Stepper({ quantity, onChange, label }) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <button type="button" aria-label="One fewer" onClick={() => onChange(quantity - 1)} className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface">
        <MinusIcon />
      </button>
      <span className="type-num w-8 text-center">{quantity}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(quantity + 1)} disabled={quantity >= 20} className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-50">
        <PlusIcon />
      </button>
    </div>
  );
}

function Estimate({ quote }) {
  if (quote.isPending) return <Spinner label="Working out the total" size="sm" />;
  if (quote.isError) return <p className="type-body text-alert">{quote.error.message}</p>;
  const { estimate } = quote.data;
  const row = (label, paise, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'type-heading' : 'type-body'}`}>
      <span>{label}</span>
      <Money paise={paise} tabular />
    </div>
  );
  return (
    <div className="grid gap-1 rounded-xl border border-line bg-surface p-4">
      {row('Item total', estimate.itemTotalInPaise)}
      {row('GST', estimate.gstInPaise)}
      {estimate.roundOffInPaise !== 0 && row('Round-off', estimate.roundOffInPaise)}
      {row('Estimated bill total', estimate.billTotalInPaise, true)}
      <p className="type-caption text-muted">Pay at the counter when you collect.</p>
    </div>
  );
}

export default function PublicOrder({ site, slug }) {
  const navigate = useNavigate();
  const menu = useQuery({ queryKey: ['public', 'menu', slug], queryFn: () => getPublicMenu(slug) });
  const [cart, setCart] = useState([]);
  const [choosing, setChoosing] = useState(null);
  const [step, setStep] = useState('menu');
  const [details, setDetails] = useState({ name: '', phone: '', note: '', consent: false, website: '' });
  const choices = pickupChoices(site.takeaway);
  const [pickup, setPickup] = useState('ASAP');
  const [idempotencyKey] = useState(newIdempotencyKey);

  const requestLines = useMemo(
    () =>
      cart.map((line) => ({
        menuItemId: line.menuItemId,
        ...(line.variantId ? { variantId: line.variantId } : {}),
        ...(line.addOnIds.length ? { addOnIds: line.addOnIds } : {}),
        quantity: line.quantity,
        ...(line.notes ? { notes: line.notes } : {}),
      })),
    [cart],
  );
  const quote = useQuery({
    queryKey: ['public', 'quote', slug, JSON.stringify(requestLines)],
    queryFn: () => getQuote(slug, requestLines),
    enabled: step === 'details' && requestLines.length > 0,
  });

  const place = useMutation({
    mutationFn: () =>
      placeOrder(slug, {
        idempotencyKey,
        customerName: details.name.trim(),
        customerPhone: details.phone,
        pickup,
        lines: requestLines,
        note: details.note.trim() || undefined,
        marketingConsent: details.consent,
        website: details.website,
      }),
    onSuccess: (placed) => {
      rememberToken(placed.id, placed.statusToken);
      navigate(`/r/${slug}/order/${placed.id}`, { replace: true });
    },
  });

  const add = (line) =>
    setCart((current) => {
      const key = lineKey(line);
      const existing = current.find((entry) => entry.key === key && !entry.notes && !line.notes);
      if (existing) return current.map((entry) => (entry === existing ? { ...entry, quantity: Math.min(20, entry.quantity + line.quantity) } : entry));
      return [...current, { ...line, key }];
    });
  const setQuantity = (index, quantity) =>
    setCart((current) => (quantity <= 0 ? current.filter((_, at) => at !== index) : current.map((entry, at) => (at === index ? { ...entry, quantity } : entry))));

  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const detailsValid = details.name.trim().length > 0 && /^[6-9]\d{9}$/.test(details.phone) && quote.isSuccess;

  if (!site.takeaway.openNow) {
    return (
      <>
        <SiteHeader site={site} slug={slug} back />
        <main className="mx-auto max-w-xl p-6">
          <p className="type-body">{site.takeaway.message ?? 'Takeaway is not open right now.'}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader site={site} slug={slug} back />
      {step === 'menu' ? (
        <main className="mx-auto grid max-w-xl gap-6 px-4 pb-28 pt-4">
          <h1 className="type-title">Order takeaway</h1>
          {menu.isPending && <Spinner label="Loading the menu" />}
          {menu.isError && <p className="type-body text-alert">{menu.error.message}</p>}
          {menu.data?.map((category) => (
            <section key={category.id} className="grid gap-2">
              <h2 className="type-heading">{category.name}</h2>
              {category.items.map((item) => {
                const plain = item.variants.length === 0 && item.addOns.length === 0;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                    <div className="min-w-0">
                      <p className="type-body line-clamp-2 font-semibold" title={item.name}>{item.name}</p>
                      {item.description && <p className="type-caption line-clamp-2 text-muted">{item.description}</p>}
                      <Money paise={item.priceInPaise} tabular className="type-label" />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        plain
                          ? add({ menuItemId: item.id, itemName: item.name, variantId: null, variantName: null, addOnIds: [], addOnNames: [], quantity: 1, notes: null })
                          : setChoosing(item)
                      }
                    >
                      {plain ? 'Add' : 'Choose'}
                    </Button>
                  </div>
                );
              })}
            </section>
          ))}
          <p className="type-caption text-muted">Prices are before GST. GST is added on the bill.</p>
        </main>
      ) : (
        <main className="mx-auto grid max-w-xl gap-5 px-4 pb-28 pt-4">
          <button type="button" onClick={() => setStep('menu')} className="type-label flex min-h-12 w-fit items-center text-accent">
            Add more
          </button>
          <h1 className="type-title">Your order</h1>
          <ul className="grid gap-2">
            {cart.map((line, index) => (
              <li key={`${line.key}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                <span className="type-body min-w-0">
                  {line.itemName}
                  {line.variantName ? ` (${line.variantName})` : ''}
                  {line.addOnNames.length > 0 && <span className="type-caption block text-muted">+ {line.addOnNames.join(', ')}</span>}
                  {line.notes && <span className="type-caption block text-muted">“{line.notes}”</span>}
                </span>
                <Stepper quantity={line.quantity} onChange={(quantity) => setQuantity(index, quantity)} label={`Quantity of ${line.itemName}`} />
              </li>
            ))}
          </ul>
          {cart.length > 0 && <Estimate quote={quote} />}

          <label className="grid gap-1">
            <span className="type-label">Pickup time</span>
            <select value={pickup} onChange={(event) => setPickup(event.target.value)} className="type-body min-h-12 rounded-lg border border-line bg-surface px-3">
              {choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <GuestDetails site={site} details={details} onChange={setDetails} notePlaceholder="Anything the cafe should know" />
          <Honeypot value={details.website} onChange={(website) => setDetails((current) => ({ ...current, website }))} />
          {place.isError && <p className="type-body text-alert">{place.error.message}</p>}
        </main>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface px-4 py-3">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span className="type-label">{count === 1 ? '1 item' : `${count} items`}</span>
            {step === 'menu' ? (
              <Button onClick={() => setStep('details')}>Review order</Button>
            ) : (
              <Button disabled={!detailsValid} isLoading={place.isPending} onClick={() => place.mutate()}>
                Place order
              </Button>
            )}
          </div>
        </div>
      )}

      {choosing && <ItemSheet item={choosing} onClose={() => setChoosing(null)} onAdd={(line) => { add(line); setChoosing(null); }} />}
    </>
  );
}
