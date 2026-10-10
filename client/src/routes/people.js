/**
 * P32. The staff and customers group.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as CustomersPage } from '../features/customers/CustomersPage.jsx';
export { default as StaffFormPage } from '../features/users/StaffFormPage.jsx';
export { default as StaffListPage } from '../features/users/StaffListPage.jsx';
