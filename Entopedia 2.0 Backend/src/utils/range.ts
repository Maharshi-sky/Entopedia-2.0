// Turns a UI range such as "7d", "30d", "12w", "6m", "1y" or "ytd" into a
// Postgres interval string ("30 days"). Used with `$1::interval`, because
// Postgres does not accept a bind parameter after the INTERVAL keyword
// (`NOW() - INTERVAL $1` is a syntax error).
const UNITS: Record<string, string> = { d: 'days', w: 'weeks', m: 'months', y: 'years' };

export function toInterval(range: unknown, fallback = '30 days'): string {
  if (typeof range !== 'string') return fallback;
  const value = range.trim().toLowerCase();
  if (value === 'ytd') {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 864e5));
    return `${days} days`;
  }
  const match = value.match(/^(\d{1,4})\s*([dwmy])$/);
  if (!match) return fallback;
  return `${Number(match[1])} ${UNITS[match[2]]}`;
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
