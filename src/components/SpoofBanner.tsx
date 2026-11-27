import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUserLocation } from '@/lib/location';

/**
 * Shown on every screen while the dev location override is on, so a spoofed
 * position is never mistaken for real GPS. Tap to go back to GPS.
 */
export function SpoofBanner() {
  const { spoofedCoords, setSpoofedCoords } = useUserLocation();
  const insets = useSafeAreaInsets();
  if (!spoofedCoords) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Spoofed location is on. Tap to use real GPS."
      onPress={() => setSpoofedCoords(null)}
      style={[styles.banner, { top: insets.top + 8 }]}>
      <Ionicons name="flask" size={16} color="#fff" />
      <Text style={styles.text}>
        DEV: spoofed location {spoofedCoords.lat.toFixed(4)}, {spoofedCoords.lng.toFixed(4)}
      </Text>
      <Text style={styles.action}>Use GPS</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(124,58,237,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  text: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  action: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
