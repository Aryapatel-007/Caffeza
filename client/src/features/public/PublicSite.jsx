/**
 * The restaurant's public page. P23 (M14), /r/:slug.
 *
 * A guest orders takeaway or asks for a table. No sign-in, no app frame, and
 * nothing imported from the staff screens, the staff API client or the sign-in
 * context: a test reads this folder's imports. Phone first, in Day, in the
 * restaurant's own accent and neutral tone.
 */
import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes, useParams } from 'react-router-dom';

import { getSite } from '../../api/publicSite.js';
import Spinner from '../../components/ui/Spinner.jsx';
import { BagIcon, PeopleIcon } from '../../components/ui/icons/index.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import PublicBook from './PublicBook.jsx';
import PublicOrder from './PublicOrder.jsx';
import { BookingStatus, OrderStatus } from './PublicStatus.jsx';

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

export function SiteHeader({ site, slug, back = false }) {
  return (
    <header className="border-b border-line bg-surface px-4 py-3">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <Link to={`/r/${slug}`} className="type-title min-w-0 truncate">
          {site.wordmark ?? site.restaurantName}
        </Link>
        {back && (
          <Link to={`/r/${slug}`} className="type-label flex min-h-12 items-center text-accent">
            Back
          </Link>
        )}
      </div>
    </header>
  );
}

function Home({ site, slug }) {
  const { takeaway, reservations } = site;
  const address = [site.address.line1, site.address.line2, site.address.city].filter(Boolean).join(', ');
  const choice = (to, Icon, title, line, enabled) =>
    enabled ? (
      <Link to={to} className="flex min-h-20 items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:bg-sunken">
        <span className="flex size-12 flex-none items-center justify-center rounded-full bg-sunken text-accent">
          <Icon size={24} />
        </span>
        <span className="min-w-0">
          <span className="type-heading block">{title}</span>
          <span className="type-caption block text-muted">{line}</span>
        </span>
      </Link>
    ) : null;

  return (
    <>
      <SiteHeader site={site} slug={slug} />
      <main className="mx-auto grid max-w-xl gap-4 px-4 py-6">
        <div className="grid gap-1">
          <h1 className="type-title">{site.restaurantName}</h1>
          {address && <p className="type-body text-muted">{address}</p>}
          <p className="type-body">
            Open {formatTimeIst(site.hours.todayOpensAt)} to {formatTimeIst(site.hours.todayClosesAt)}
          </p>
          {site.contactPhone && (
            <a href={`tel:${site.contactPhone}`} className="type-label flex min-h-12 w-fit items-center text-accent">
              Call {site.contactPhone}
            </a>
          )}
        </div>

        {choice(
          `/r/${slug}/order`,
          BagIcon,
          'Order takeaway',
          takeaway.openNow ? `Ready from ${formatTimeIst(takeaway.earliestPickupAt)}. ${site.pageNote ?? ''}` : takeaway.message,
          takeaway.enabled && takeaway.openNow,
        )}
        {takeaway.enabled && !takeaway.openNow && <p className="type-body rounded-xl border border-line bg-surface p-4 text-muted">{takeaway.message}</p>}
        {choice(`/r/${slug}/book`, PeopleIcon, 'Book a table', `Up to ${reservations.maxPartySize} people, up to ${reservations.daysAhead} days ahead.`, reservations.enabled)}
        {!takeaway.enabled && !reservations.enabled && (
          <p className="type-body text-muted">This cafe is not taking orders or bookings online right now.</p>
        )}
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
        <div className="mx-auto max-w-xl p-6">
          <Spinner label="Loading" />
        </div>
      </PageFrame>
    );
  }
  if (site.isError) {
    return (
      <PageFrame>
        <main className="mx-auto grid max-w-xl gap-2 p-6">
          <h1 className="type-title">{site.error.status === 404 ? 'This page does not exist' : 'Something went wrong'}</h1>
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
