const CLUB_TIME_ZONE = 'Australia/Melbourne';

export type KitchenOrderWindow = { open: boolean; message: string; nextChange: string };

export function getKitchenOrderWindow(now = new Date()): KitchenOrderWindow {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: CLUB_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  const day = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[value('weekday')] || 7;
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  const open = day >= 1 && day <= 3 && !(day === 3 && minutes >= 19 * 60);
  return {
    open,
    message: open ? 'Online meal ordering is open until Wednesday at 7:00 pm.' : 'Online meal ordering is available from Monday until Wednesday at 7:00 pm.',
    nextChange: open ? 'Wednesday 7:00 pm' : 'Monday 12:00 am',
  };
}
