import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryChips } from '@/components/CategoryChips';
import { useAppState } from '@/lib/app-state';
import { categoryConfig, placeLabel } from '@/lib/categories';
import { bearingBetween, formatDistance } from '@/lib/geo';
import { useUserLocation } from '@/lib/location';
import { useNearestPlace } from '@/lib/nearest';

export default function CompassScreen() {
  const { compassCategory, setCompassCategory, cityCategories } = useAppState();
  const { coords, spoofedCoords, permission, error: locationError } = useUserLocation();
  // Shared with the map's guide line (src/lib/nearest.tsx).
  const { nearest, error: errorMsg } = useNearestPlace();
  const [heading, setHeading] = useState<number | null>(null);
  const label = categoryConfig(compassCategory).label;

  // Which category to point to (single-select). Hidden when the city has one.
  // Sits below the dev spoof banner when that's showing.
  const picker =
    cityCategories.length > 1 ? (
      <CategoryChips
        options={cityCategories}
        selected={[compassCategory]}
        onPress={setCompassCategory}
        style={{ marginTop: spoofedCoords ? 56 : 8, flexGrow: 0 }}
      />
    ) : null;

  // Device heading (magnetometer).
  useEffect(() => {
    if (permission !== 'granted') return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchHeadingAsync((h) => {
      // trueHeading is -1 when unavailable (e.g. no calibration); fall back to magnetic.
      setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {
        /* no magnetometer (e.g. simulator): the hint below explains */
      });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [permission]);

  const shownError =
    errorMsg ??
    locationError ??
    (permission === 'denied' ? `Location permission is needed to point you to the nearest ${label}.` : null);

  if (shownError) {
    return (
      <Centered header={picker}>
        <Ionicons name="alert-circle-outline" size={48} color="#b00020" />
        <Text style={styles.message}>{shownError}</Text>
      </Centered>
    );
  }

  if (!coords) {
    return (
      <Centered header={picker}>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.message}>Finding your location…</Text>
      </Centered>
    );
  }

  if (nearest === null) {
    return (
      <Centered header={picker}>
        <Ionicons name="search-outline" size={48} color="#98a2b3" />
        <Text style={styles.message}>No {label} found in this city yet.</Text>
      </Centered>
    );
  }

  if (!nearest) {
    return (
      <Centered header={picker}>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.message}>Looking for the nearest {label}…</Text>
      </Centered>
    );
  }

  const bearing = bearingBetween(coords.lat, coords.lng, nearest.lat, nearest.lng);
  // Rotate the arrow by the bearing relative to where the phone is pointing.
  const arrowRotation = bearing - (heading ?? 0);

  return (
    <SafeAreaView style={styles.container}>
      {picker}
      <View style={styles.compassWrap}>
        <View style={styles.dial}>
          <Ionicons
            name="navigate"
            size={140}
            color="#208AEF"
            style={{ transform: [{ rotate: `${arrowRotation}deg` }] }}
          />
        </View>
      </View>

      <View style={styles.info}>
        <Text style={styles.distance}>{formatDistance(nearest.distance_m)}</Text>
        <Text style={styles.name}>{placeLabel(nearest)}</Text>
        {nearest.neighborhood ? (
          <Text style={styles.neighborhood}>{nearest.neighborhood}</Text>
        ) : null}
        {heading === null ? (
          <Text style={styles.hint}>
            Compass heading unavailable — open on a physical device.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Centered({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.container}>
      {header}
      <View style={styles.centered}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  compassWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dial: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: '#e3e8ef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    alignItems: 'center',
    paddingBottom: 48,
    gap: 4,
  },
  distance: {
    fontSize: 44,
    fontWeight: '700',
    color: '#111',
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  neighborhood: {
    fontSize: 16,
    color: '#667085',
  },
  message: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: '#98a2b3',
    textAlign: 'center',
  },
});
