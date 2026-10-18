/** The furthest a JS Date reaches either side of the epoch, in ms. */
const MAX_DATE_MS = 8.64e15;

/**
 * A stored epoch-ms time that a Date can represent. Damaged data can hold
 * numbers that are finite but still throw when formatted (e.g. 1e100).
 */
export const isEpochMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_DATE_MS;
