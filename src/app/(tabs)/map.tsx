import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { fetchBodegasInBbox } from '@/lib/queries';
import type { Bodega } from '@/types/bodega';

// Fallback view: the golden-set cluster on the Upper East Side.
const DEFAULT_REGION: Region = {
  latitude: 40.7702,
  longitude: -73.9553,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function MapScreen() {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const didCenterOnUser = useRef(false);

  // Center on the user once, on first load.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return; // map still works centered on the default region
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!didCenterOnUser.current) {
        didCenterOnUser.current = true;
        setRegion((r) => ({
          ...r,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }));
      }
    })().catch(() => {
      /* non-fatal: fall back to the default region */
    });
  }, []);

  async function loadBodegasForRegion(r: Region) {
    try {
      const data = await fetchBodegasInBbox({
        minLat: r.latitude - r.latitudeDelta / 2,
        maxLat: r.latitude + r.latitudeDelta / 2,
        minLng: r.longitude - r.longitudeDelta / 2,
        maxLng: r.longitude + r.longitudeDelta / 2,
      });
      setBodegas(data);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not load bodegas.');
    }
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        region={region}
        showsUserLocation
        showsMyLocationButton
        onRegionChangeComplete={(r) => {
          setRegion(r);
          loadBodegasForRegion(r);
        }}
        onMapReady={() => loadBodegasForRegion(region)}>
        {bodegas.map((b) => (
          <Marker
            key={b.id}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            title={b.name}
            description={b.address ?? undefined}
          />
        ))}
      </MapView>

      {errorMsg ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{errorMsg}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(176,0,32,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  bannerText: {
    color: '#fff',
    textAlign: 'center',
  },
});
