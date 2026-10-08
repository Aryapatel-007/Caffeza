/**
 * Pine Labs in-store cloud integration. P25 Part I, API-CONTRACT M21 section 8.
 * Filled in by Part I. Until then a connection can be saved but not tested.
 */
export function verifyWebhook() {
  // The postback is a hint only and is always confirmed with GetStatus (Part I).
  return true;
}

export function testConnection() {
  return Promise.resolve({ ok: false, message: 'Testing a Pine Labs connection is not built yet.' });
}

export default { testConnection, verifyWebhook };
