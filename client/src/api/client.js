/**
 * The API client.
 *
 * Every request to the server goes through here. No component calls fetch.
 *
 * It does four things: attaches the access token, unwraps the standard
 * envelope, turns a failure into a typed error carrying error.code, and
 * handles one token refresh transparently so a cashier is not thrown back to
 * the login screen every fifteen minutes.
 */

export const API_BASE_URL = '/api/v1';

/**
 * An API failure, carrying the code from the server.
 *
 * Always switch on `code`. Never on `message`, which is written for a person
 * to read and will change.
 *
 * M2: a few errors carry a value the client acts on rather than displays.
 * TABLE_OCCUPIED carries `existingOrderId` so the second waiter can open the
 * order that won instead of hitting a dead end, and VERSION_CONFLICT carries
 * `currentVersion`. The contract names both at the top level of `error`, so
 * anything there that is not one of the three known keys is copied across
 * rather than dropped. Without this the ids arrive from the server and vanish
 * one line into the client.
 */
export class ApiError extends Error {
  constructor({ code, message, fields, status, ...rest }) {
    super(message ?? 'Something went wrong.');
    this.name = 'ApiError';
    this.code = code ?? 'INTERNAL_ERROR';
    this.status = status;
    if (fields) this.fields = fields;

    // Whatever else the envelope carried: existingOrderId, currentVersion.
    Object.assign(this, rest);
  }
}

/**
 * The access token lives in memory only, never in localStorage. Anything in
 * localStorage is readable by any script that gets onto the page.
 *
 * AuthContext owns the value and pushes it in here.
 */
let accessToken = null;
let refreshSession = null;
let onSessionLost = null;

export function setAccessToken(token) {
  accessToken = token ?? null;
}

/**
 * Registered by AuthContext.
 *
 * `refresh` returns a new access token, or null if the session is gone.
 * `sessionLost` is called once the client has given up, so the app can clear
 * its state and route to the login screen.
 *
 * TODO(M0-B): the refresh call itself lands with the auth endpoints. Until
 * then `refresh` is null and a TOKEN_EXPIRED goes straight to sessionLost.
 */
export function setSessionHandlers({ refresh, sessionLost } = {}) {
  refreshSession = refresh ?? null;
  onSessionLost = sessionLost ?? null;
}

async function readEnvelope(response) {
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    // A response that is not JSON did not come from our API. A proxy error
    // page, a gateway timeout, something in between.
    throw new ApiError({
      code: 'INTERNAL_ERROR',
      message: 'The server sent something we could not read.',
      status: response.status,
    });
  }

  if (response.ok && envelope?.success === true) return envelope;

  // Spread first so `status` cannot be shadowed by a key from the server.
  throw new ApiError({ ...envelope?.error, status: response.status });
}

async function sendRequest(path, { method = 'GET', body, signal } = {}) {
  const headers = {
    // Marks every call as one the app made deliberately. /auth/refresh and
    // /auth/logout require it as a CSRF check; sending it on every request
    // keeps that rule in one place and costs nothing elsewhere.
    'X-Requested-With': 'fetch',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    // Sends the httpOnly refresh-token cookie to the auth endpoints.
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  return readEnvelope(response);
}

/**
 * Makes a request, refreshing the token once if it has expired.
 *
 * Exactly once. A refresh that fails, or a retry that expires again, means the
 * session is genuinely over, and looping on it would hammer the server while
 * showing the user nothing.
 */
async function request(path, options = {}) {
  try {
    return await sendRequest(path, options);
  } catch (error) {
    const isExpired = error instanceof ApiError && error.code === 'TOKEN_EXPIRED';
    if (!isExpired) throw error;

    const newToken = refreshSession ? await refreshSession().catch(() => null) : null;

    if (!newToken) {
      onSessionLost?.();
      throw error;
    }

    setAccessToken(newToken);

    try {
      return await sendRequest(path, options);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.code === 'TOKEN_EXPIRED') {
        onSessionLost?.();
      }
      throw retryError;
    }
  }
}

/**
 * Returns the data out of the envelope.
 *
 * A caller that also needs the paging block uses requestWithMeta instead.
 */
export const api = {
  get: async (path, options) => (await request(path, { ...options, method: 'GET' })).data,
  post: async (path, body, options) =>
    (await request(path, { ...options, method: 'POST', body })).data,
  patch: async (path, body, options) =>
    (await request(path, { ...options, method: 'PATCH', body })).data,
  // Added for M4: PUT /recipes is the one PUT verb in the project, an
  // idempotent create-or-replace. Every other module only ever needed POST,
  // PATCH and DELETE.
  put: async (path, body, options) =>
    (await request(path, { ...options, method: 'PUT', body })).data,
  delete: async (path, options) => (await request(path, { ...options, method: 'DELETE' })).data,
};

/** For list endpoints, where meta carries page, limit and total. */
export async function requestWithMeta(path, options) {
  const envelope = await request(path, options);
  return { data: envelope.data, meta: envelope.meta };
}
