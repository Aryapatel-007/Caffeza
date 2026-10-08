/**
 * The adapter for a platform that has not approved this integration. P25
 * Part H. Swiggy and Zomato publish no API for restaurants; their document
 * comes with their approval, and only from that document is a real adapter
 * written. Until then every call says so plainly and nothing is guessed.
 */
import { PartnerSpecMissingError } from '../../../utils/errors.js';

export function waitingAdapter(partnerName) {
  const refuse = () => {
    throw new PartnerSpecMissingError(partnerName);
  };
  return {
    capabilities: { acceptReject: false, foodReady: false, itemAvailability: false, storeStatus: false, menuPush: false },
    verifyWebhook: () => false,
    parseWebhook: refuse,
    acceptOrder: refuse,
    rejectOrder: refuse,
    markFoodReady: refuse,
    setItemAvailability: refuse,
    setStoreStatus: refuse,
    testConnection: refuse,
  };
}

export default { waitingAdapter };
