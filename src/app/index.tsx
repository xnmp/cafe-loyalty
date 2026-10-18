import { Redirect } from 'expo-router';

import { CardScreen } from '../features/card/CardScreen';
import { useStores } from '../state/AppProviders';
import { useStore } from '../state/store';

export default function Index() {
  const { staff } = useStores();
  const state = useStore(staff);
  if (state.status === 'loading') return null;
  if (state.status === 'counter') return <Redirect href="/counter" />;
  return <CardScreen />;
}
