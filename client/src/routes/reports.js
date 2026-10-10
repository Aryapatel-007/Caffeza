/**
 * P32. The reports group: every report, the activity log, labour and stock.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as ActivityLogPage } from '../features/reports/ActivityLogPage.jsx';
export { default as LabourReportPage } from '../features/reports/LabourPage.jsx';
export { default as ReportPage } from '../features/reports/ReportPage.jsx';
export { default as ReportsIndexPage } from '../features/reports/ReportsIndexPage.jsx';
export { default as StockReportPage } from '../features/reports/StockPage.jsx';
export { default as BillDetailPage } from '../features/reports/v2/BillDetailPage.jsx';
export { default as BillListPage } from '../features/reports/v2/BillListPage.jsx';
