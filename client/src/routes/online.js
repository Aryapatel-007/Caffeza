/**
 * P32. The online group: the inbox and the booking book, and P39's chats.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as BookingsPage } from '../features/online/BookingsPage.jsx';
export { default as ChatsPage } from '../features/online/ChatsPage.jsx';
export { default as OnlineInboxPage } from '../features/online/OnlineInboxPage.jsx';
