// Kitchen special requests: a purchaser can describe an off-menu item or a
// change to a menu item. The kitchen sets the final charge on the night, so an
// order carrying a request is always paid cash at the bar on collection and is
// never offered card or bank transfer for the listed total.

export const KITCHEN_SPECIAL_REQUEST_BAR_ONLY_MESSAGE =
  'Orders with a special request are paid cash at the bar on collection, because the kitchen confirms the final price.';

/** The trimmed special request stored in a meal order's request JSON, or ''. */
export function kitchenSpecialRequest(mealRequest: unknown): string {
  if (!mealRequest || typeof mealRequest !== 'object' || Array.isArray(mealRequest)) return '';
  const value = (mealRequest as Record<string, unknown>).special_request;
  return typeof value === 'string' ? value.trim() : '';
}

/** True when a kitchen order carries a special request and must be paid at the bar. */
export function kitchenOrderIsBarOnly(order: { order_category?: string | null; meal_request?: unknown }): boolean {
  return order.order_category === 'kitchen' && kitchenSpecialRequest(order.meal_request) !== '';
}
