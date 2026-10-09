/**
 * Acting without a signed-in person. P25 Part G, API-CONTRACT M21 section 6.
 *
 * A webhook or a job has no user, but every service takes a request. This
 * builds one that acts as the restaurant's integration user: one per
 * restaurant, created when its first connection is saved, role CASHIER,
 * `isSystem: true`, a phone value no sign-in form can type, and a random
 * password nobody knows. authService refuses it at sign-in.
 */
import { randomBytes } from 'node:crypto';

import { ROLES } from '../../config/roles.js';
import { logger } from '../../config/logger.js';
import { Restaurant } from '../../models/Restaurant.js';
import { User } from '../../models/User.js';
import { createUserWithPassword } from '../authService.js';

const DUPLICATE_KEY = 11000;

/** The restaurant's integration user, made the first time it is needed. */
export async function ensureIntegrationUser(restaurantId, branchId, providerName) {
  const existing = await User.findOne({ restaurantId, isSystem: true });
  if (existing) return existing;
  try {
    return await createUserWithPassword(
      {
        restaurantId,
        branchId,
        name: `${providerName} (automatic)`,
        phone: `system:${restaurantId}`,
        role: ROLES.CASHIER,
        isSystem: true,
      },
      randomBytes(32).toString('hex'),
    );
  } catch (error) {
    // Two connections saved at once: the other one made it.
    if (error?.code === DUPLICATE_KEY) return User.findOne({ restaurantId, isSystem: true });
    throw error;
  }
}

/**
 * A request-like context every service accepts, acting as the integration
 * user of the connection's restaurant and branch.
 */
export async function asIntegration(restaurantId, branchId, providerName = 'Integration') {
  const user = await ensureIntegrationUser(restaurantId, branchId, providerName);
  // Tenancy root, looked up by _id from the connection's own restaurantId.
  const restaurant = await Restaurant.findById(restaurantId);
  return {
    restaurantId: String(restaurantId),
    branchId: String(branchId),
    user: { id: String(user._id), role: user.role },
    currentUser: user,
    currentRestaurant: restaurant,
    // P29. Nobody at the counter: a platform order is paid at pickup and never printed first.
    isIntegration: true,
    log: logger.child({ restaurantId: String(restaurantId), actor: 'integration' }),
  };
}

export default { asIntegration, ensureIntegrationUser };
