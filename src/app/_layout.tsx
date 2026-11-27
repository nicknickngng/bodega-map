import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SpoofBanner } from '@/components/SpoofBanner';
import { AppStateProvider } from '@/lib/app-state';
import { LocationProvider } from '@/lib/location';
import { NearestProvider } from '@/lib/nearest';

export default function RootLayout() {
  return (
    <AppStateProvider>
      <LocationProvider>
        <NearestProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
          {/* Above every screen while the dev location override is on. */}
          <SpoofBanner />
          <StatusBar style="auto" />
        </NearestProvider>
      </LocationProvider>
    </AppStateProvider>
  );
}
