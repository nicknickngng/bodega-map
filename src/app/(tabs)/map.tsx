import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { fetchBodegaClusters } from '@/lib/queries';
import type { BodegaCluster } from '@/types/bodega';

// Fallback view: the golden-set cluster on the Upper East Side.
const DEFAULT_REGION: Region = {
  latitude: 40.7702,
  longitude: -73.9553,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// Roughly how many grid cells span the viewport's larger dimension. Higher =
// finer clusters (more, smaller bubbles). The returned row count is bounded by
// ~CELLS_ACROSS², so it stays well under the 1000-row server cap. Kept coarse
// (was 14) so fewer custom-view markers are on screen at once — each one is a
// native iOS annotation, and the marker set is the memory bottleneck.
const CELLS_ACROSS = 9;

// Wait this long after the viewport stops moving before refetching, so a rapid
// pan/zoom coalesces into a single request instead of one per intermediate frame.
const RELOAD_DEBOUNCE_MS = 400;

function gridForRegion(r: Region): number {
  return Math.max(r.latitudeDelta, r.longitudeDelta) / CELLS_ACROSS;
}

export default function MapScreen() {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [clusters, setClusters] = useState<BodegaCluster[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Custom-view markers must "track view changes" to rasterize their content,
  // but doing so continuously is the memory sink. We turn tracking on for one
  // beat after each cluster update (so bubbles render their count) then off.
  const [tracksChanges, setTracksChanges] = useState(true);
  const mapRef = useRef<MapView>(null);
  const didCenterOnUser = useRef(false);
  // Monotonic id of the latest in-flight fetch; results from older fetches are
  // discarded so a slow response can't overwrite a newer viewport's data.
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        mapRef.current?.animateToRegion(
          {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: DEFAULT_REGION.latitudeDelta,
            longitudeDelta: DEFAULT_REGION.longitudeDelta,
          },
          400,
        );
      }
    })().catch(() => {
      /* non-fatal: fall back to the default region */
    });
  }, []);

  async function loadClusters(r: Region) {
    const reqId = ++requestIdRef.current;
    try {
      const data = await fetchBodegaClusters(
        {
          minLat: r.latitude - r.latitudeDelta / 2,
          maxLat: r.latitude + r.latitudeDelta / 2,
          minLng: r.longitude - r.longitudeDelta / 2,
          maxLng: r.longitude + r.longitudeDelta / 2,
        },
        gridForRegion(r),
      );
      if (reqId !== requestIdRef.current) return; // a newer fetch superseded this one
      setClusters(data);
      setErrorMsg(null);
    } catch (e: any) {
      if (reqId !== requestIdRef.current) return;
      setErrorMsg(e?.message ?? 'Could not load bodegas.');
    }
  }

  // Coalesce rapid region changes into a single fetch once movement settles.
  function scheduleLoad(r: Region) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadClusters(r), RELOAD_DEBOUNCE_MS);
  }

  // After each cluster update, briefly let markers re-rasterize so bubbles show
  // their (possibly changed) count, then stop tracking to cap memory churn.
  useEffect(() => {
    setTracksChanges(true);
    const t = setTimeout(() => setTracksChanges(false), 500);
    return () => clearTimeout(t);
  }, [clusters]);

  // Cancel any pending fetch when the screen unmounts.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Zoom in toward a tapped cluster; the resulting region change reloads at a
  // finer grid, so the cluster splits apart.
  function zoomToCluster(c: BodegaCluster) {
    mapRef.current?.animateToRegion(
      {
        latitude: c.cluster_lat,
        longitude: c.cluster_lng,
        latitudeDelta: region.latitudeDelta / 2.5,
        longitudeDelta: region.longitudeDelta / 2.5,
      },
      350,
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        showsUserLocation
        showsMyLocationButton
        onRegionChangeComplete={(r) => {
          setRegion(r);
          scheduleLoad(r);
        }}
        onMapReady={() => loadClusters(region)}>
        {clusters.map((c) =>
          c.point_count === 1 ? (
            <Marker
              key={`${c.gx}:${c.gy}`}
              coordinate={{ latitude: c.cluster_lat, longitude: c.cluster_lng }}
              title={c.name ?? 'Bodega'}
              description={c.address ?? undefined}
            />
          ) : (
            <Marker
              key={`${c.gx}:${c.gy}`}
              coordinate={{ latitude: c.cluster_lat, longitude: c.cluster_lng }}
              onPress={() => zoomToCluster(c)}
              tracksViewChanges={tracksChanges}>
              <ClusterBubble count={c.point_count} />
            </Marker>
          ),
        )}
      </MapView>

      {errorMsg ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{errorMsg}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ClusterBubble({ count }: { count: number }) {
  // Scale the bubble a little with magnitude so dense cells read as bigger.
  const size = count >= 100 ? 56 : count >= 10 ? 48 : 40;
  return (
    <View
      style={[
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      <Text style={styles.bubbleText}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bubble: {
    backgroundColor: 'rgba(32,138,239,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  bubbleText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
