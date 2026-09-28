// OMN-332: date-only filter bounds are whole LOCAL days, inclusive. These build the
// expected ISO instants with the local-time Date constructor, so expectations hold in
// any TZ. Shared by the compiler test files so the day-edge rule lives in one place.

const ymd = (s: string) => s.split('-').map(Number) as [number, number, number];

export function localStartOfDay(s: string): string {
  const [y, m, d] = ymd(s);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function localEndOfDay(s: string): string {
  const [y, m, d] = ymd(s);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}
