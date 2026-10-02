import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getKotTicket, listKots, markKotLineReady, markKotReady } from '../../api/kitchen.js';
import { listStations } from '../../api/stations.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import TicketCard from '../../components/ui/TicketCard.jsx';
import { useMinuteClock } from '../../components/ui/TimeEdge.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import { errorMessage } from '../orders/errorCopy.js';
import { charactersFor, printText } from '../printing/printText.js';
import { rememberPrinted, useDeviceSettings } from '../printing/useDeviceSettings.js';

const ALL_STATIONS = 'ALL';

/** A station's target when it has none, or the ticket has no station. Matches the server default. */
const DEFAULT_TARGET_MINUTES = 15;

const ORDER_TYPE_LABELS = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

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
      </header>

      <div className="p-4 sm:p-6">
        {tickets.isPending && <p className="type-body text-muted">Loading tickets…</p>}

        {tickets.isError && <p className="type-body text-alert">{errorMessage(tickets.error)}</p>}

        {tickets.isSuccess && kots.length === 0 && (
          <div className="py-16">
            <p className="type-title">All caught up</p>
            <p className="type-body mt-1 text-muted">Nothing is waiting. New tickets appear here on their own.</p>
          </div>
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
