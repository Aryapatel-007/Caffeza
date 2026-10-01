import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getDay } from '../../api/dayClose.js';
import { businessDateBefore, businessDateToday, formatBusinessDate } from '../../utils/formatDate.js';

/**
 * A plain warning on the dashboard when yesterday's business date traded but
 * was not closed. P10. Owner and manager only; quiet on any error, because a
 * warning that cannot load must not get in the way of the dashboard.
 */
export default function UnclosedDayWarning() {
  const yesterday = businessDateBefore(businessDateToday());
  const query = useQuery({
    queryKey: ['day-close', yesterday],
    queryFn: () => getDay(yesterday),
    retry: false,
    staleTime: 60_000,
  });

  const day = query.data;
  if (!day || day.isClosed) return null;
  const traded = day.figures.sales.billCount > 0 || day.figures.cash.openingFloatInPaise > 0;
  if (!traded) return null;

  return (
    <p className="border-b-2 border-mirch bg-mirch/5 px-6 py-3 text-sm text-ink">
      {formatBusinessDate(yesterday)} has not been closed.{' '}
      <Link to={`/day-close?date=${yesterday}`} className="font-semibold underline">
        Close it now
      </Link>
    </p>
  );
}
