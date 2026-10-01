/**
 * The API router. Everything under /api/v1 is mounted here.
 *
 * A route file wires a URL to a controller and does nothing else. No business
 * logic ever lives in this folder.
 *
 * All eight modules, M0 to M7, are mounted. Route files are named for their
 * base path rather than for the module number: inventoryRoutes.js is M4,
 * reportRoutes.js is M6, matching billRoutes.js and orderRoutes.js.
 */
import { Router } from 'express';

import attendanceRoutes from './attendanceRoutes.js';
import authRoutes from './authRoutes.js';
import billRoutes from './billRoutes.js';
import branchRoutes from './branchRoutes.js';
import healthRoutes from './healthRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import menuRoutes from './menuRoutes.js';
import orderRoutes from './orderRoutes.js';
import reportRoutes from './reportRoutes.js';
import restaurantRoutes from './restaurantRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import stationRoutes from './stationRoutes.js';
import userRoutes from './userRoutes.js';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(restaurantRoutes);
router.use(branchRoutes);
router.use(userRoutes);
router.use(menuRoutes);
router.use(orderRoutes);
router.use(attendanceRoutes);
router.use(billRoutes);
router.use(inventoryRoutes);
router.use(reportRoutes);
router.use(settingsRoutes);
router.use(stationRoutes);

export default router;
