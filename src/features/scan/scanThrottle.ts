/** Retain only the short repeat window; different codes remain immediately scannable. */
export function acceptScan(recent: ReadonlyMap<string, number>, data: string, now: number): ReadonlyMap<string, number> | null {
  const previous = recent.get(data);
  if (previous !== undefined && now - previous < 2500) return null;
  return new Map([...recent.entries()].filter(([, at]) => now - at < 2500).concat([[data, now]]));
}
