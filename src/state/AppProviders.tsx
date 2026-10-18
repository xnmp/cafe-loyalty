import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import * as hce from '../../modules/hce';
import { cafe, trustedKeys } from '../config';
import { randomBytes } from '../infra/random';
import { appStore, secureStore } from '../infra/storage';
import { ThemeContext, themeFor } from '../ui/theme';
import { createCardStore, type CardStore } from './cardStore';
import { createCounterStore, type CounterStore } from './counterStore';
import { createStaffStore, type StaffStore } from './staffStore';

export interface Stores {
  readonly card: CardStore;
  readonly staff: StaffStore;
  readonly counter: CounterStore;
}

/** Real dependencies. Created once per app process. */
function createStores(): Stores {
  const now = () => Date.now();
  const card = createCardStore({ storage: appStore, now, cafe, keys: trustedKeys });
  const staff = createStaffStore({
    storage: secureStore,
    cafe,
    keys: trustedKeys,
    randomBytes,
    setTagServiceEnabled: (enabled) => {
      if (hce.isSupported()) hce.setServiceEnabled(enabled);
    },
  });
  const counter = createCounterStore({
    storage: appStore,
    cafe,
    now,
    randomBytes,
    tag: {
      available: () => hce.isSupported() && hce.isEnabled(),
      serve: (id, ndef) => hce.setOffer(id, ndef),
      stop: () => hce.clearOffer(),
    },
  });
  hce.addReadListener((e) => counter.onTagRead(e.offerId));
  hce.addWriteListener((e) => counter.onTagWrite(e.offerId, e.message));
  void card.load();
  void staff.load();
  void counter.load();
  return { card, staff, counter };
}

let singleton: Stores | null = null;
const StoresContext = createContext<Stores | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  singleton ??= createStores();
  const scheme = useColorScheme();
  const theme = useMemo(() => themeFor(scheme === 'dark'), [scheme]);
  return (
    <StoresContext.Provider value={singleton}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </StoresContext.Provider>
  );
}

export function useStores(): Stores {
  const stores = useContext(StoresContext);
  if (!stores) throw new Error('useStores must be used inside <AppProviders>');
  return stores;
}
