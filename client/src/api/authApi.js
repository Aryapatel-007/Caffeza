/**
 * Auth API calls.
 *
 * Every fetch for this module lives here. Components call these functions and
 * never touch the network themselves.
 */
import { api } from './client.js';

/** Send exactly one of `phone` or `email`, plus `password`. */
export function login({ phone, email, password }) {
  return api.post('/auth/login', email ? { email, password } : { phone, password });
}

export function logout() {
  // No body. The server revokes the session named by the refreshToken cookie
  // and clears it. `api.post` sends the X-Requested-With header the endpoint
  // requires and includes credentials.
  return api.post('/auth/logout');
}

export function logoutEverywhere() {
  return api.post('/auth/logout-all');
}

export function getCurrentUser() {
  return api.get('/auth/me');
}

export function changePassword({ currentPassword, newPassword }) {
  return api.patch('/auth/password', { currentPassword, newPassword });
}

/**
 * Exchanges the refresh-token cookie for a new access token.
 *
 * Deliberately NOT routed through api.post. The client wrapper retries once on
 * TOKEN_EXPIRED by calling this, and if this went through the same path a
 * failing refresh would try to refresh itself.
 *
 * No body: the credential is the httpOnly cookie the browser sends because of
 * `credentials: 'include'`. `X-Requested-With` is required by the endpoint as a
 * CSRF check.
 *
 * ONE REFRESH AT A TIME. The refresh cookie can be used once: the server
 * rotates it, and treats a second use of the old one as theft and signs the
 * person out everywhere. React's StrictMode runs the session restore twice on
 * every page load in development, and several requests can meet an expired
 * token at once in production, so each used to send its own refresh with the
 * same cookie, and the second one signed the person out. Every caller now
 * shares the refresh already in flight.
 */
let refreshInFlight = null;

export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch' },
        credentials: 'include',
      });
      const envelope = await response.json().catch(() => null);
      if (!response.ok || envelope?.success !== true) return null;
      return envelope.data;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
