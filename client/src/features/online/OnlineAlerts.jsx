/**
 * The online alert. P23, API-CONTRACT M14 section 3.1.
 *
 * Mounted once in the app frame. For a role the owner listed in
 * `settings.online.alertRoles`, on a device that has not switched it off, and
 * never on the kitchen screen: polls the inbox every 15 seconds, and when a
 * new request arrives plays a chime, says it aloud, and shows a banner that
 * stays until every request is answered. While anything waits, the chime and
 * the line repeat every minute.
 *
 * The banner is drawn and left still. Nothing pulses and nothing loops: the
 * design system forbids it, and a sound carries across a cafe better than
 * movement does.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { getInbox } from '../../api/online.js';
import { BellIcon } from '../../components/ui/icons/index.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDeviceSettings } from '../printing/useDeviceSettings.js';
import { chime, onUnlockChange, soundIsUnlocked, speak, spokenLine, unlockSound } from './alertSound.js';
import { alertRoleOn } from './inboxOn.js';

const POLL_MS = 15_000;
const REPEAT_MS = 60_000;
export const INBOX_QUERY_KEY = ['online', 'inbox'];

/** Whether this signed-in person, on this device, gets the alert. */
export function useAlertsOn() {
  const { user, features } = useAuth();
  const [device] = useDeviceSettings();
  // P25 Part H. Platform orders ring the same alert, for the till.
  return Boolean(alertRoleOn(features, user?.role) && device.onlineAlerts !== false);
}

/** The inbox, shared by the banner and the nav badge through one query. */
export function useOnlineInbox(enabled) {
  return useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: getInbox,
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
}

function announce(inbox, speakAloud) {
  chime();
  if (speakAloud) speak(spokenLine(inbox.latest));
}

export default function OnlineAlerts() {
  const { pathname } = useLocation();
  const [device] = useDeviceSettings();
  const alertsOn = useAlertsOn() && !pathname.startsWith('/kitchen');
  const { data: inbox } = useOnlineInbox(alertsOn);
  const [unlocked, setUnlocked] = useState(soundIsUnlocked);
  const lastAnnounced = useRef(null);

  // Browsers allow sound only after a tap. Any tap anywhere counts.
  useEffect(() => {
    const off = onUnlockChange(setUnlocked);
    const onTap = () => unlockSound();
    window.addEventListener('pointerdown', onTap);
    window.addEventListener('keydown', onTap);
    return () => {
      off();
      window.removeEventListener('pointerdown', onTap);
      window.removeEventListener('keydown', onTap);
    };
  }, []);

  const waiting = inbox ? inbox.waitingOrders + inbox.waitingReservations + (inbox.waitingPlatformOrders ?? 0) : 0;
  const latestAt = inbox?.latestRequestAt ?? null;

  // A new request: announce it once.
  useEffect(() => {
    if (!alertsOn || !latestAt) return;
    if (lastAnnounced.current === null) {
      // The first read after opening the app. Anything already waiting is
      // announced too, so a device switched on mid-rush is not silent.
      lastAnnounced.current = latestAt;
      if (waiting > 0) announce(inbox, device.speakAlerts);
      return;
    }
    if (new Date(latestAt) > new Date(lastAnnounced.current)) {
      lastAnnounced.current = latestAt;
      announce(inbox, device.speakAlerts);
    }
  }, [alertsOn, latestAt, waiting, inbox, device.speakAlerts]);

  // While anything waits, say so again every minute.
  useEffect(() => {
    if (!alertsOn || waiting === 0) return undefined;
    const timer = setInterval(() => {
      chime();
      if (device.speakAlerts) speak(waiting === 1 ? 'One online request is waiting.' : `${waiting} online requests are waiting.`);
    }, REPEAT_MS);
    return () => clearInterval(timer);
  }, [alertsOn, waiting, device.speakAlerts]);

  // The tab title carries the count, for a till showing another tab.
  useEffect(() => {
    if (!alertsOn || waiting === 0) return undefined;
    const base = document.title.replace(/^\(\d+\)\s/, '');
    document.title = `(${waiting}) ${base}`;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s/, '');
    };
  }, [alertsOn, waiting]);

  if (!alertsOn || waiting === 0) return null;

  // Late once the oldest request has used half the time it had to be answered.
  const halfway =
    inbox.oldestWaitingAt && inbox.oldestAnswerBy
      ? (new Date(inbox.oldestWaitingAt).getTime() + new Date(inbox.oldestAnswerBy).getTime()) / 2
      : null;
  const late = halfway !== null && Date.now() > halfway;
  const words =
    waiting === 1 ? '1 online request waiting' : `${waiting} online requests waiting`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex flex-none flex-wrap items-center gap-3 border-b px-4 py-2 print:hidden',
        late ? 'border-alert bg-alert-tint text-alert' : 'border-open bg-open-tint text-open',
      ].join(' ')}
    >
      <BellIcon />
      <span className="type-label min-w-0 flex-1">
        {words}
        {late && <span className="type-caption ml-2">Answer soon</span>}
      </span>
      {!unlocked && (
        <button
          type="button"
          onClick={unlockSound}
          className="type-label min-h-12 rounded-lg border border-current px-3 hover:bg-surface"
        >
          Tap to turn on sound
        </button>
      )}
      <Link
        to={inbox.waitingOrders > 0 || inbox.waitingPlatformOrders > 0 ? '/online' : '/online/bookings'}
        className="type-button flex min-h-12 items-center rounded-lg bg-surface px-4 text-ink hover:bg-sunken"
      >
        Open
      </Link>
    </div>
  );
}
