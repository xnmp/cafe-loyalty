/** Stamps never shrink below this; past it the card screen scrolls instead. */
export const MIN_STAMP_SIZE = 36;
/** Rather than squeeze the stamps below this, the café name gets smaller. */
export const COMFORTABLE_STAMP_SIZE = 48;

export interface FitInput {
  /** The largest stamp the card's width allows. */
  readonly widthLimit: number;
  /** Height the header and body can take without the screen scrolling; 0 until laid out. */
  readonly room: number;
  /** Each header's height, once it has been laid out. */
  readonly header: { readonly full?: number; readonly compact?: number };
  /** The body (card and ticket) as last laid out, and the stamp size it had then. */
  readonly body: { readonly height: number; readonly stamp: number } | null;
  readonly rows: number;
}

export interface Fit {
  readonly compactHeader: boolean;
  readonly stampSize: number;
}

/**
 * The layout that fits the card screen without scrolling, on any phone height
 * and at any font size. The body's height is linear in the stamp size (rows ×
 * size plus everything else), so one measurement at a known size gives
 * "everything else", and the fitting size follows directly. The header choice
 * depends only on that and the full header's height, never on the header that
 * happens to be showing, so the answer is stable once applied.
 */
export function fitCard({ widthLimit, room, header, body, rows }: FitInput): Fit {
  if (!body || header.full === undefined || room <= 0 || rows <= 0 || widthLimit <= 0) return { compactHeader: false, stampSize: widthLimit };
  const rest = body.height - rows * body.stamp;
  const fitting = (headerHeight: number) => Math.floor((room - headerHeight - rest) / rows);
  const clamp = (size: number) => Math.max(Math.min(widthLimit, size), Math.min(MIN_STAMP_SIZE, widthLimit));

  const withFull = fitting(header.full);
  if (withFull >= Math.min(COMFORTABLE_STAMP_SIZE, widthLimit)) return { compactHeader: false, stampSize: clamp(withFull) };
  // Until the compact header has been laid out, size as if it were the full one: a frame of small stamps, never an overflow.
  return { compactHeader: true, stampSize: clamp(fitting(header.compact ?? header.full)) };
}

/** Header heights, and the screen width and text size they were measured at. */
export interface HeaderMemo {
  readonly key: string;
  readonly heights: FitInput['header'];
}

/** What's known about the headers at this width and text size; heights from any other are forgotten. */
export function headerHeightsAt(memo: HeaderMemo, key: string): FitInput['header'] {
  return memo.key === key ? memo.heights : {};
}

/** Remembers one header's height. The same memo comes back when nothing changed, so React can skip the re-render. */
export function rememberHeaderHeight(memo: HeaderMemo, key: string, which: keyof FitInput['header'], height: number): HeaderMemo {
  const heights = headerHeightsAt(memo, key);
  return memo.key === key && heights[which] === height ? memo : { key, heights: { ...heights, [which]: height } };
}
