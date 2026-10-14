/**
 * Takeaway from the restaurant's page. P23, redesigned in P24.
 *
 * Order, Details, Pay. The menu is photo cards under a sticky row of
 * category chips, with the cart as a floating bar. P38: menu chits with a
 * search, and on a wide screen the sections on the left and the order as a
 * paper bill on the right. Without online payment, the guest pays at the
 * counter, and the page says so. The total shown is the
 * server's quote, worked out by the same arithmetic as a bill; this page never
 * adds up tax itself. When the cafe takes payment online, placing the order
 * hands over to Razorpay's page, and the guest comes back to the status page.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { getPublicMenu, getQuote, placeOrder } from '../../api/publicSite.js';
import DishPhoto from '../../components/ui/DishPhoto.jsx';
import Money, { moneyText } from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { MinusIcon, PlusIcon, SearchIcon } from '../../components/ui/icons/index.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { GuestDetails, Honeypot } from './GuestDetails.jsx';
import ItemSheet from './ItemSheet.jsx';
import { ActionBar, BarButton, ChoiceChip, DISPLAY, EYEBROW, SectionTitle, Stamp, Steps, Ticket, TopBar } from './publicUi.jsx';
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
  const button = 'flex size-12 items-center justify-center rounded-lg border-2 border-masala/30 bg-chit hover:border-masala disabled:opacity-40';
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <button type="button" aria-label="One fewer" onClick={() => onChange(quantity - 1)} className={button}>
        <MinusIcon size={18} />
      </button>
      <span className="type-num w-7 text-center font-[700]">{quantity}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(quantity + 1)} disabled={quantity >= 20} className={button}>
        <PlusIcon size={18} />
      </button>
    </div>
  );
}

const fromPrice = (item) => (item.variants.length ? Math.min(...item.variants.map((variant) => variant.priceInPaise)) : item.priceInPaise);

/** One dish, as a menu chit: the words on the left, the photo on the right, add underneath. */
function DishCard({ item, onAdd, onRemove, onChoose, inCart }) {
  const plain = item.variants.length === 0 && item.addOns.length === 0;
  return (
    <article className="flex gap-3 rounded-xl border-2 border-masala/15 bg-chit p-3 shadow-[2px_2px_0_var(--chit-edge)] transition-colors hover:border-masala/40">
      <div className="flex min-w-0 flex-1 flex-col">
        <button type="button" onClick={onChoose} className="text-left" aria-label={`${item.name}, see details`}>
          <h3 className="font-anek text-lg font-[750] leading-snug line-clamp-2" title={item.name}>{item.name}</h3>
          {item.description && <p className="type-caption mt-1 line-clamp-2 text-masala-soft">{item.description}</p>}
        </button>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
          <span className="font-anek text-lg font-[750] text-stall">
            {item.variants.length > 0 && <span className="type-caption mr-1 font-[500] text-masala-soft">from</span>}
            <Money paise={fromPrice(item)} />
          </span>
          {plain && inCart > 0 ? (
            <div className="flex items-center rounded-lg border-2 border-masala bg-saffron text-masala">
              <button type="button" aria-label={`One fewer ${item.name}`} onClick={onRemove} className="flex size-11 items-center justify-center">
                <MinusIcon size={18} />
              </button>
              <span className="type-num w-6 text-center font-[750]">{inCart}</span>
              <button type="button" aria-label={`Add ${item.name}`} onClick={onAdd} className="flex size-11 items-center justify-center">
                <PlusIcon size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={plain ? onAdd : onChoose}
              aria-label={plain ? `Add ${item.name}` : `Choose ${item.name}`}
              className="relative flex min-h-11 items-center gap-1 rounded-lg border-2 border-masala bg-stall px-4 font-anek text-sm font-[750] uppercase tracking-wide text-on-stall shadow-[2px_2px_0_var(--masala)]"
            >
              <PlusIcon size={16} /> {plain ? 'Add' : 'Choose'}
              {inCart > 0 && (
                <span className="type-caption absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full bg-saffron px-1 text-masala">{inCart}</span>
              )}
            </button>
          )}
        </div>
      </div>
      <button type="button" onClick={onChoose} tabIndex={-1} aria-hidden="true" className="flex-none">
        <DishPhoto src={item.photoUrl} name={item.name} className="size-24 rounded-lg sm:size-28" />
      </button>
    </article>
  );
}

function Estimate({ quote }) {
  if (quote.isPending) return <Spinner label="Working out the total" size="sm" />;
  if (quote.isError) return <p className="type-body text-alert">{quote.error.message}</p>;
  const { estimate } = quote.data;
  const row = (label, paise) => (
    <div className="type-body flex justify-between gap-3">
      <span className="text-masala-soft">{label}</span>
      <Money paise={paise} tabular />
    </div>
  );
  return (
    <div className="grid gap-1">
      {row('Item total', estimate.itemTotalInPaise)}
      {row('GST', estimate.gstInPaise)}
      {estimate.roundOffInPaise !== 0 && row('Round-off', estimate.roundOffInPaise)}
      <div className="mt-2 flex items-baseline justify-between gap-3 rounded-lg bg-saffron-tint px-3 py-2">
        <span className="font-anek text-lg font-[750]">Estimated bill total</span>
        <Money paise={estimate.billTotalInPaise} size="tile" tabular className="text-stall" />
      </div>
    </div>
  );
}

/** The cart as a paper bill, beside the menu on a wide screen. */
function CartChit({ cart, count, itemTotal, onReview }) {
  return (
    <aside className="sticky top-24 hidden lg:block" aria-label="Your order">
      <Ticket
        head={
          <>
            <p className={`${EYEBROW} text-stall`}>Your order</p>
            <p className={`${DISPLAY} mt-1 text-2xl`}>{count === 0 ? 'Nothing yet' : count === 1 ? '1 item' : `${count} items`}</p>
          </>
        }
      >
        {cart.length === 0 ? (
          <p className="type-body text-masala-soft">Tap Add on a dish to start.</p>
        ) : (
          <div className="grid gap-3">
            <ul className="grid gap-2">
              {cart.map((line, index) => (
                <li key={`${line.key}-${index}`} className="type-body flex justify-between gap-3">
                  <span className="min-w-0">
                    {line.quantity} × {line.itemName}
                    {line.variantName ? ` (${line.variantName})` : ''}
                  </span>
                  <Money paise={line.unitPriceInPaise * line.quantity} tabular />
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t-2 border-dashed border-masala/30 pt-3">
              <span className="font-anek font-[700]">Item total</span>
              <Money paise={itemTotal} size="tile" tabular className="text-stall" />
            </div>
            <p className="type-caption text-masala-soft">GST is added on the next step.</p>
            <button
              type="button"
              onClick={onReview}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-masala bg-stall font-anek font-[750] uppercase tracking-wide text-on-stall shadow-[3px_3px_0_var(--masala)]"
            >
              Continue <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </Ticket>
    </aside>
  );
}

export default function PublicOrder({ site, slug }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const menu = useQuery({ queryKey: ['public', 'menu', slug], queryFn: () => getPublicMenu(slug) });
  const [cart, setCart] = useState([]);
  const [choosing, setChoosing] = useState(null);
  const [step, setStep] = useState(0);
  const [find, setFind] = useState('');
  const [details, setDetails] = useState({ name: '', phone: '', note: '', consent: false, website: '' });
  const choices = pickupChoices(site.takeaway);
  const [pickup, setPickup] = useState('ASAP');
  const [idempotencyKey] = useState(newIdempotencyKey);
  const prepay = site.takeaway.prepay;
  const section = search.get('section');

  // P38. Arriving from a menu section on the home page: start at that section.
  useEffect(() => {
    if (!section || !menu.data) return;
    document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [section, menu.data]);

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
  /** One fewer of a plain dish: its plain line without a note. */
  const removePlain = (itemId) =>
    setCart((current) => {
      const index = current.findIndex((line) => line.menuItemId === itemId && !line.variantId && line.addOnIds.length === 0 && !line.notes);
      if (index === -1) return current;
      const line = current[index];
      return line.quantity <= 1 ? current.filter((_, at) => at !== index) : current.map((entry, at) => (at === index ? { ...entry, quantity: entry.quantity - 1 } : entry));
    });

  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const itemTotal = cart.reduce((sum, line) => sum + line.unitPriceInPaise * line.quantity, 0);
  const inCart = (itemId) => cart.filter((line) => line.menuItemId === itemId).reduce((sum, line) => sum + line.quantity, 0);
  const detailsValid = details.name.trim().length > 0 && /^[6-9]\d{9}$/.test(details.phone) && quote.isSuccess;
  const billTotal = quote.data?.estimate.billTotalInPaise;

  const needle = find.trim().toLowerCase();
  const sections = (menu.data ?? [])
    .map((category) => ({
      ...category,
      items: needle ? category.items.filter((item) => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(needle)) : category.items,
    }))
    .filter((category) => category.items.length > 0);
  const goTo = (id) => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: scrollBehaviour(), block: 'start' });

  if (!site.takeaway.openNow) {
    return (
      <>
        <TopBar site={site} slug={slug} back={`/r/${slug}`} />
        <main className="mx-auto grid max-w-3xl gap-3 p-6">
          <Stamp tone="stall">Closed</Stamp>
          <p className={`${DISPLAY} text-3xl`}>Takeaway is closed</p>
          <p className="type-body text-masala-soft">{site.takeaway.message ?? 'Takeaway is not open right now.'}</p>
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
      <div className="mx-auto max-w-6xl px-4 pt-4">
        <Steps steps={['Order', 'Details', prepay ? 'Pay' : 'Done']} current={step} />
      </div>

      {step === 0 ? (
        <>
          {menu.data && (
            <nav aria-label="Menu sections" className="sticky top-[4.5rem] z-10 mt-3 border-b-2 border-masala/15 bg-cream/95 backdrop-blur lg:hidden">
              <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2">
                {sections.map((category) => (
                  <ChoiceChip key={category.id} selected={section === category.id} className="type-label whitespace-nowrap" onClick={() => goTo(category.id)}>
                    {category.name}
                  </ChoiceChip>
                ))}
              </div>
            </nav>
          )}
          <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-32 pt-4 lg:grid-cols-[13rem_1fr_20rem] lg:items-start lg:pb-16">
            {menu.data && (
              <nav aria-label="Menu sections, list" className="sticky top-24 hidden lg:grid lg:gap-1">
                <p className={`${EYEBROW} mb-1 text-stall`}>Menu sections</p>
                {sections.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => goTo(category.id)}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-left font-anek text-[0.95rem] font-[650] hover:bg-saffron-tint"
                  >
                    <span className="truncate">{category.name}</span>
                    <span className="type-caption text-masala-soft">{category.items.length}</span>
                  </button>
                ))}
              </nav>
            )}

            <main className="grid min-w-0 gap-8">
              <div className="grid gap-3">
                <SectionTitle eyebrow="Takeaway" title="What would you like?" />
                <label className="relative block">
                  <span className="sr-only">Search the menu</span>
                  <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-masala-soft">
                    <SearchIcon size={18} />
                  </span>
                  <input
                    type="search"
                    value={find}
                    onChange={(event) => setFind(event.target.value)}
                    placeholder="Search the menu"
                    className="type-body min-h-12 w-full rounded-lg border-2 border-masala/25 bg-chit pl-10 pr-3 placeholder:text-masala-soft/70 focus:border-masala"
                  />
                </label>
              </div>
              {menu.isPending && <Spinner label="Loading the menu" />}
              {menu.isError && <p className="type-body text-alert">{menu.error.message}</p>}
              {menu.isSuccess && sections.length === 0 && <p className="type-body text-masala-soft">Nothing on the menu matches “{find.trim()}”.</p>}
              {sections.map((category) => (
                <section key={category.id} id={`section-${category.id}`} className="grid scroll-mt-36 gap-3 lg:scroll-mt-24">
                  <h2 className={`${DISPLAY} flex items-center gap-2 text-2xl uppercase tracking-wide`}>
                    <span aria-hidden="true" className="text-saffron">✦</span>
                    {category.name}
                  </h2>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {category.items.map((item) => (
                      <DishCard
                        key={item.id}
                        item={item}
                        inCart={inCart(item.id)}
                        onAdd={() => add(plainLine(item))}
                        onRemove={() => removePlain(item.id)}
                        onChoose={() => setChoosing(item)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              <p className="type-caption text-masala-soft">Prices are before GST. GST is added on the bill.</p>
            </main>

            <CartChit cart={cart} count={count} itemTotal={itemTotal} onReview={() => setStep(1)} />
          </div>
          {count > 0 && (
            <div className="lg:hidden">
              <ActionBar>
                <span>
                  <span className="font-anek text-lg font-[750]">{count === 1 ? '1 item' : `${count} items`}</span>
                  <span className="type-caption block opacity-90">
                    Item total <Money paise={itemTotal} /> + GST
                  </span>
                </span>
                <BarButton onClick={() => setStep(1)}>Review order</BarButton>
              </ActionBar>
            </div>
          )}
        </>
      ) : (
        <>
          <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-36 pt-5 lg:grid-cols-2 lg:items-start">
            <div className="grid gap-6">
              <div className="flex items-end justify-between gap-3">
                <SectionTitle eyebrow="Takeaway" title="Your order" />
                <button type="button" onClick={() => setStep(0)} className="type-label min-h-12 text-stall underline underline-offset-4">
                  Add more
                </button>
              </div>

              <Ticket
                head={
                  <>
                    <p className={`${EYEBROW} text-stall`}>Order chit</p>
                    <p className={`${DISPLAY} mt-1 text-2xl`}>{site.restaurantName}</p>
                  </>
                }
              >
                <div className="grid gap-4">
                  <ul className="grid gap-3">
                    {cart.map((line, index) => (
                      <li key={`${line.key}-${index}`} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-anek font-[700]">
                            {line.itemName}
                            {line.variantName ? ` (${line.variantName})` : ''}
                          </span>
                          {line.addOnNames.length > 0 && <span className="type-caption block text-masala-soft">+ {line.addOnNames.join(', ')}</span>}
                          {line.notes && <span className="type-caption block text-masala-soft">“{line.notes}”</span>}
                        </span>
                        <Stepper quantity={line.quantity} onChange={(quantity) => setQuantity(index, quantity)} label={`Quantity of ${line.itemName}`} />
                      </li>
                    ))}
                  </ul>
                  {cart.length > 0 && (
                    <div className="border-t-2 border-dashed border-masala/30 pt-4">
                      <Estimate quote={quote} />
                    </div>
                  )}
                </div>
              </Ticket>

              <section className="grid gap-3">
                <h2 className={`${DISPLAY} text-2xl`}>When will you collect it?</h2>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
                  {choices.map((choice) => (
                    <ChoiceChip key={choice.value} selected={pickup === choice.value} onClick={() => setPickup(choice.value)} className="text-left">
                      <span className="type-label block whitespace-nowrap">{choice.label}</span>
                      {choice.detail && <span className="type-caption block whitespace-nowrap opacity-80">{choice.detail}</span>}
                    </ChoiceChip>
                  ))}
                </div>
              </section>
            </div>

            <div className="grid gap-6">
              <section className="grid gap-3 rounded-xl border-2 border-masala/20 bg-chit p-4 sm:p-5">
                <h2 className={`${DISPLAY} text-2xl`}>Your details</h2>
                <GuestDetails site={site} details={details} onChange={setDetails} notePlaceholder="Anything the cafe should know" />
                <Honeypot value={details.website} onChange={(website) => setDetails((current) => ({ ...current, website }))} />
              </section>

              {prepay ? (
                <p className="type-caption rounded-lg bg-saffron-tint px-4 py-3">
                  You pay {site.restaurantName} directly, through Razorpay: UPI, cards or netbanking. If the cafe cannot take your
                  order, the full amount is refunded automatically.
                </p>
              ) : (
                <div className="grid gap-1 rounded-lg border-2 border-dashed border-masala/30 bg-saffron-tint px-4 py-3">
                  <p className="font-anek text-lg font-[750]">Pay at the counter</p>
                  <p className="type-caption">
                    Nothing is paid online. Pay when you collect: scan the QR code at the counter, or pay by card or cash. Nothing reaches
                    the kitchen until the cafe accepts your order, and this page shows the answer.
                  </p>
                </div>
              )}
              {place.isError && <p className="type-body text-alert">{place.error.message}</p>}
            </div>
          </main>
          <ActionBar>
            <span>
              <span className="font-anek text-lg font-[750]">{count === 1 ? '1 item' : `${count} items`}</span>
              {billTotal !== undefined && <span className="type-caption block opacity-90">Estimated {moneyText(billTotal)}</span>}
            </span>
            <BarButton disabled={!detailsValid} busy={place.isPending} onClick={() => place.mutate()}>
              {prepay && billTotal !== undefined ? `Pay ${moneyText(billTotal)} securely` : 'Place order'}
            </BarButton>
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
