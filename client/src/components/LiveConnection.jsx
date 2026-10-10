import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { startLive, stopLive } from '../api/live.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * P33. Opens this device's live channel while someone is signed in and the
 * server has it on, and closes it on sign-out. Draws nothing: no banner, no
 * indicator. The connection itself lives in `src/api/live.js`.
 */
export default function LiveConnection() {
  const { user, token, features } = useAuth();
  const queryClient = useQueryClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const enabled = Boolean(features.live?.enabled) && user !== null;
  const origin = features.live?.origin ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!enabled) return undefined;
    startLive({ origin, getToken: () => tokenRef.current, client: queryClient });
    return () => stopLive();
  }, [enabled, origin, userId, queryClient]);

  return null;
}
