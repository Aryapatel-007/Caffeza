/**
 * P32. The settlement group: the cash book, Day Close, On Hold, payouts, the bills list and the receipt preview.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as BillsListPage } from '../features/billing/BillsListPage.jsx';
export { default as ReceiptPreviewPage } from '../features/billing/ReceiptPreviewPage.jsx';
export { default as AccountsPage } from '../features/settlement/AccountsPage.jsx';
export { default as CashBookPage } from '../features/settlement/CashBookPage.jsx';
export { default as DayClosePage } from '../features/settlement/DayClosePage.jsx';
export { default as PayoutsPage } from '../features/settlement/PayoutsPage.jsx';
