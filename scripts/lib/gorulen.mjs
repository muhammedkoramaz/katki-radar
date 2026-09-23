const DAY = 864e5;

export function pruneSeen(seen, now, days = 180) {
  const cutoff = now.getTime() - days * DAY;
  return Object.fromEntries(Object.entries(seen).filter(([, date]) => new Date(date).getTime() >= cutoff));
}

export function markSeen(seen, keys, date) {
  const out = { ...seen };
  for (const key of keys) out[key] ??= date;
  return out;
}
