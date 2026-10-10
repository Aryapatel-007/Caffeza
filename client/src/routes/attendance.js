/**
 * P32. The attendance group: the clock, the register and my hours.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as AttendanceRegisterPage } from '../features/attendance/AttendanceRegisterPage.jsx';
export { default as ClockScreen } from '../features/attendance/ClockScreen.jsx';
export { default as MyAttendancePage } from '../features/attendance/MyAttendancePage.jsx';
