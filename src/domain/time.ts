/** The latest moment a JS Date can represent, in ms since the epoch. */
const MAX_DATE_MS = 8.64e15;

/**
 * A stored epoch-ms time that a Date can represent. Damaged data can hold
 * numbers that are finite but still throw when formatted (e.g. 1e100).
 */
export const isEpochMs = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_DATE_MS;
