/**
 * What an order channel adapter is. P25 Part H, API-CONTRACT M21 section 7.1.
 *
 * Every adapter exports an object with these members. The registry in
 * ../providers.js is the only thing that picks one.
 *
 * @typedef {object} OrderChannelAdapter
 * @property {{ acceptReject: boolean, foodReady: boolean, itemAvailability: boolean, storeStatus: boolean, menuPush: boolean }} capabilities
 * @property {(args: { rawBody: Buffer, headers: object, connection: object, secrets: object }) => boolean} verifyWebhook
 *   True only when the request really came from the platform. Runs before anything else.
 * @property {(args: { rawBody: Buffer, headers: object, connection: object }) => Array<{ type: string, platformOrderId: string, order?: object }>} parseWebhook
 *   Normalised events (P25 Part H2). Customer phone numbers are dropped here.
 * @property {(connection: object, secrets: object, platformOrderId: string, options: { prepMinutes: number }) => Promise<object>} acceptOrder
 * @property {(connection: object, secrets: object, platformOrderId: string, reasonCode: string) => Promise<object>} rejectOrder
 *   Our reason code, mapped to the platform's.
 * @property {(connection: object, secrets: object, platformOrderId: string) => Promise<object>} markFoodReady
 * @property {(connection: object, secrets: object, items: Array<{ externalItemId: string, externalVariantId: string|null, available: boolean }>) => Promise<object>} setItemAvailability
 * @property {(connection: object, secrets: object, status: { open: boolean }) => Promise<object>} setStoreStatus
 * @property {(connection: object, secrets: object, menu: object) => Promise<object>} [pushMenu]
 * @property {(connection: object, secrets: object) => Promise<{ ok: boolean, message?: string }>} testConnection
 */
export const ADAPTER_MEMBERS = Object.freeze([
  'capabilities',
  'verifyWebhook',
  'parseWebhook',
  'acceptOrder',
  'rejectOrder',
  'markFoodReady',
  'setItemAvailability',
  'setStoreStatus',
  'testConnection',
]);

export default { ADAPTER_MEMBERS };
