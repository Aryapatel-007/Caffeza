import { useEffect } from 'react';

import { withinWorkingHours } from '../../api/coldStart.js';
import { pingWake } from '../../api/system.js';
import { useAuth } from '../../context/AuthContext.jsx';

const BEAT_MS = 5 * 60_000;
const MARGIN_MINUTES = 30;

/**
 * The heartbeat. P30, API-CONTRACT P30 section 5.
 *
 * One timer for the whole app, mounted once beside it: while someone is
 * signed in, every 5 minutes, it calls the wake address so Render's free
 * server never reaches its 15 minutes without a request. Only while this tab is
 * visible, so a phone in a pocket keeps nothing awake, and only within the
 * restaurant's working hours plus 30 minutes either side. The hours are the
 * online page's while it is switched on; while it is off they are a default
 * nobody chose, so every hour counts. Signing out stops it. A failed ping is
 * ignored.
 */
export default function ServerHeartbeat() {
  const { user, features } = useAuth();
  const online = features?.online;
  const useHours = Boolean(online?.enabled);
  const opensAtMinutes = useHours ? online.opensAtMinutes : null;
  const closesAtMinutes = useHours ? online.closesAtMinutes : null;
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn) return undefined;
    const hours = opensAtMinutes === null ? null : { opensAtMinutes, closesAtMinutes };
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      if (!withinWorkingHours(Date.now(), hours, MARGIN_MINUTES)) return;
      pingWake();
    };
    const timer = setInterval(beat, BEAT_MS);
    // Coming back to a tab is a good moment to wake the server, before the next tap.
    const onVisible = () => document.visibilityState === 'visible' && beat();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, opensAtMinutes, closesAtMinutes]);

  return null;
}
