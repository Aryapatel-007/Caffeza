import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getKotTicket, listKots, markKotLineReady, markKotReady } from '../../api/kitchen.js';
import { listStations } from '../../api/stations.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage } from '../orders/errorCopy.js';
import { charactersFor, printText } from '../printing/printText.js';
import { rememberPrinted, useDeviceSettings } from '../printing/useDeviceSettings.js';

const ALL_STATIONS = 'ALL';

/**
 * The kitchen display.
 *
 * Polls every ten seconds. Not websockets: at one restaurant's scale polling is
 * enough, and it is one less thing to debug in a kitchen with bad wifi, where
 * a dropped socket that silently stops delivering tickets is far worse than a
 * ten second delay. This was a decision, not a shortcut. See PROJECT-STATE.md.
 *
 * Oldest ticket first, because that is the order a kitchen works in.
 *
 * P05: a station picker at the top filters the tickets to one station. It
 * opens on the signed-in user's station when they have one, and the choice is
 * remembered on the device. With auto-print on and one station chosen, every
 * ticket that appears for the first time prints once.
 *
 * Everything here is sized for someone standing back from a screen with their
 * hands full: big type, whole rows as tap targets, and no nested navigation.
 */
export default function KitchenDisplayPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [device, updateDevice] = useDeviceSettings();
  const [error, setError] = useState(null);
  // KOT ids whose print failed on this screen. Shown as "Not printed".
  const [notPrinted, setNotPrinted] = useState(() => new Set());

  const chosenStation = device.kitchenStationId ?? user?.stationId ?? ALL_STATIONS;
  const stationFilter = chosenStation === ALL_STATIONS ? undefined : chosenStation;

  const stations = useQuery({ queryKey: ['stations'], queryFn: () => listStations() });

  const tickets = useQuery({
    queryKey: ['kots', { status: 'PENDING,IN_PROGRESS', stationId: stationFilter ?? null }],
    queryFn: () => listKots({ status: 'PENDING,IN_PROGRESS', limit: 50, stationId: stationFilter }),
    refetchInterval: 10_000,
    // A ticket board that stops updating when the tab loses focus is a ticket
    // board that lies to a kitchen. Keep polling regardless.
    refetchIntervalInBackground: true,
  });

  const markReady = useMutation({
    mutationFn: ({ kotId, lineId }) =>
      lineId ? markKotLineReady(kotId, lineId) : markKotReady(kotId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['kots'] });
      // A floor screen holding this order now has a stale copy.
      queryClient.invalidateQueries({ queryKey: ['order'] });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  /** Fetches the server-laid-out ticket and prints it. Never throws. */
  async function printKot(kotId, { reprint = false } = {}) {
    try {
      const { text } = await getKotTicket(kotId, { width: charactersFor(device.paperMm), reprint });
      await printText(text, device.paperMm);
      setNotPrinted((current) => {
        const next = new Set(current);
        next.delete(kotId);
        return next;
      });
    } catch {
      setNotPrinted((current) => new Set(current).add(kotId));
    }
  }

  /**
   * Auto-print. Only with one station chosen: "All stations" is a manager's
   * overview, not a printer's queue.
   *
   * The printed ids live on the device, the most recent 500, so a refresh or a
   * re-poll never prints a ticket twice. The first time this runs after
   * auto-print is switched on, or after the station changes, every ticket
   * already on screen is marked printed without printing, so turning it on in
   * the middle of service does not print a backlog. A print failure never
   * stops the polling; the ticket just shows "Not printed".
   */
  const printing = useRef(false);
  useEffect(() => {
    if (!device.autoPrintKots || !stationFilter || !tickets.isSuccess || printing.current) return;
    const onScreen = (tickets.data?.data ?? []).map((kot) => kot.id);
    const seedKey = `${device.autoPrintArmedAt ?? 0}:${stationFilter}`;

    if (device.autoPrintSeededFor !== seedKey) {
      updateDevice((current) => ({
        autoPrintSeededFor: seedKey,
        printedKotIds: rememberPrinted(current.printedKotIds, onScreen),
      }));
      return;
    }

    const fresh = onScreen.filter((id) => !device.printedKotIds.includes(id));
    if (fresh.length === 0) return;

    printing.current = true;
    // Recorded before printing, so a slow printer never gets the same ticket
    // again from the next poll.
    updateDevice((current) => ({ printedKotIds: rememberPrinted(current.printedKotIds, fresh) }));
    (async () => {
      for (const id of fresh) await printKot(id);
      printing.current = false;
    })();
    // printKot reads the device width; the dependencies below are what decide
    // whether there is anything new to print.
  }, [tickets.data, device.autoPrintKots, device.autoPrintSeededFor, device.autoPrintArmedAt, stationFilter]);

  const kots = tickets.data?.data ?? [];

  return (
    <main className="min-h-full bg-paper">
      <header className="sticky top-0 z-10 border-b-2 border-ink bg-paper px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Kitchen</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              <span className="font-mono">{kots.length}</span> tickets waiting
            </p>
          </div>
          <Link
            to="/floor"
            className="flex h-12 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Floor
          </Link>
        </div>

        {/* P05. The station picker. Remembered on this device. */}
        {(stations.data ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Station">
            {[{ id: ALL_STATIONS, name: 'All stations' }, ...(stations.data ?? [])].map((station) => {
              const active = chosenStation === station.id;
              return (
                <button
                  key={station.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => updateDevice({ kitchenStationId: station.id })}
                  className={[
                    'h-11 rounded-full px-4 text-[15px] font-medium',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    active ? 'border-2 border-ink bg-chana/20 text-ink' : 'border-2 border-steel/40 text-steel',
                  ].join(' ')}
                >
                  {station.name}
                </button>
              );
            })}
            {device.autoPrintKots && stationFilter && (
              <span className="flex h-11 items-center text-[13px] text-steel">Printing new tickets</span>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-[13px] leading-[18px] text-mirch">{error}</p>}
      </header>

      <div className="px-4 py-4 sm:px-6">
        {tickets.isPending && <p className="text-[15px] text-steel">Loading tickets…</p>}

        {tickets.isError && (
          <p className="text-[15px] text-mirch">{errorMessage(tickets.error)}</p>
        )}

        {tickets.isSuccess && kots.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[20px] font-semibold leading-7">All caught up</p>
            <p className="mt-1 text-[15px] leading-[22px] text-steel">
              Nothing is waiting. New tickets appear here on their own.
            </p>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {kots.map((kot) => (
            <li key={kot.id}>
              <Ticket
                kot={kot}
                notPrinted={notPrinted.has(kot.id)}
                onReprint={() => printKot(kot.id, { reprint: true })}
                isBusy={markReady.isPending}
                onLineReady={(lineId) => markReady.mutate({ kotId: kot.id, lineId })}
                onAllReady={() => markReady.mutate({ kotId: kot.id })}
              />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

/** One chit. Ink on paper, like the thing it replaces. */
function Ticket({ kot, notPrinted, onReprint, isBusy, onLineReady, onAllReady }) {
  const outstanding = kot.lines.filter((line) => line.status === 'PENDING');

  return (
    <article className="flex h-full flex-col rounded-[10px] border-2 border-ink bg-paper">
      <header className="flex items-baseline justify-between gap-2 border-b-2 border-ink px-3 py-2.5">
        <div>
          <p className="text-[15px] font-semibold leading-5">
            {kot.tableName ?? 'Takeaway'}
          </p>
          <p className="font-mono text-[12px] leading-4 text-steel">
            #{kot.orderNumber} · KOT {kot.kotNumber}
          </p>
          {kot.stationName && (
            <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.06em] text-steel">
              {kot.stationName}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <SinceFired firedAt={kot.firedAt} />
          <button
            type="button"
            onClick={onReprint}
            className="h-9 rounded-[8px] px-2 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Reprint
          </button>
        </div>
      </header>

      {notPrinted && (
        <p className="border-b-2 border-mirch/40 bg-mirch/5 px-3 py-1.5 text-[13px] font-medium text-mirch">
          Not printed. Tap Reprint.
        </p>
      )}

      <ul className="flex-1 divide-y divide-steel/20 px-3">
        {kot.lines.map((line) => {
          const isDone = line.status === 'READY';
          const isCancelled = line.status === 'CANCELLED';

          return (
            <li key={line.id}>
              <button
                type="button"
                disabled={isBusy || isDone || isCancelled}
                onClick={() => onLineReady(line.id)}
                className={[
                  'flex min-h-[56px] w-full items-start gap-3 py-3 text-left',
                  'transition-transform active:translate-y-0.5',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  'disabled:cursor-default',
                  isDone || isCancelled ? 'opacity-50' : '',
                ].join(' ')}
              >
                {/* Quantity is a number, so it is Mono, and it is the first
                    thing a cook needs to read. */}
                <span className="font-mono text-[18px] font-semibold leading-6">
                  {line.quantity}×
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={[
                      'block text-[15px] leading-[22px]',
                      isCancelled ? 'line-through' : '',
                    ].join(' ')}
                  >
                    {line.itemName}
                    {line.variantName && <span className="text-steel"> · {line.variantName}</span>}
                  </span>

                  {line.addOnNames.length > 0 && (
                    <span className="block text-[13px] leading-[18px] text-steel">
                      + {line.addOnNames.join(', ')}
                    </span>
                  )}

                  {line.notes && (
                    <span className="block text-[13px] leading-[18px] text-mirch">
                      {line.notes}
                    </span>
                  )}

                  {isCancelled && (
                    <span className="block text-[13px] font-medium leading-[18px] text-mirch">
                      Cancelled — do not make
                    </span>
                  )}
                </span>

                {isDone && (
                  <span className="flex-none text-[13px] font-medium leading-[18px] text-patta">
                    Ready
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t-2 border-ink px-3 py-2.5">
        <button
          type="button"
          disabled={isBusy || outstanding.length === 0}
          onClick={onAllReady}
          className="h-14 w-full rounded-[10px] bg-chana text-[15px] font-semibold text-ink transition-transform active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {outstanding.length === 0
            ? 'All ready'
            : `All ${outstanding.length} ready`}
        </button>
      </footer>
    </article>
  );
}

/**
 * How long this has been waiting.
 *
 * The number a cook actually cares about, so it ticks on its own once a minute
 * rather than only when the poll happens to land.
 */
function SinceFired({ firedAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.max(0, Math.floor((now - new Date(firedAt).getTime()) / 60_000));

  return (
    <span
      className="flex-none font-mono text-[18px] font-semibold leading-6"
      title={formatTimeIst(firedAt)}
    >
      {minutes}m
    </span>
  );
}
