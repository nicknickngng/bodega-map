import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bearingBetween, formatDistance, haversineMeters } from '@/lib/geo';
import { fetchNearestBodega } from '@/lib/queries';
import type { NearbyBodega } from '@/types/bodega';

// Don't re-query the database for every GPS tick — only after meaningful movement.
const REFETCH_DISTANCE_M = 25;

export default function CompassScreen() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [nearest, setNearest] = useState<NearbyBodega | null>(null);

  const lastFetchRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let posSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function refetchNearest(c: { lat: number; lng: number }) {
      const last = lastFetchRef.current;
      if (last && haversineMeters(last.lat, last.lng, c.lat, c.lng) < REFETCH_DISTANCE_M) {
        return;
      }
      lastFetchRef.current = c;
      try {
        const b = await fetchNearestBodega(c.lat, c.lng);
        if (!cancelled) setNearest(b);
      } catch (e: any) {
        if (!cancelled) setErrorMsg(e?.message ?? 'Could not load nearby bodegas.');
      }
    }

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Location permission is needed to point you to the nearest bodega.');
        return;
      }

      posSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
        (loc) => {
          const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setCoords(next);
          refetchNearest(next);
        },
      );

      headSub = await Location.watchHeadingAsync((h) => {
        // trueHeading is -1 when unavailable (e.g. no calibration); fall back to magnetic.
        setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
      });
    })().catch((e) => setErrorMsg(e?.message ?? String(e)));

    return () => {
      cancelled = true;
      posSub?.remove();
      headSub?.remove();
    };
  }, []);

  if (errorMsg) {
    return (
      <Centered>
        <Ionicons name="alert-circle-outline" size={48} color="#b00020" />
        <Text style={styles.message}>{errorMsg}</Text>
      </Centered>
    );
  }

  if (!coords) {
    return (
      <Centered>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.message}>Finding your location…</Text>
      </Centered>
    );
  }

  if (!nearest) {
    return (
      <Centered>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.message}>Looking for the nearest bodega…</Text>
      </Centered>
    );
  }

  const bearing = bearingBetween(coords.lat, coords.lng, nearest.lat, nearest.lng);
  // Rotate the arrow by the bearing relative to where the phone is pointing.
  const arrowRotation = bearing - (heading ?? 0);

  return (
    <SafeAreaView style={styles.container}>
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
        <Text style={styles.name}>{nearest.name}</Text>
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

function Centered({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={[styles.container, styles.centered]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
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
