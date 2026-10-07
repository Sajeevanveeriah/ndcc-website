// Kitchen menus are often named with a packed date (e.g. "Meals 08102026" for
// 8 October 2026). Show that date in words on public pages; any other name is
// shown as entered.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function publicKitchenMenuName(name: string): string {
  const trimmed = (name || '').trim();
  const match = trimmed.match(/^(.*?)[\s_-]*(\d{2})(\d{2})(\d{4})$/);
  if (!match) return trimmed;
  const [, prefix, dd, mm, yyyy] = match;
  const day = Number(dd); const month = Number(mm); const year = Number(yyyy);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return trimmed;
  const label = `${DAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
  return prefix.trim() ? `${prefix.trim()} for ${label}` : label;
}
