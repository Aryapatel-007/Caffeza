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

/** Display thresholds, from the kitchen board design: under 10 minutes is normal. */
const WARN_MINUTES = 10;
const LATE_MINUTES = 15;

const ORDER_TYPE_LABELS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

function minutesSince(instant, now) {
  return Math.max(0, Math.floor((now - new Date(instant).getTime()) / 60_000));
}

/** The current time, refreshed on an interval so waits and the clock move on their own. */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

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
  const now = useNow(15_000);

  const lateCount = kots.filter((kot) => minutesSince(kot.firedAt, now) > LATE_MINUTES).length;

  return (
    <main className="min-h-full bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-linen px-4 py-4 shadow-card sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="size-3.5 animate-pulse rounded-full bg-patta" />
            <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em]">Kitchen</h1>
          </div>

          {/* P05. The station picker. Remembered on this device. */}
          {(stations.data ?? []).length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1 rounded-full bg-linen-2 p-1"
              role="tablist"
              aria-label="Station"
            >
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
                      'h-11 rounded-full px-5 text-[14px] font-semibold transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                      active ? 'bg-ink text-white shadow-card' : 'text-steel hover:text-ink',
                    ].join(' ')}
                  >
                    {station.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-linen-3 px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider">
              <span aria-hidden className="size-2 rounded-full bg-steel" />
              <span className="font-mono">{kots.length}</span> open
            </span>
            {lateCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-mirch-soft px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wider text-mirch shadow-card">
                <span aria-hidden className="size-2 rounded-full bg-mirch" />
                <span className="font-mono">{lateCount}</span> late (&gt;{LATE_MINUTES}m)
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono text-[28px] font-bold leading-9 tracking-tighter">
              {formatTimeIst(now)}
            </p>
            <p className="font-mono text-[12px] text-steel">
              Updates every 10 seconds
              {device.autoPrintKots && stationFilter && ' · Printing new tickets'}
            </p>
          </div>
        </div>

        {error && <p className="w-full text-[13px] leading-[18px] text-mirch">{error}</p>}
      </header>

      <div className="p-4 sm:p-6">
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

        <ul className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {kots.map((kot) => (
            <li key={kot.id}>
              <Ticket
                kot={kot}
                now={now}
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

/** One chit. */
function Ticket({ kot, now, notPrinted, onReprint, isBusy, onLineReady, onAllReady }) {
  const outstanding = kot.lines.filter((line) => line.status === 'PENDING');
  const minutes = minutesSince(kot.firedAt, now);
  const tone =
    minutes > LATE_MINUTES
      ? { bar: 'bg-mirch', chip: 'bg-mirch-soft text-mirch', late: true }
      : minutes >= WARN_MINUTES
        ? { bar: 'bg-chana', chip: 'bg-chana-soft text-ink', late: false }
        : { bar: 'bg-patta', chip: 'bg-patta-tint text-ink', late: false };

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-card transition-shadow hover:shadow-lift">
      <div aria-hidden className={`h-3 w-full ${tone.bar}`} />

      <header className="flex items-start justify-between gap-2 border-b border-black/5 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[22px] font-bold leading-none">KOT {kot.kotNumber}</span>
            <span className="rounded-full bg-linen-3 px-2.5 py-1 text-[11px] font-bold uppercase">
              {ORDER_TYPE_LABELS[kot.orderType] ?? kot.orderType}
            </span>
          </div>
          <p className="mt-2 truncate text-[22px] font-bold leading-7 tracking-tight">
            {kot.tableName ?? `Order #${kot.orderNumber}`}
          </p>
          <p className="font-mono text-[12px] leading-4 text-steel">
            #{kot.orderNumber}
            {kot.stationName && ` · ${kot.stationName}`}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[13px] font-bold ${tone.chip}`}
            title={formatTimeIst(kot.firedAt)}
          >
            {minutes}m{tone.late && ' (late)'}
          </span>
          <button
            type="button"
            onClick={onReprint}
            className="h-9 rounded-lg px-2 text-[13px] font-medium text-steel hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Reprint
          </button>
        </div>
      </header>

      {notPrinted && (
        <p className="bg-mirch-soft px-5 py-1.5 text-[13px] font-medium text-mirch">
          Not printed. Tap Reprint.
        </p>
      )}

      <ul className="flex flex-1 flex-col gap-1 px-5 py-3">
        {kot.lines.map((line) => {
          const isDone = line.status === 'READY';
          const isCancelled = line.status === 'CANCELLED';

          return (
            <li key={line.id} className={isCancelled ? 'rounded-xl bg-linen p-3' : ''}>
              <button
                type="button"
                disabled={isBusy || isDone || isCancelled}
                onClick={() => onLineReady(line.id)}
                className={[
                  'flex min-h-[56px] w-full items-start gap-3 py-2 text-left',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  'disabled:cursor-default',
                  isDone ? 'opacity-70' : '',
                ].join(' ')}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={[
                      'block text-[19px] leading-[26px]',
                      isDone ? 'font-medium line-through decoration-2 decoration-patta' : 'font-bold',
                      isCancelled ? 'font-medium text-steel line-through decoration-mirch decoration-2' : '',
                    ].join(' ')}
                  >
                    {/* Quantity is a number, so it is Mono, and it is the first
                        thing a cook needs to read. */}
                    <span className="mr-1.5 font-mono text-chana">{line.quantity} ×</span>
                    {line.itemName}
                    {line.variantName && <span className="text-steel"> · {line.variantName}</span>}
                  </span>

                  {line.addOnNames.length > 0 && (
                    <span className="block pl-6 text-[14px] italic leading-5 text-steel">
                      + {line.addOnNames.join(', ')}
                    </span>
                  )}

                  {line.notes && (
                    <span className="block pl-6 text-[14px] italic leading-5 text-mirch">
                      {line.notes}
                    </span>
                  )}

                  {isCancelled && (
                    <span className="mt-1 inline-block rounded-full bg-mirch-soft px-2 py-0.5 text-[11px] font-bold uppercase text-mirch">
                      Cancelled — do not make
                    </span>
                  )}
                </span>

                {!isCancelled && (
                  <span
                    aria-hidden
                    className={[
                      'flex size-12 flex-none items-center justify-center rounded-full text-[22px] shadow-card',
                      isDone ? 'bg-patta text-white' : 'bg-linen-2 text-steel',
                    ].join(' ')}
                  >
                    ✓
                  </span>
                )}
                {isDone && <span className="sr-only">Ready</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-black/5 px-5 py-2 font-mono text-[12px] text-steel">
        <span>Placed {formatTimeIst(kot.firedAt)}</span>
      </div>

      <footer className="bg-linen px-4 py-4">
        <button
          type="button"
          disabled={isBusy || outstanding.length === 0}
          onClick={onAllReady}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-bold tracking-wide text-white shadow-card transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          {outstanding.length === 0 ? 'All ready' : `All ${outstanding.length} ready · complete`}
        </button>
      </footer>
    </article>
  );
}
