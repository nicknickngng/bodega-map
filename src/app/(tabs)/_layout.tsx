import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { CityTabBar } from '@/components/CityTabBar';

const ACTIVE_TINT = '#208AEF';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The tab bar types `color` as any React Native ColorValue (which can be a
 * number or a platform color object), but Ionicons only accepts strings. Pass
 * strings through and fall back to our tint for anything else, instead of
 * casting and hiding a mismatch.
 */
function tabIcon(name: IoniconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons
      name={name}
      size={size}
      color={typeof color === 'string' ? color : ACTIVE_TINT}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      // Compass | City: <name> | Map
      tabBar={(props) => <CityTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_TINT,
      }}>
      {/* Compass is the default landing tab (see docs/decisions.md). */}
      <Tabs.Screen
        name="index"
        options={{ title: 'Compass', tabBarIcon: tabIcon('compass') }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: 'Map', tabBarIcon: tabIcon('map') }}
      />
    </Tabs>
  );
}
