/** Blank contact fields have no destination and should not render a row. */
export function addressLink(address: string, platform: string): string | null {
  const value = address.trim();
  if (!value) return null;
  const query = encodeURIComponent(value);
  if (platform === 'ios') return `maps:0,0?q=${query}`;
  if (platform === 'android') return `geo:0,0?q=${query}`;
  return `https://maps.google.com/?q=${query}`;
}

export function phoneLink(phone: string): string | null {
  const value = phone.trim().replace(/\s+/g, '');
  return value ? `tel:${value}` : null;
}

export function websiteLink(website: string): string | null {
  const value = website.trim();
  if (!value) return null;
  if (value.startsWith('//')) return `https:${value}`;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function instagramLink(handle: string): string | null {
  const value = handle.trim().replace(/^@+/, '').trim();
  return value ? `https://instagram.com/${encodeURIComponent(value)}` : null;
}

/** English ordinals for the positive whole drink counts in café rules. */
export function ordinal(value: number): string {
  const lastTwo = value % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th';
  return `${value}${suffix}`;
}
