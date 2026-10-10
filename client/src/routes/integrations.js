/**
 * P32. The integrations group: partners, item mapping and Tally.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as IntegrationsPage } from '../features/integrations/IntegrationsPage.jsx';
export { default as ItemMappingPage } from '../features/integrations/ItemMappingPage.jsx';
export { default as TallyPage } from '../features/integrations/TallyPage.jsx';
