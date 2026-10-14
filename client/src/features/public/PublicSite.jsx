/**
 * The restaurant's public page. P23, redesigned in P24, restyled in P38. /r/:slug
 *
 * The cafe's own ordering site. A guest orders takeaway or books a table, and
 * pays in advance when the cafe asks. No sign-in, no app frame, and nothing
 * imported from the staff screens, the staff API client or the sign-in
 * context: a test reads this folder's imports. Phone first, Day only. P38: a
 * street-food signboard look, in the restaurant's own brand colour, saying only
 * what the restaurant's own records say.
 */
import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes, useParams } from 'react-router-dom';

import { getPublicMenu, getSite } from '../../api/publicSite.js';
import DishPhoto from '../../components/ui/DishPhoto.jsx';
import Money from '../../components/ui/Money.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { BagIcon, PeopleIcon } from '../../components/ui/icons/index.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import PublicBook from './PublicBook.jsx';
import PublicOrder from './PublicOrder.jsx';
import { BookingStatus, OrderStatus } from './PublicStatus.jsx';
import { DISPLAY, EYEBROW, Festoon, Flourish, SectionTitle } from './publicUi.jsx';

function PageFrame({ site, children }) {
  const appearance = site?.appearance;
  // P38. The page wears the restaurant's own brand colour; the accent when it has none.
  const style = appearance
    ? {
        '--accent': appearance.accent,
        '--accent-night': appearance.accentNight,
        ...(appearance.brandHex ? { '--stall': appearance.brandHex, '--on-stall': appearance.onBrandHex } : {}),
      }
    : undefined;
  return (
    <div data-theme="day" data-public="" style={style} className="v2 min-h-full bg-cream text-masala">
      {children}
    </div>
  );
}

const fullAddress = (address) => [address.line1, address.line2, address.city, address.pincode].filter(Boolean).join(', ');

function SignboardAction({ to, icon, title, line, tone }) {
  const Icon = icon;
  const stall = tone === 'stall';
  return (
    <Link
      to={to}
      className={[
        'chit-shadow group flex min-h-24 items-center gap-4 rounded-xl border-2 border-masala p-4 transition-transform duration-150 hover:-translate-y-0.5',
        stall ? 'bg-stall text-on-stall' : 'bg-saffron text-masala',
      ].join(' ')}
    >
      <span className={`flex size-14 flex-none items-center justify-center rounded-lg border-2 ${stall ? 'border-on-stall/40 bg-on-stall/15' : 'border-masala/30 bg-chit/60'}`}>
        <Icon size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`${DISPLAY} block text-2xl uppercase leading-tight tracking-wide`}>{title}</span>
        <span className="type-caption mt-1 block opacity-90">{line}</span>
      </span>
      <span aria-hidden="true" className="text-2xl transition-transform duration-150 group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

function Hero({ site }) {
  const { takeaway } = site;
  return (
    <section className="relative overflow-hidden bg-stall text-on-stall">
      <div aria-hidden="true" className="sawtooth absolute inset-x-0 bottom-0 h-3 text-cream" />
      <div className="mx-auto grid max-w-6xl gap-5 px-5 pb-14 pt-8 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:pb-20 lg:pt-14">
        <div className="grid gap-4">
          <Flourish className="text-saffron">Order direct · No app · No commission</Flourish>
          <h1 className={`${DISPLAY} text-[clamp(3.25rem,15vw,7rem)] uppercase leading-[0.86]`}>{site.wordmark ?? site.restaurantName}</h1>
          {site.pageNote && (
            <p className={`${DISPLAY} w-fit -rotate-1 rounded-md bg-masala px-3 py-1 text-[clamp(1.25rem,5vw,2rem)] text-saffron`}>{site.pageNote}</p>
          )}
          {fullAddress(site.address) && <p className="type-body max-w-xl opacity-90">{fullAddress(site.address)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className={`flex items-center gap-2 rounded-full border-2 border-on-stall/40 bg-on-stall/10 px-3 py-1.5 ${EYEBROW}`}>
            <span aria-hidden="true" className={`size-2.5 rounded-full ${takeaway.openNow ? 'bg-saffron' : 'bg-on-stall/50'}`} />
            {takeaway.openNow ? 'Open now' : 'Closed now'}
          </span>
          <span className={`rounded-full border-2 border-on-stall/40 px-3 py-1.5 ${EYEBROW}`}>
            Today {formatTimeIst(site.hours.todayOpensAt)} to {formatTimeIst(site.hours.todayClosesAt)}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Dishes with photos lead; the rest follow in menu order. */
function favouritesOf(menu) {
  const everything = (menu ?? []).flatMap((category) => category.items);
  return [...everything.filter((item) => item.photoUrl), ...everything.filter((item) => !item.photoUrl)].slice(0, 10);
}

function DishStrip({ items, slug }) {
  return (
    <section className="grid gap-4" aria-labelledby="favourites">
      <div className="flex items-end justify-between gap-3">
        <SectionTitle id="favourites" eyebrow="From the counter" title="On the menu" />
        <Link to={`/r/${slug}/order`} className="type-label flex min-h-12 items-center whitespace-nowrap text-stall underline underline-offset-4">
          See everything
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/r/${slug}/order`}
            className="chit-shadow flex w-44 flex-none snap-start flex-col overflow-hidden rounded-xl border-2 border-masala bg-chit"
          >
            <DishPhoto src={item.photoUrl} name={item.name} className="aspect-square w-full" />
            <span className="grid gap-1 p-3">
              <span className="font-anek text-[0.95rem] font-[700] leading-tight line-clamp-2" title={item.name}>{item.name}</span>
              <Money paise={item.priceInPaise} className="type-caption font-[700] text-stall" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const STICKER_TILT = ['-rotate-1', 'rotate-1', '-rotate-2', 'rotate-2'];

function MenuSections({ menu, slug }) {
  return (
    <section className="grid gap-4 rounded-2xl bg-saffron-tint px-4 py-6 sm:px-6" aria-labelledby="sections">
      <SectionTitle id="sections" eyebrow="Pick a counter" title="Menu sections" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {menu.map((category, index) => (
          <Link
            key={category.id}
            to={`/r/${slug}/order?section=${category.id}`}
            className={`flex min-h-16 flex-col justify-center rounded-lg border-2 border-masala bg-chit px-3 py-2 shadow-[2px_2px_0_var(--masala)] transition-transform hover:rotate-0 ${STICKER_TILT[index % STICKER_TILT.length]}`}
          >
            <span className="font-anek text-sm font-[750] uppercase leading-tight tracking-wide">{category.name}</span>
            <span className="type-caption text-masala-soft">
              {category.items.length === 1 ? '1 dish' : `${category.items.length} dishes`}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function VisitUs({ site }) {
  const address = fullAddress(site.address);
  const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.restaurantName}, ${address}`)}` : null;
  return (
    <section className="chit-shadow grid gap-4 rounded-2xl border-2 border-masala bg-chit p-5 sm:p-6" aria-labelledby="visit">
      <SectionTitle id="visit" eyebrow="Find us" title="Visit us" />
      {address && <p className="type-body">{address}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-cream p-3">
          <p className={`${EYEBROW} text-masala-soft`}>Today</p>
          <p className="font-anek text-lg font-[700]">
            {formatTimeIst(site.hours.todayOpensAt)} to {formatTimeIst(site.hours.todayClosesAt)}
          </p>
        </div>
        {site.contactPhone && (
          <a href={`tel:${site.contactPhone}`} className="flex min-h-12 flex-col justify-center rounded-lg bg-cream p-3">
            <span className={`${EYEBROW} text-masala-soft`}>Call</span>
            <span className="font-anek text-lg font-[700] text-stall">{site.contactPhone}</span>
          </a>
        )}
      </div>
      {maps && (
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-masala bg-saffron font-anek font-[750] uppercase tracking-wide text-masala shadow-[3px_3px_0_var(--masala)]"
        >
          Open in Maps <span aria-hidden="true">↗</span>
        </a>
      )}
    </section>
  );
}

function Home({ site, slug }) {
  const menu = useQuery({ queryKey: ['public', 'menu', slug], queryFn: () => getPublicMenu(slug) });
  const { takeaway, reservations } = site;
  const deposit = reservations.depositPerPersonInPaise;
  const favourites = favouritesOf(menu.data);
  const pickupLine = takeaway.prepay
    ? 'Pay online, collect at the counter.'
    : `Ready from ${formatTimeIst(takeaway.earliestPickupAt)}. Pay at the counter when you collect.`;

  return (
    <>
      <Hero site={site} />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8">
        <div className="grid gap-3 lg:grid-cols-2">
          {takeaway.enabled &&
            (takeaway.openNow ? (
              <div className="grid gap-2">
                <SignboardAction to={`/r/${slug}/order`} icon={BagIcon} title="Order takeaway" line={pickupLine} tone="stall" />
                {takeaway.prepay && (
                  <p className="type-caption w-fit rounded-full bg-chit px-3 py-1 text-leaf">Refunded in full if the cafe cannot take it</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-masala/40 bg-chit p-4">
                <p className={`${DISPLAY} text-2xl uppercase`}>Takeaway</p>
                <p className="type-body mt-1 text-masala-soft">{takeaway.message}</p>
              </div>
            ))}
          {reservations.enabled && (
            <div className="grid gap-2">
              <SignboardAction
                to={`/r/${slug}/book`}
                icon={PeopleIcon}
                title="Book a table"
                line={`Up to ${reservations.maxPartySize} people, up to ${reservations.daysAhead} days ahead. The cafe confirms every booking.`}
                tone="saffron"
              />
              {deposit > 0 ? (
                <p className="type-caption px-1 text-masala-soft">
                  Bookings take a deposit of <Money paise={deposit} /> a person, taken off your bill on the day.
                </p>
              ) : (
                <p className="type-caption w-fit rounded-full bg-chit px-3 py-1 text-leaf">No deposit needed</p>
              )}
            </div>
          )}
          {!takeaway.enabled && !reservations.enabled && (
            <p className="type-body text-masala-soft">This cafe is not taking orders or bookings online right now.</p>
          )}
        </div>

        {menu.isPending && <Spinner label="Loading the menu" />}
        {favourites.length > 0 && takeaway.openNow && <DishStrip items={favourites} slug={slug} />}
        {menu.data?.length > 0 && takeaway.openNow && <MenuSections menu={menu.data.filter((category) => category.items.length > 0)} slug={slug} />}

        <VisitUs site={site} />
      </main>
      <footer className="grid gap-2 bg-stall px-5 pb-8 pt-6 text-center text-on-stall">
        <Festoon />
        <p className={`${DISPLAY} text-3xl uppercase`}>{site.wordmark ?? site.restaurantName}</p>
        {site.pageNote && <p className="font-anek text-lg font-[650] text-saffron">{site.pageNote}</p>}
        <p className="type-caption opacity-90">Prices are before GST. Payments are made to {site.restaurantName} directly.</p>
      </footer>
    </>
  );
}

export default function PublicSite() {
  const { slug } = useParams();
  const site = useQuery({ queryKey: ['public', 'site', slug], queryFn: () => getSite(slug), refetchInterval: 60_000, retry: 1 });

  if (site.isPending) {
    return (
      <PageFrame>
        <div className="mx-auto max-w-3xl p-6">
          <Spinner label="Loading" />
        </div>
      </PageFrame>
    );
  }
  if (site.isError) {
    return (
      <PageFrame>
        <main className="mx-auto grid max-w-3xl gap-2 p-6">
          <h1 className={`${DISPLAY} text-3xl`}>{site.error.status === 404 ? 'This page does not exist' : 'Something went wrong'}</h1>
          <p className="type-body text-muted">{site.error.status === 404 ? 'Check the link with the cafe.' : site.error.message}</p>
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame site={site.data}>
      <Routes>
        <Route index element={<Home site={site.data} slug={slug} />} />
        <Route path="order" element={<PublicOrder site={site.data} slug={slug} />} />
        <Route path="order/:id" element={<OrderStatus site={site.data} slug={slug} />} />
        <Route path="book" element={<PublicBook site={site.data} slug={slug} />} />
        <Route path="book/:id" element={<BookingStatus site={site.data} slug={slug} />} />
      </Routes>
    </PageFrame>
  );
}
