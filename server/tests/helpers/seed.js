/**
 * Test fixtures.
 *
 * Creates a restaurant, its branch, and its users directly through the models,
 * so a test can start from a known state without going through provisioning.
 */
import { ROLES } from '../../config/roles.js';
import { Branch } from '../../models/Branch.js';
import { Restaurant } from '../../models/Restaurant.js';
import { User } from '../../models/User.js';
import { hash } from '../../services/passwordService.js';

export const DEFAULT_PASSWORD = 'correct horse battery';

let phoneCounter = 0;

/** A unique, valid Indian mobile number per call. */
export function nextPhone() {
  phoneCounter += 1;
  return `9${String(800000000 + phoneCounter).padStart(9, '0')}`;
}

export async function seedRestaurant({
  name = 'Shreeji Dining Hall',
  branchName = 'Main',
  isActive = true,
} = {}) {
  const restaurant = await Restaurant.create({ name, isActive });
  const branch = await Branch.create({ restaurantId: restaurant._id, name: branchName });
  return { restaurant, branch };
}

export async function seedUser({
  restaurant,
  branch,
  name = 'Rishi Patel',
  phone = nextPhone(),
  email,
  role = ROLES.OWNER,
  password = DEFAULT_PASSWORD,
  isActive = true,
} = {}) {
  const user = await User.create({
    restaurantId: restaurant._id,
    branchId: branch._id,
    name,
    phone,
    ...(email ? { email } : {}),
    role,
    isActive,
    passwordHash: await hash(password),
  });

  return { user, phone, email: user.email ?? null, password };
}

/**
 * A restaurant with a branch and an owner, which is what most tests need.
 *
 * The restaurant options and the owner options are kept apart on purpose. An
 * earlier version spread one object into both, so seedFullRestaurant({ name })
 * quietly named the owner after the restaurant.
 */
export async function seedFullRestaurant({
  name,
  branchName,
  isActive,
  ownerName,
  ownerPhone,
  ownerEmail,
  ownerRole,
  ownerIsActive,
  password,
} = {}) {
  const { restaurant, branch } = await seedRestaurant({ name, branchName, isActive });

  const seededOwner = await seedUser({
    restaurant,
    branch,
    name: ownerName,
    phone: ownerPhone,
    email: ownerEmail,
    role: ownerRole,
    isActive: ownerIsActive,
    password,
  });

  return { restaurant, branch, ...seededOwner };
}
