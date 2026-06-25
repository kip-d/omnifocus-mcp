/**
 * Date helpers shared across integration tests.
 *
 * `daysFromToday(n)` → today ± n days as a LOCAL-time `YYYY-MM-DD` string.
 *
 * Deliberately uses local date components rather than `toISOString().split('T')[0]`:
 * `toISOString()` formats in UTC, so west of UTC near midnight it reports the
 * previous day, silently shifting a test's date window by one. Building the string
 * from `getFullYear()/getMonth()/getDate()` keeps the window aligned to the wall-clock
 * day the test author intends, independent of the runner's timezone.
 */
export function daysFromToday(delta: number): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
