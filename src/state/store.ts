import { useSyncExternalStore } from 'react';

/** Minimal observable state container. State is replaced, never mutated. */
export interface Store<S> {
  getSnapshot(): S;
  subscribe(listener: () => void): () => void;
}

export interface WritableStore<S> extends Store<S> {
  set(next: S): void;
}

export function createStore<S>(initial: S): WritableStore<S> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, state)) return;
      state = next;
      listeners.forEach((l) => l());
    },
  };
}

export function useStore<S>(store: Store<S>): S {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
