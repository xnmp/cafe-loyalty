import { Redirect } from 'expo-router';

import { CounterScreen } from '../../features/counter/CounterScreen';
import { useStores } from '../../state/AppProviders';
import { useStore } from '../../state/store';

export default function Counter() {
  const { staff } = useStores();
  const state = useStore(staff);
  if (state.status === 'loading') return null;
  if (state.status !== 'counter') return <Redirect href="/" />;
  return <CounterScreen credentials={state.credentials} />;
}
