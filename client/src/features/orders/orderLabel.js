/**
 * Where an order or bill is, in a few words. P06.
 *
 * "Table 5", "Takeaway", or "Swiggy 249377796192385". One function, so the
 * order screen, the bill screen and the bills list never disagree about how a
 * delivery order is named.
 */
export function placeLabel({ orderType, tableName, platform }) {
  if (orderType === 'DELIVERY') {
    return platform ? `${platform.name} ${platform.orderId}` : 'Delivery';
  }
  if (orderType === 'TAKEAWAY') return 'Takeaway';
  return tableName ?? 'Table';
}
