/**
 * P32. The inventory group: stock and recipes.
 * App.jsx loads this module with import() the first time one of these screens
 * opens, so the group arrives as one chunk and only to the person who needs it.
 */
export { default as RecipeEditorPage } from '../features/inventory/RecipeEditorPage.jsx';
export { default as StockListPage } from '../features/inventory/StockListPage.jsx';
