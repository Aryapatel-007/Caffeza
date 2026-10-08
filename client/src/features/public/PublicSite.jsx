/**
 * The restaurant's public page. P23, redesigned in P24. /r/:slug
 *
 * The cafe's own ordering site. A guest orders takeaway or books a table, and
 * pays in advance when the cafe asks. No sign-in, no app frame, and nothing
 * imported from the staff screens, the staff API client or the sign-in
 * context: a test reads this folder's imports. Phone first, Day only, in the
 * restaurant's own accent and neutral tone.
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
import { DISPLAY } from './publicUi.jsx';

function PageFrame({ site, children }) {
  const style = site?.appearance?.accent
    ? { '--accent': site.appearance.accent, '--accent-night': site.appearance.accentNight }
    : undefined;
  return (
    <div
      data-theme="day"
      data-neutral={site?.appearance?.neutralTone === 'WARM' ? 'warm' : 'cool'}
      style={style}
      className="v2 min-h-full bg-ground text-ink"
    >
      {children}
    </div>
  );
}

/** Every dish with a photo, in menu order. */
const photographed = (menu) => (menu ?? []).flatMap((category) => category.items).filter((item) => item.photoUrl);

function Choice({ to, icon, title, line, badge }) {
  const Icon = icon;
  return (
    <Link
      to={to}
      className="group flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-ink"
    >
      <span className="flex size-14 flex-none items-center justify-center rounded-2xl bg-accent text-on-accent">
        <Icon size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`${DISPLAY} block text-2xl leading-tight`}>{title}</span>
        <span className="type-caption mt-1 block text-muted">{line}</span>
        {badge && <span className="type-caption mt-2 inline-flex rounded-full bg-ok-tint px-2 py-0.5 text-ok">{badge}</span>}
      </span>
      <span aria-hidden="true" className="text-2xl text-muted transition-transform duration-150 group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

function Home({ site, slug }) {
  const menu = useQuery({ queryKey: ['public', 'menu', slug], queryFn: () => getPublicMenu(slug) });
  const { takeaway, reservations } = site;
  const address = [site.address.line1, site.address.line2, site.address.city].filter(Boolean).join(', ');
  const photos = photographed(menu.data);
  // One large and two stacked: a fourth would need a row of its own.
  const mosaic = photos.slice(0, 3);
  // Dishes with photos lead the strip; the rest follow in menu order.
  const everything = (menu.data ?? []).flatMap((category) => category.items);
  const favourites = [...photos, ...everything.filter((item) => !item.photoUrl)].slice(0, 10);
  const deposit = reservations.depositPerPersonInPaise;

  return (
    <>
      <section className="relative bg-accent text-on-accent">
        <div className="mx-auto max-w-3xl px-5 pb-28 pt-10">
          <p className="type-label opacity-80">Order direct. No app, no commission.</p>
          <h1 className={`${DISPLAY} mt-2 text-[clamp(2.75rem,12vw,4.75rem)] leading-[0.92]`}>{site.wordmark ?? site.restaurantName}</h1>
          {address && <p className="type-body mt-3 opacity-90">{address}</p>}
          <p className="type-label mt-4 inline-flex items-center gap-2 rounded-full bg-on-accent/15 px-3 py-1.5">
            <span aria-hidden="true" className={`size-2 rounded-full ${takeaway.openNow ? 'bg-ok-tint' : 'bg-on-accent/50'}`} />
            {takeaway.openNow ? 'Open now' : 'Closed now'} · {formatTimeIst(site.hours.todayOpensAt)} to {formatTimeIst(site.hours.todayClosesAt)}
          </p>
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-20 grid max-w-3xl gap-5 px-4 pb-16">
        {mosaic.length > 0 && (
          <div
            className={[
              'grid h-56 gap-2 sm:h-80',
              mosaic.length === 3 ? 'grid-cols-3 grid-rows-2' : mosaic.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
            ].join(' ')}
          >
            {mosaic.map((item, index) => (
              <DishPhoto
                key={item.id}
                src={item.photoUrl}
                name={item.name}
                className={`h-full min-h-0 w-full rounded-2xl ring-4 ring-ground ${mosaic.length === 3 && index === 0 ? 'col-span-2 row-span-2' : ''}`}
              />
            ))}
          </div>
        )}

        <div className="grid gap-3">
          {takeaway.enabled && (
            takeaway.openNow ? (
              <Choice
                to={`/r/${slug}/order`}
                icon={BagIcon}
                title="Order takeaway"
                line={`Ready from ${formatTimeIst(takeaway.earliestPickupAt)}. ${takeaway.prepay ? 'Pay online, collect at the counter.' : (site.pageNote ?? '')}`}
                badge={takeaway.prepay ? 'Refunded in full if the cafe cannot take it' : null}
              />
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-5">
                <p className={`${DISPLAY} text-2xl`}>Takeaway</p>
                <p className="type-body mt-1 text-muted">{takeaway.message}</p>
              </div>
            )
          )}
          {reservations.enabled && (
            <Choice
              to={`/r/${slug}/book`}
              icon={PeopleIcon}
              title="Book a table"
              line={`Up to ${reservations.maxPartySize} people, up to ${reservations.daysAhead} days ahead.`}
              badge={deposit > 0 ? null : 'No deposit needed'}
            />
          )}
          {deposit > 0 && reservations.enabled && (
            <p className="type-caption px-1 text-muted">
              Bookings take a deposit of <Money paise={deposit} /> a person, taken off your bill on the day.
            </p>
          )}
          {!takeaway.enabled && !reservations.enabled && (
            <p className="type-body text-muted">This cafe is not taking orders or bookings online right now.</p>
          )}
        </div>

        {favourites.length > 0 && takeaway.openNow && (
          <section className="grid gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className={`${DISPLAY} text-2xl`}>On the menu</h2>
              <Link to={`/r/${slug}/order`} className="type-label text-accent">
                See everything
              </Link>
            </div>
            <div className="flex snap-x scroll-px-0 gap-3 overflow-x-auto pb-2">
              {favourites.map((item) => (
                <Link key={item.id} to={`/r/${slug}/order`} className="w-40 flex-none snap-start">
                  <DishPhoto src={item.photoUrl} name={item.name} className="aspect-square w-full rounded-2xl" />
                  <p className="type-label mt-2 line-clamp-2">{item.name}</p>
                  <Money paise={item.priceInPaise} className="type-caption text-muted" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-4 grid gap-1 border-t border-line pt-5">
          <p className={`${DISPLAY} text-lg`}>{site.restaurantName}</p>
          {address && <p className="type-caption text-muted">{address}</p>}
          {site.contactPhone && (
            <a href={`tel:${site.contactPhone}`} className="type-label flex min-h-12 w-fit items-center text-accent">
              Call {site.contactPhone}
            </a>
          )}
          <p className="type-caption text-muted">Prices are before GST. Payments are made to {site.restaurantName} directly.</p>
        </footer>
      </main>
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
