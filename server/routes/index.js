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
import auditRoutes from './auditRoutes.js';
import authRoutes from './authRoutes.js';
import billRoutes from './billRoutes.js';
import customerRoutes from './customerRoutes.js';
import brandRoutes from './brandRoutes.js';
import branchRoutes from './branchRoutes.js';
import healthRoutes from './healthRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import menuRoutes from './menuRoutes.js';
import onlineRoutes from './onlineRoutes.js';
import orderRoutes from './orderRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import integrationRoutes from './integrationRoutes.js';
import publicRoutes from './publicRoutes.js';
import reportRoutes from './reportRoutes.js';
import restaurantRoutes from './restaurantRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import accountRoutes from './accountRoutes.js';
import dayCloseRoutes from './dayCloseRoutes.js';
import reportV2Routes from './reportV2Routes.js';
import paymentMethodRoutes from './paymentMethodRoutes.js';
import stationRoutes from './stationRoutes.js';
import systemRoutes from './systemRoutes.js';
import userRoutes from './userRoutes.js';

const router = Router();

router.use(healthRoutes);
// P23. The public page, before anything that signs a person in.
router.use(publicRoutes);
router.use(authRoutes);
router.use(restaurantRoutes);
router.use(branchRoutes);
router.use(userRoutes);
router.use(menuRoutes);
router.use(orderRoutes);
router.use(attendanceRoutes);
router.use(billRoutes);
router.use(customerRoutes);
router.use(inventoryRoutes);
router.use(reportRoutes);
router.use(settingsRoutes);
router.use(stationRoutes);
router.use(paymentMethodRoutes);
router.use(accountRoutes);
router.use(dayCloseRoutes);
router.use(reportV2Routes);
router.use(auditRoutes);
// P30. The record of server starts, for the owner.
router.use(systemRoutes);
router.use(brandRoutes);
router.use(onlineRoutes);
router.use(paymentRoutes);
// P25 Part G. M21 Integrations: partner connections.
router.use(integrationRoutes);

export default router;
