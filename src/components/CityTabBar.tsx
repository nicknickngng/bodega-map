import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/lib/app-state';
import { cityConfig } from '@/lib/cities';

const ACTIVE = '#208AEF';
const INACTIVE = '#8E8E93';

/**
 * Bottom tab bar: [Compass] [City: <current city>] [Map]. The city label sits
 * between the two tab buttons and follows the user's (or spoofed) location.
 */
export function CityTabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  const { city } = useAppState();
  const [left, ...rest] = state.routes;

  const renderTab = (route: (typeof state.routes)[number]) => {
    const index = state.routes.indexOf(route);
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const color = focused ? ACTIVE : INACTIVE;
    const title = typeof options.title === 'string' ? options.title : route.name;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={title}
        onPress={() => {
          if (!focused) navigateToTab(route.key);
        }}
        style={styles.tab}>
        {options.tabBarIcon?.({ focused, color, size: 24 })}
        <Text style={[styles.tabLabel, { color }]}>{title}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {left ? renderTab(left) : null}
      <View style={styles.cityWrap} accessibilityRole="text">
        <Text style={styles.cityLabel} numberOfLines={1}>
          City: <Text style={styles.cityName}>{cityConfig(city).name}</Text>
        </Text>
      </View>
      {rest.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d5dd',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  cityWrap: {
    flex: 1.4,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cityLabel: {
    fontSize: 13,
    color: '#667085',
  },
  cityName: {
    color: '#111',
    fontWeight: '700',
  },
});
