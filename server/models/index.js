/**
 * Every model, in one list.
 *
 * `services/indexService.js` reads this to build and check indexes, and the
 * production boot check in `server.js` refuses to start while any index a model
 * here declares is missing from the database. A model left off this list has
 * its indexes silently ignored by both, which is exactly the failure P01 exists
 * to prevent.
 *
 * Every new model file must be added here. `tests/indexes.test.js` reads the
 * models folder and fails if one is missing, so forgetting is a red suite, not
 * a production surprise.
 *
 * Alphabetical by model name.
 */
import { AttendanceEntry } from './AttendanceEntry.js';
import { AuditLog } from './AuditLog.js';
import { Bill } from './Bill.js';
import { Branch } from './Branch.js';
import { Category } from './Category.js';
import { Counter } from './Counter.js';
import { Ingredient } from './Ingredient.js';
import { Kot } from './Kot.js';
import { MenuItem } from './MenuItem.js';
import { Order } from './Order.js';
import { PaymentMethod } from './PaymentMethod.js';
import { Recipe } from './Recipe.js';
import { RefreshToken } from './RefreshToken.js';
import { Restaurant } from './Restaurant.js';
import { Station } from './Station.js';
import { StockMovement } from './StockMovement.js';
import { Table } from './Table.js';
import { User } from './User.js';

export const ALL_MODELS = Object.freeze([
  AttendanceEntry,
  AuditLog,
  Bill,
  Branch,
  Category,
  Counter,
  Ingredient,
  Kot,
  MenuItem,
  Order,
  PaymentMethod,
  Recipe,
  RefreshToken,
  Restaurant,
  Station,
  StockMovement,
  Table,
  User,
]);
