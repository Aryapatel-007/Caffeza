import { Navigate, Route, Routes } from 'react-router-dom';

import NotFoundPage from './components/NotFoundPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RequireFeature from './components/RequireFeature.jsx';
import RequireRole from './components/RequireRole.jsx';
import AttendanceRegisterPage from './features/attendance/AttendanceRegisterPage.jsx';
import ClockScreen from './features/attendance/ClockScreen.jsx';
import MyAttendancePage from './features/attendance/MyAttendancePage.jsx';
import LoginPage from './features/auth/LoginPage.jsx';
import BillScreenPage from './features/billing/BillScreenPage.jsx';
import BillsListPage from './features/billing/BillsListPage.jsx';
import RecipeEditorPage from './features/inventory/RecipeEditorPage.jsx';
import StockListPage from './features/inventory/StockListPage.jsx';
import DiscountsReportPage from './features/reports/DiscountsPage.jsx';
import LabourReportPage from './features/reports/LabourPage.jsx';
import PaymentsReportPage from './features/reports/PaymentsPage.jsx';
import SalesReportPage from './features/reports/SalesPage.jsx';
import StockReportPage from './features/reports/StockPage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';
import DeviceSettingsPage from './features/printing/DeviceSettingsPage.jsx';
import StationsPage from './features/stations/StationsPage.jsx';
import TaxReportPage from './features/reports/TaxPage.jsx';
import TodayReportPage from './features/reports/TodayPage.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import KitchenDisplayPage from './features/kitchen/KitchenDisplayPage.jsx';
import AvailabilityBoardPage from './features/menu/AvailabilityBoardPage.jsx';
import MenuBuilderPage from './features/menu/MenuBuilderPage.jsx';
import FloorViewPage from './features/orders/FloorViewPage.jsx';
import OrderScreenPage from './features/orders/OrderScreenPage.jsx';
import TableManagementPage from './features/orders/TableManagementPage.jsx';
import TakeawayOrderPage from './features/orders/TakeawayOrderPage.jsx';
import StaffFormPage from './features/users/StaffFormPage.jsx';
import StaffListPage from './features/users/StaffListPage.jsx';
import { ROLES } from './features/users/roles.js';

/** Staff management is for the people who run the place. */
const STAFF_ADMIN_ROLES = [ROLES.OWNER, ROLES.MANAGER];

/**
 * So is editing the menu. The availability board is deliberately not gated:
 * all six roles may mark a dish out of stock, which is the one M1 write open
 * to the floor and the kitchen.
 */
const MENU_ADMIN_ROLES = [ROLES.OWNER, ROLES.MANAGER];

/**
 * Setting up the floor is back-office work, so it is gated like the menu.
 *
 * Taking orders is not: OWNER, MANAGER, CASHIER and WAITER all do it, and the
 * kitchen and storekeeper are kept out. The kitchen display itself is open to
 * everyone, because whoever is at the pass marks food ready.
 *
 * All of this is a convenience. The server refuses each endpoint to the wrong
 * role whether or not the screen is reachable.
 */
const TABLE_ADMIN_ROLES = [ROLES.OWNER, ROLES.MANAGER];
const ORDER_TAKING_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.WAITER];

/**
 * M3. Creating a bill and taking payment is the till: OWNER, MANAGER, CASHIER.
 * Reading one bill and its receipt is open to all six on the server (a waiter
 * carries the bill to the table), so /bills/:billId is gated no narrower than
 * ProtectedRoute itself. Only the list, which is the till's own working
 * screen, is gated here.
 */
const BILLING_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER];

/**
 * M4. Reading the stock list is open to all six on the server (a cook who
 * sees paneer is out marks the dish unavailable in M1), so /inventory itself
 * is gated no narrower than ProtectedRoute. The recipe editor is a writing
 * tool, gated the same way MenuBuilderPage is: OWNER and MANAGER, even though
 * a STOREKEEPER may read the underlying endpoint.
 */
const RECIPE_EDITOR_ROLES = [ROLES.OWNER, ROLES.MANAGER];

/**
 * M6. Reports are back-office reads for the two roles who run the place.
 * Two exceptions match the server exactly: the stock report also allows a
 * STOREKEEPER, whose job that read is, and the payment-method breakdown is
 * OWNER only, because the cash figure is the one a dishonest manager most
 * wants to control.
 */
const REPORT_ROLES = [ROLES.OWNER, ROLES.MANAGER];
const STOCK_REPORT_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER];
const PAYMENT_REPORT_ROLES = [ROLES.OWNER];

/**
 * M7. Settings are OWNER only here, even though a MANAGER may READ them on the
 * server. There is one settings screen and it is a form, so showing a manager a
 * page whose every control 403s on save would be worse than not showing it.
 * A manager who needs to know what the restaurant is set to can be told; the
 * read endpoint is open to them for exactly that.
 */
const SETTINGS_ROLES = [ROLES.OWNER];

/**
 * Routes.
 *
 * One entry per screen. As modules land they add their own routes here and
 * their screens live under /features.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/staff"
        element={
          <ProtectedRoute>
            <RequireRole roles={STAFF_ADMIN_ROLES}>
              <StaffListPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/staff/new"
        element={
          <ProtectedRoute>
            <RequireRole roles={STAFF_ADMIN_ROLES}>
              <StaffFormPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/staff/:userId/edit"
        element={
          <ProtectedRoute>
            <RequireRole roles={STAFF_ADMIN_ROLES}>
              <StaffFormPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/menu"
        element={
          <ProtectedRoute>
            <RequireRole roles={MENU_ADMIN_ROLES}>
              <MenuBuilderPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/menu/availability"
        element={
          <ProtectedRoute>
            <AvailabilityBoardPage />
          </ProtectedRoute>
        }
      />

      {/* M5. The clock is open to every role: a shared tablet on the wall. */}
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <RequireFeature feature="attendance">
              <ClockScreen />
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance/me"
        element={
          <ProtectedRoute>
            <RequireFeature feature="attendance">
              <MyAttendancePage />
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance/register"
        element={
          <ProtectedRoute>
            <RequireFeature feature="attendance">
              <RequireRole roles={STAFF_ADMIN_ROLES}>
                <AttendanceRegisterPage />
              </RequireRole>
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      <Route
        path="/floor"
        element={
          <ProtectedRoute>
            <RequireRole roles={ORDER_TAKING_ROLES}>
              <FloorViewPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders/takeaway"
        element={
          <ProtectedRoute>
            <RequireRole roles={ORDER_TAKING_ROLES}>
              <TakeawayOrderPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders/:orderId"
        element={
          <ProtectedRoute>
            <RequireRole roles={ORDER_TAKING_ROLES}>
              <OrderScreenPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tables"
        element={
          <ProtectedRoute>
            <RequireRole roles={TABLE_ADMIN_ROLES}>
              <TableManagementPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      {/* Open to all six. Whoever is standing at the pass marks food ready. */}
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute>
            <KitchenDisplayPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/bills"
        element={
          <ProtectedRoute>
            <RequireRole roles={BILLING_ROLES}>
              <BillsListPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      {/* Reading one bill is open to all six on the server: a waiter carries
          it to the table. The screen itself hides discount/void/payment for
          the wrong role; the server refuses each regardless. */}
      <Route
        path="/bills/:billId"
        element={
          <ProtectedRoute>
            <BillScreenPage />
          </ProtectedRoute>
        }
      />

      {/* Open to all six on the server: a cook who sees paneer is out marks
          the dish unavailable in M1. */}
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <RequireFeature feature="inventory">
              <StockListPage />
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      <Route
        path="/inventory/recipes"
        element={
          <ProtectedRoute>
            <RequireFeature feature="inventory">
              <RequireRole roles={RECIPE_EDITOR_ROLES}>
                <RecipeEditorPage />
              </RequireRole>
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      {/* M6. Read-only, back office, desktop. */}
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <RequireRole roles={REPORT_ROLES}>
              <TodayReportPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/sales"
        element={
          <ProtectedRoute>
            <RequireRole roles={REPORT_ROLES}>
              <SalesReportPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/tax"
        element={
          <ProtectedRoute>
            <RequireRole roles={REPORT_ROLES}>
              <TaxReportPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/discounts"
        element={
          <ProtectedRoute>
            <RequireRole roles={REPORT_ROLES}>
              <DiscountsReportPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/stock"
        element={
          <ProtectedRoute>
            <RequireFeature feature="inventory">
              <RequireRole roles={STOCK_REPORT_ROLES}>
                <StockReportPage />
              </RequireRole>
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/labour"
        element={
          <ProtectedRoute>
            <RequireFeature feature="attendance">
              <RequireRole roles={REPORT_ROLES}>
                <LabourReportPage />
              </RequireRole>
            </RequireFeature>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/payments"
        element={
          <ProtectedRoute>
            <RequireRole roles={PAYMENT_REPORT_ROLES}>
              <PaymentsReportPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <RequireRole roles={SETTINGS_ROLES}>
              <SettingsPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      {/* P05. Printer settings for this device. Every role. */}
      <Route
        path="/device"
        element={
          <ProtectedRoute>
            <DeviceSettingsPage />
          </ProtectedRoute>
        }
      />

      {/* P05. Kitchen stations. The server enforces OWNER and MANAGER. */}
      <Route
        path="/stations"
        element={
          <ProtectedRoute>
            <RequireRole roles={STAFF_ADMIN_ROLES}>
              <StationsPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
