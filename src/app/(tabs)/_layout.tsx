import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#208AEF',
      }}>
      {/* Compass is the default landing tab (see docs/decisions.md). */}
      {/* Icon colors: the tab bar types `color` as any RN ColorValue, but it is the
          string tint set above; Ionicons only accepts strings. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Compass',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
