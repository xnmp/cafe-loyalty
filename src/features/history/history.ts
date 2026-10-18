import type { CardEvent } from '../../domain/card';

export interface HistorySection {
  readonly key: string;
  readonly title: string;
  readonly data: CardEvent[];
}

/** Local calendar months, matching the dates shown on the customer's phone. */
export function groupByMonth(events: readonly CardEvent[], locale?: string): HistorySection[] {
  const months = new Map<string, HistorySection>();
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  // Sorting a copy preserves the ledger; stable sort preserves equal-time events.
  for (const event of [...events].sort((a, b) => b.at - a.at)) {
    const date = new Date(event.at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const section = months.get(key);
    if (section) section.data.push(event);
    else months.set(key, { key, title: formatter.format(date).toLocaleUpperCase(locale), data: [event] });
  }
  return [...months.values()];
}

export function describeEvent(event: CardEvent, rewardName: string): { title: string; kind: CardEvent['kind'] } {
  if (event.kind === 'stamp') return { title: `${event.count} ${event.count === 1 ? 'stamp' : 'stamps'}`, kind: 'stamp' };
  const reward = rewardName.trim();
  return { title: `${reward.charAt(0).toLocaleUpperCase()}${reward.slice(1)} redeemed`, kind: 'redeem' };
}
