import { mealServiceDate } from './meal-collection';
const CLUB_TIME_ZONE = 'Australia/Melbourne';

export type KitchenOrderWindow = { open: boolean; message: string; nextChange: string; serviceDate: string };

export function getKitchenOrderWindow(now = new Date()): KitchenOrderWindow {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: CLUB_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  const day = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[value('weekday')] || 7;
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  const open = day >= 1 && day <= 4 && !(day === 4 && minutes >= 10 * 60);
  return {
    open,
    serviceDate: mealServiceDate(now),
    message: open ? 'Online meal ordering is open until Thursday at 10:00 am.' : 'Online meal ordering is available from Monday until Thursday at 10:00 am.',
    nextChange: open ? 'Thursday 10:00 am' : 'Monday 12:00 am',
  };
}
