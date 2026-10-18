import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProviders, useStores } from '../state/AppProviders';
import { useStore } from '../state/store';
import { useTheme } from '../ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Navigator() {
  const { card, staff } = useStores();
  const theme = useTheme();
  const cardState = useStore(card);
  const staffState = useStore(staff);
  const ready = cardState.status === 'ready' && staffState.status !== 'loading';
  if (ready) void SplashScreen.hideAsync().catch(() => undefined);

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.background },
          animation: 'default',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="history" />
        <Stack.Screen name="about" />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="t/[token]" options={{ animation: 'none' }} />
        <Stack.Screen name="staff/setup" options={{ presentation: 'modal' }} />
        <Stack.Screen name="counter/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="counter/settings" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <Navigator />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
