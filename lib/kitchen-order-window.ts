import { mealServiceDate } from './meal-collection';
export type KitchenOrderingSettings = { enabled: boolean; open_day: number; open_time: string; close_day: number; close_time: string };
export const DEFAULT_KITCHEN_SETTINGS: KitchenOrderingSettings = { enabled: false, open_day: 1, open_time: '00:00', close_day: 4, close_time: '10:00' };
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function validKitchenSettings(value: unknown): value is KitchenOrderingSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as KitchenOrderingSettings;
  const validTime = (t: unknown) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  return typeof s.enabled === 'boolean' && Number.isInteger(s.open_day) && Number.isInteger(s.close_day)
    && s.open_day >= 1 && s.close_day <= 4 && s.open_day <= s.close_day
    && validTime(s.open_time) && validTime(s.close_time)
    && s.open_day * 1440 + minute(s.open_time) < s.close_day * 1440 + minute(s.close_time);
}
export type KitchenOrderWindow = { open: boolean; message: string; nextChange: string; serviceDate: string };
export function getKitchenOrderWindow(now = new Date(), settings: KitchenOrderingSettings = DEFAULT_KITCHEN_SETTINGS): KitchenOrderWindow {
  const s = validKitchenSettings(settings) ? settings : DEFAULT_KITCHEN_SETTINGS;
  const serviceDate = mealServiceDate(now);
  if (!s.enabled) return { open: false, serviceDate, message: 'Online meal ordering is currently closed.', nextChange: 'Awaiting manual enable' };
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  const day = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[value('weekday')] || 7;
  const current = day * 1440 + Number(value('hour')) * 60 + Number(value('minute'));
  const open = current >= s.open_day * 1440 + minute(s.open_time) && current < s.close_day * 1440 + minute(s.close_time);
  const label = (day: number, time: string) => `${days[day]} ${Number(time.slice(0,2)) % 12 || 12}:${time.slice(3)} ${Number(time.slice(0,2)) >= 12 ? 'pm' : 'am'}`;
  const opening = label(s.open_day, s.open_time), closing = label(s.close_day, s.close_time);
  return { open, serviceDate, message: open ? `Online meal ordering is open until ${closing}.` : `Online meal ordering is available from ${opening} until ${closing}.`, nextChange: open ? closing : opening };
}
