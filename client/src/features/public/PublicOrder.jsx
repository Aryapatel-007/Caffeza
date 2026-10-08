/**
 * Takeaway from the restaurant's page. P23, redesigned in P24.
 *
 * Order, Details, Pay. The menu is photo cards under a sticky row of
 * category chips, with the cart as a floating bar. The total shown is the
 * server's quote, worked out by the same arithmetic as a bill; this page never
 * adds up tax itself. When the cafe takes payment online, placing the order
 * hands over to Razorpay's page, and the guest comes back to the status page.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getPublicMenu, getQuote, placeOrder } from '../../api/publicSite.js';
import Button from '../../components/ui/Button.jsx';
import DishPhoto from '../../components/ui/DishPhoto.jsx';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { MinusIcon, PlusIcon } from '../../components/ui/icons/index.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { GuestDetails, Honeypot } from './GuestDetails.jsx';
import ItemSheet from './ItemSheet.jsx';
import { ActionBar, ChoiceChip, DISPLAY, Steps, TopBar } from './publicUi.jsx';
import { newIdempotencyKey, rememberToken } from './guestTokens.js';

const STEP_MS = 15 * 60_000;

/** As soon as possible, then every 15 minutes until closing. */
function pickupChoices(takeaway) {
  if (!takeaway.earliestPickupAt) return [];
  const earliest = new Date(takeaway.earliestPickupAt).getTime();
  const latest = new Date(takeaway.latestPickupAt).getTime();
  const choices = [{ value: 'ASAP', label: 'As soon as possible', detail: `about ${formatTimeIst(earliest)}` }];
  for (let at = Math.ceil(earliest / STEP_MS) * STEP_MS; at <= latest && choices.length < 24; at += STEP_MS) {
    if (at > earliest) choices.push({ value: new Date(at).toISOString(), label: formatTimeIst(at), detail: null });
  }
  return choices;
}

const lineKey = (line) => [line.menuItemId, line.variantId ?? '', ...(line.addOnIds ?? []).slice().sort()].join('|');

const scrollBehaviour = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

function Stepper({ quantity, onChange, label }) {
  const button = 'flex size-12 items-center justify-center rounded-full border border-line bg-surface hover:border-ink disabled:opacity-40';
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <button type="button" aria-label="One fewer" onClick={() => onChange(quantity - 1)} className={button}>
        <MinusIcon size={18} />
      </button>
      <span className="type-num w-7 text-center">{quantity}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(quantity + 1)} disabled={quantity >= 20} className={button}>
        <PlusIcon size={18} />
      </button>
    </div>
  );
}

function DishCard({ item, onAdd, onChoose, inCart }) {
  const plain = item.variants.length === 0 && item.addOns.length === 0;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <button type="button" onClick={onChoose} className="block text-left" aria-label={`${item.name}, see details`}>
        <DishPhoto src={item.photoUrl} name={item.name} className="aspect-[4/3] w-full" />
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="type-label line-clamp-2" title={item.name}>{item.name}</h3>
        {item.description && <p className="type-caption line-clamp-2 text-muted">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="type-num">
            {item.variants.length > 0 && <span className="type-caption mr-1 text-muted">from</span>}
            <Money paise={item.variants.length ? Math.min(...item.variants.map((variant) => variant.priceInPaise)) : item.priceInPaise} />
          </span>
          <button
            type="button"
            onClick={plain ? onAdd : onChoose}
            aria-label={plain ? `Add ${item.name}` : `Choose ${item.name}`}
            className="relative flex size-12 flex-none items-center justify-center rounded-full bg-accent text-on-accent hover:brightness-110"
          >
            <PlusIcon size={20} />
            {inCart > 0 && (
              <span className="type-caption absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-ink px-1 text-surface">{inCart}</span>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

function Estimate({ quote }) {
  if (quote.isPending) return <Spinner label="Working out the total" size="sm" />;
  if (quote.isError) return <p className="type-body text-alert">{quote.error.message}</p>;
  const { estimate } = quote.data;
  const row = (label, paise) => (
    <div className="type-body flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <Money paise={paise} tabular />
    </div>
  );
  return (
    <div className="grid gap-1">
      {row('Item total', estimate.itemTotalInPaise)}
      {row('GST', estimate.gstInPaise)}
      {estimate.roundOffInPaise !== 0 && row('Round-off', estimate.roundOffInPaise)}
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="type-heading">Estimated bill total</span>
        <Money paise={estimate.billTotalInPaise} size="tile" tabular />
      </div>
    </div>
  );
}

export default function PublicOrder({ site, slug }) {
  const navigate = useNavigate();
  const menu = useQuery({ queryKey: ['public', 'menu', slug], queryFn: () => getPublicMenu(slug) });
  const [cart, setCart] = useState([]);
  const [choosing, setChoosing] = useState(null);
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({ name: '', phone: '', note: '', consent: false, website: '' });
  const choices = pickupChoices(site.takeaway);
  const [pickup, setPickup] = useState('ASAP');
  const [idempotencyKey] = useState(newIdempotencyKey);
  const prepay = site.takeaway.prepay;

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
    enabled: step === 1 && requestLines.length > 0,
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
      // Pay on Razorpay's own page; it sends the guest back to the status page.
      if (placed.payment?.payUrl) window.location.assign(placed.payment.payUrl);
      else navigate(`/r/${slug}/order/${placed.id}`, { replace: true });
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
  const itemTotal = cart.reduce((sum, line) => sum + line.unitPriceInPaise * line.quantity, 0);
  const inCart = (itemId) => cart.filter((line) => line.menuItemId === itemId).reduce((sum, line) => sum + line.quantity, 0);
  const detailsValid = details.name.trim().length > 0 && /^[6-9]\d{9}$/.test(details.phone) && quote.isSuccess;
  const billTotal = quote.data?.estimate.billTotalInPaise;

  if (!site.takeaway.openNow) {
    return (
      <>
        <TopBar site={site} slug={slug} back={`/r/${slug}`} />
        <main className="mx-auto max-w-3xl p-6">
          <p className={`${DISPLAY} text-3xl`}>Takeaway is closed</p>
          <p className="type-body mt-2 text-muted">{site.takeaway.message ?? 'Takeaway is not open right now.'}</p>
        </main>
      </>
    );
  }

  const plainLine = (item) => ({
    menuItemId: item.id,
    itemName: item.name,
    variantId: null,
    variantName: null,
    addOnIds: [],
    addOnNames: [],
    unitPriceInPaise: item.priceInPaise,
    quantity: 1,
    notes: null,
  });

  return (
    <>
      <TopBar site={site} slug={slug} back={step === 0 ? `/r/${slug}` : null} />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <Steps steps={['Order', 'Details', prepay ? 'Pay' : 'Done']} current={step} />
      </div>

      {step === 0 ? (
        <>
          {menu.data && (
            <nav aria-label="Menu sections" className="sticky top-14 z-10 mt-3 border-b border-line bg-ground/95 backdrop-blur">
              <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2">
                {menu.data.map((category) => (
                  <ChoiceChip
                    key={category.id}
                    selected={false}
                    className="type-label whitespace-nowrap"
                    onClick={() => document.getElementById(`section-${category.id}`)?.scrollIntoView({ behavior: scrollBehaviour(), block: 'start' })}
                  >
                    {category.name}
                  </ChoiceChip>
                ))}
              </div>
            </nav>
          )}
          <main className="mx-auto grid max-w-3xl gap-8 px-4 pb-32 pt-4">
            <h1 className={`${DISPLAY} text-4xl leading-none`}>What would you like?</h1>
            {menu.isPending && <Spinner label="Loading the menu" />}
            {menu.isError && <p className="type-body text-alert">{menu.error.message}</p>}
            {menu.data?.map((category) => (
              <section key={category.id} id={`section-${category.id}`} className="grid scroll-mt-32 gap-3">
                <h2 className={`${DISPLAY} text-2xl`}>{category.name}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {category.items.map((item) => (
                    <DishCard
                      key={item.id}
                      item={item}
                      inCart={inCart(item.id)}
                      onAdd={() => add(plainLine(item))}
                      onChoose={() => setChoosing(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
            <p className="type-caption text-muted">Prices are before GST. GST is added on the bill.</p>
          </main>
          {count > 0 && (
            <ActionBar>
              <span>
                <span className="type-label block">{count === 1 ? '1 item' : `${count} items`}</span>
                <span className="type-caption text-muted">
                  Item total <Money paise={itemTotal} />
                </span>
              </span>
              <Button size="lg" onClick={() => setStep(1)}>
                Review order
              </Button>
            </ActionBar>
          )}
        </>
      ) : (
        <>
          <main className="mx-auto grid max-w-3xl gap-6 px-4 pb-36 pt-5">
            <div className="flex items-baseline justify-between">
              <h1 className={`${DISPLAY} text-4xl leading-none`}>Your order</h1>
              <button type="button" onClick={() => setStep(0)} className="type-label min-h-12 text-accent">
                Add more
              </button>
            </div>

            <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5">
              <ul className="grid gap-3">
                {cart.map((line, index) => (
                  <li key={`${line.key}-${index}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="type-label block">
                        {line.itemName}
                        {line.variantName ? ` (${line.variantName})` : ''}
                      </span>
                      {line.addOnNames.length > 0 && <span className="type-caption block text-muted">+ {line.addOnNames.join(', ')}</span>}
                      {line.notes && <span className="type-caption block text-muted">“{line.notes}”</span>}
                    </span>
                    <Stepper quantity={line.quantity} onChange={(quantity) => setQuantity(index, quantity)} label={`Quantity of ${line.itemName}`} />
                  </li>
                ))}
              </ul>
              {cart.length > 0 && (
                <div className="border-t-2 border-dashed border-line pt-4">
                  <Estimate quote={quote} />
                </div>
              )}
            </section>

            <section className="grid gap-3">
              <h2 className={`${DISPLAY} text-2xl`}>When will you collect it?</h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {choices.map((choice) => (
                  <ChoiceChip key={choice.value} selected={pickup === choice.value} onClick={() => setPickup(choice.value)} className="text-left">
                    <span className="type-label block whitespace-nowrap">{choice.label}</span>
                    {choice.detail && <span className="type-caption block whitespace-nowrap opacity-75">{choice.detail}</span>}
                  </ChoiceChip>
                ))}
              </div>
            </section>

            <section className="grid gap-3">
              <h2 className={`${DISPLAY} text-2xl`}>Your details</h2>
              <GuestDetails site={site} details={details} onChange={setDetails} notePlaceholder="Anything the cafe should know" />
              <Honeypot value={details.website} onChange={(website) => setDetails((current) => ({ ...current, website }))} />
            </section>

            {prepay ? (
              <p className="type-caption rounded-xl bg-sunken px-4 py-3 text-muted">
                You pay {site.restaurantName} directly, through Razorpay: UPI, cards or netbanking. If the cafe cannot take your
                order, the full amount is refunded automatically.
              </p>
            ) : (
              <p className="type-caption rounded-xl bg-sunken px-4 py-3 text-muted">Pay at the counter when you collect.</p>
            )}
            {place.isError && <p className="type-body text-alert">{place.error.message}</p>}
          </main>
          <ActionBar>
            <span>
              <span className="type-label block">{count === 1 ? '1 item' : `${count} items`}</span>
              {billTotal !== undefined && <span className="type-caption text-muted">Estimated {moneyText(billTotal)}</span>}
            </span>
            <Button size="lg" disabled={!detailsValid} isLoading={place.isPending} onClick={() => place.mutate()}>
              {prepay && billTotal !== undefined ? `Pay ${moneyText(billTotal)} securely` : 'Place order'}
            </Button>
          </ActionBar>
        </>
      )}

      {choosing && (
        <ItemSheet
          item={choosing}
          onClose={() => setChoosing(null)}
          onAdd={(line) => {
            add(line);
            setChoosing(null);
          }}
        />
      )}
    </>
  );
}
