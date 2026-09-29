import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as authApi from '../api/authApi.js';
import { setAccessToken, setSessionHandlers } from '../api/client.js';

/**
 * The session.
 *
 * Holds the signed-in user and the access token, and nothing else. It does not
 * decide what the user may do. React can hide a button, but the server is what
 * stops the action.
 *
 * The access token is kept in React state, in memory, and never in
 * localStorage: a 15 minute credential should die with the tab. The refresh
 * token is an httpOnly cookie set by the server (M0-D). The client never sees
 * it, never stores it, and cannot read it; the browser sends it to the auth
 * endpoints on its own. So there is nothing to persist here and no way to tell
 * from JavaScript whether a session exists without asking the server.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // True until we know whether there is a session to restore. Starting at
  // false would flash the login screen at someone who is already signed in.
  const [isRestoring, setIsRestoring] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
  }, []);

  const login = useCallback(async (credentials) => {
    // credentials is { phone, password } or { email, password }.
    const data = await authApi.login(credentials);
    // The refresh token came back as a cookie, not in `data`.
    setUser(data.user);
    setToken(data.accessToken);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      // Tell the server so the refresh token is revoked and its cookie cleared.
      // Clearing local state alone would end the session in this tab and nowhere
      // else, and leave the cookie live.
      await authApi.logout();
    } catch {
      // Logout must never fail visibly. The local session goes either way.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  /**
   * Exchanges the refresh-token cookie for a new access token.
   *
   * Returns the new access token, or null when the session is genuinely over.
   * The API client calls this once on TOKEN_EXPIRED and gives up if it returns
   * null, so there is exactly one retry path in the app rather than two.
   */
  const refresh = useCallback(async () => {
    const data = await authApi.refreshSession();
    if (!data) return null;

    // Rotation happens server-side and the new refresh token is set as a fresh
    // cookie. The client only takes the new access token.
    setToken(data.accessToken);
    return data.accessToken;
  }, []);

  // Keep the API client in step with the token it should be sending.
  useEffect(() => {
    setAccessToken(token);
  }, [token]);

  useEffect(() => {
    setSessionHandlers({ refresh, sessionLost: clearSession });
  }, [refresh, clearSession]);

  // Restore the session on a page reload, so a hard refresh mid-shift does not
  // drop someone at the login screen. There is no stored token to check first:
  // just ask the server to refresh, and treat a failure as "no session".
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const data = await authApi.refreshSession();
        if (cancelled) return;

        if (!data) {
          clearSession();
          return;
        }

        setAccessToken(data.accessToken);
        setToken(data.accessToken);

        const me = await authApi.getCurrentUser();
        if (!cancelled) setUser(me.user);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: user !== null,
      isRestoring,
      login,
      logout,
      refresh,
    }),
    [user, token, isRestoring, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
