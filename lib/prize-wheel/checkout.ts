import { isWheelCampaignCode, isWheelPubliclyCurrent, validWheelSelection, wheelSalesState } from './rules';

type CheckoutFailure = { error: string; status: number };

type WheelCheckoutCampaign = {
  code?: unknown; kind?: unknown; wheel_divisions?: unknown; sales_open_at?: unknown; draw_at?: unknown;
};

/**
 * Extra server-side checks for prize wheel card checkout. The database
 * enforces the same sales window and number rules on insert.
 */
export function wheelCheckoutFailure(
  campaign: WheelCheckoutCampaign,
  body: Record<string, unknown>,
  quantity: number,
  method: unknown,
  now: Date = new Date(),
): CheckoutFailure | null {
  if (campaign.kind !== 'wheel' || !isWheelCampaignCode(campaign.code) || typeof campaign.draw_at !== 'string'
    || typeof campaign.sales_open_at !== 'string' || !isWheelPubliclyCurrent({ draw_at: campaign.draw_at }, now)) {
    return { error: 'The prize wheel is not currently available.', status: 503 };
  }
  if (method !== 'stripe') {
    return { error: 'Prize wheel tickets are sold by card online, or by cash at the clubrooms.', status: 400 };
  }
  if (body.adult_confirmed !== true) {
    return { error: 'Please confirm that you are 18 or older.', status: 400 };
  }
  const state = wheelSalesState({ sales_open_at: campaign.sales_open_at, draw_at: campaign.draw_at }, now);
  if (state === 'upcoming') return { error: 'Online prize wheel sales have not opened yet.', status: 409 };
  if (state !== 'open') return { error: 'Online prize wheel sales are closed. Tickets may still be available by cash at the clubrooms before the draw.', status: 409 };
  if (!validWheelSelection(body.selectedNumbers, quantity, Number(campaign.wheel_divisions))) {
    return { error: 'Choose one different wheel number for each ticket.', status: 400 };
  }
  return null;
}
