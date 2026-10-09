import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getKotTicket, listKots, markKotLineReady, markKotReady, undoKotLineReady, undoKotReady } from '../../api/kitchen.js';
import { listStations } from '../../api/stations.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import TicketCard from '../../components/ui/TicketCard.jsx';
import { useMinuteClock } from '../../components/ui/TimeEdge.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage } from '../orders/errorCopy.js';
import { charactersFor, printText } from '../printing/printText.js';
import { rememberPrinted, useDeviceSettings } from '../printing/useDeviceSettings.js';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

const ALL_STATIONS = 'ALL';

/** A station's target when it has none, or the ticket has no station. Matches the server default. */
const DEFAULT_TARGET_MINUTES = 15;

const ORDER_TYPE_LABELS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

/** P29 Part E. How long the undo bar stays, and how many finished tickets the "Just done" row keeps, for how long. */
const UNDO_BAR_MS = 10_000;
const JUST_DONE_KEEP = 10;
const JUST_DONE_MS = 10 * 60_000;
const JUST_DONE_KEY = 'kitchen.justDone';

/** The tickets finished on this screen, kept for the tab's life so a reload does not lose them. */
function readJustDone() {
  try {
    return JSON.parse(sessionStorage.getItem(JUST_DONE_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function writeJustDone(list) {
  try {
    sessionStorage.setItem(JUST_DONE_KEY, JSON.stringify(list));
  } catch {
    // A browser that refuses storage still shows the row until the tab closes.
  }
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

  /**
   * P29 Part E. The last tick, for the undo bar, and the tickets finished on
   * this screen in the last ten minutes, for the "Just done" row. A wrong tick
   * is easy to take back while the table is not yet billed.
   */
  const [lastTick, setLastTick] = useState(null);
  const [justDone, setJustDone] = useState(readJustDone);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!lastTick) return undefined;
    const timer = setTimeout(() => setLastTick(null), UNDO_BAR_MS);
    return () => clearTimeout(timer);
  }, [lastTick]);
  const keepJustDone = (update) =>
    setJustDone((current) => {
      const next = update(current).slice(0, JUST_DONE_KEEP);
      writeJustDone(next);
      return next;
    });

  const markReady = useMutation({
    mutationFn: ({ kotId, lineId }) =>
      lineId ? markKotLineReady(kotId, lineId) : markKotReady(kotId),
    onSuccess: (kot, { lineId, label }) => {
      setError(null);
      setNotice(null);
      setLastTick({ kotId: kot.id, lineId: lineId ?? null, label, at: Date.now() });
      if (kot.status === 'COMPLETED') {
        keepJustDone((current) => [{ kot, doneAt: Date.now() }, ...current.filter((entry) => entry.kot.id !== kot.id)]);
      }
      queryClient.invalidateQueries({ queryKey: ['kots'] });
      // A floor screen holding this order now has a stale copy.
      queryClient.invalidateQueries({ queryKey: ['order'] });
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const undo = useMutation({
    mutationFn: ({ kotId, lineId }) => (lineId ? undoKotLineReady(kotId, lineId) : undoKotReady(kotId)),
    onSuccess: (kot) => {
      setError(null);
      setLastTick(null);
      keepJustDone((current) => current.filter((entry) => entry.kot.id !== kot.id));
      setNotice(kot.platformAlreadyTold ? 'Back with the kitchen. The platform was already told it was ready.' : 'Back with the kitchen.');
      queryClient.invalidateQueries({ queryKey: ['kots'] });
      queryClient.invalidateQueries({ queryKey: ['order'] });
    },
    onError: (mutationError) => {
      setLastTick(null);
      setError(errorMessage(mutationError));
    },
  });

  /** Fetches the server-laid-out ticket and prints it. Never throws. */
  async function printKot(kotId, { reprint = false } = {}) {
    try {
      const { text } = await getKotTicket(kotId, { width: charactersFor(device.printer), reprint });
      await printText(text, device.printer);
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

  const clock = useMinuteClock();
  const targets = new Map((stations.data ?? []).map((station) => [station.id, station.targetMinutes ?? DEFAULT_TARGET_MINUTES]));
  const targetFor = (kot) => targets.get(kot.stationId) ?? DEFAULT_TARGET_MINUTES;
  const minutesOpen = (kot) => Math.floor((clock - new Date(kot.firedAt).getTime()) / 60_000);
  const isLate = (kot) => minutesOpen(kot) >= targetFor(kot);

  // DESIGN-SYSTEM 8b: oldest first, late tickets moved to the front.
  const kots = [...(tickets.data?.data ?? [])].sort(
    (a, b) => Number(isLate(b)) - Number(isLate(a)) || new Date(a.firedAt) - new Date(b.firedAt),
  );
  const lateCount = kots.filter(isLate).length;
  const recentDone = justDone.filter((entry) => clock - entry.doneAt < JUST_DONE_MS && (!stationFilter || entry.kot.stationId === stationFilter));
  const nameOf = (kot, lineId) => kot.lines.find((line) => line.id === lineId)?.itemName ?? 'That dish';

  return (
    <main className="v2 min-h-full bg-ground text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="type-title">Kitchen</h1>
          <span className="type-caption text-muted">
            <span className="type-num-meta text-ink">{kots.length}</span> open
          </span>
          {lateCount > 0 && <StateChip state="alert" word={`${lateCount} late`} size="sm" />}
        </div>

        <div className="text-right">
          <p className="type-num-tile">{formatTimeIst(clock)}</p>
          <p className="type-caption text-muted">
            Updates every 10 seconds
            {device.autoPrintKots && stationFilter && ' · Printing new tickets'}
          </p>
        </div>

        {/* P05. The station picker. Remembered on this device. */}
        {(stations.data ?? []).length > 0 && (
          <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1" role="tablist" aria-label="Station">
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
                    'type-label min-h-12 flex-none whitespace-nowrap rounded-lg border px-4 transition-colors',
                    active ? 'border-ink bg-sunken text-ink' : 'border-line bg-surface text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {station.name}
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="type-body w-full text-alert">{error}</p>}
        {notice && <p className="type-body w-full text-muted">{notice}</p>}
      </header>

      {/* P29 Part E. The tickets finished on this screen in the last ten minutes, each with Undo. */}
      {recentDone.length > 0 && (
        <section aria-label="Just done" className="border-b border-line bg-surface px-4 py-3 sm:px-6">
          <h2 className="type-label mb-2 text-muted">Just done</h2>
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {recentDone.map(({ kot, doneAt }) => (
              <li key={kot.id} className="flex flex-none items-center gap-3 rounded-lg border border-line px-3 py-1">
                <span className="type-body whitespace-nowrap">
                  <span className="type-num-meta">KOT {kot.kotNumber}</span> · {kot.tableName ?? `Order ${kot.orderNumber}`}
                  <span className="type-caption text-muted"> · {formatTimeIst(new Date(doneAt))}</span>
                </span>
                <button
                  type="button"
                  disabled={undo.isPending}
                  onClick={() => undo.mutate({ kotId: kot.id })}
                  className="type-label min-h-12 rounded-lg border border-line px-3 hover:bg-sunken disabled:opacity-50"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="p-4 sm:p-6">
        {tickets.isPending && <Spinner label="Loading tickets" />}

        {tickets.isError && <p className="type-body text-alert">{errorMessage(tickets.error)}</p>}

        {tickets.isSuccess && kots.length === 0 && (
          <EmptyState title="All caught up" description="Nothing is waiting. New tickets appear here on their own." />
        )}

        <ul className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kots.map((kot) => (
            <li key={kot.id}>
              <TicketCard
                kotNumber={kot.kotNumber}
                place={kot.tableName ?? `Order ${kot.orderNumber}`}
                subtitle={[ORDER_TYPE_LABELS[kot.orderType] ?? kot.orderType, `#${kot.orderNumber}`, kot.stationName, `Fired ${formatTimeIst(kot.firedAt)}`]
                  .filter(Boolean)
                  .join(' · ')}
                firedAt={kot.firedAt}
                targetMinutes={targetFor(kot)}
                lines={kot.lines}
                notPrinted={notPrinted.has(kot.id)}
                onReprint={() => printKot(kot.id, { reprint: true })}
                isBusy={markReady.isPending || undo.isPending}
                onLineReady={(lineId) => markReady.mutate({ kotId: kot.id, lineId, label: `${nameOf(kot, lineId)} marked ready.` })}
                onLineUndo={(lineId) => undo.mutate({ kotId: kot.id, lineId })}
                onAllReady={() => markReady.mutate({ kotId: kot.id, label: `KOT ${kot.kotNumber} marked ready.` })}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* P29 Part E. The last tick, with a large Undo, for ten seconds. */}
      {lastTick && (
        <div role="status" className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-2 shadow-float sm:px-6">
          <span className="type-body">{lastTick.label}</span>
          <button
            type="button"
            disabled={undo.isPending}
            onClick={() => undo.mutate({ kotId: lastTick.kotId, lineId: lastTick.lineId })}
            className="type-button min-h-14 rounded-lg bg-accent px-6 text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
