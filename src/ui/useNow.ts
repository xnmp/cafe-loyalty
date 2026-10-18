import { useEffect, useState } from 'react';

/** Wall-clock time, re-read every `intervalMs`. Keeps `Date.now()` out of render. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
