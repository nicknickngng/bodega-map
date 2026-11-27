import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppState } from '@/lib/app-state';
import { categoryConfig, placeLabel } from '@/lib/categories';
import { cityConfig } from '@/lib/cities';
import { DEV_TOOLS_ENABLED } from '@/lib/dev-tools';
import { useUserLocation } from '@/lib/location';
import { useNearestPlace } from '@/lib/nearest';
import { fetchPlaceClusters } from '@/lib/queries';
import type { PlaceCluster } from '@/types/place';

// Roughly how many grid cells span the viewport's larger dimension. Higher =
// finer clusters (more, smaller bubbles). The returned row count is bounded by
// ~CELLS_ACROSS² per category, so it stays well under the 1000-row server cap.
// Kept coarse (was 14) so fewer custom-view markers are on screen at once —
// each one is a native iOS annotation, and the marker set is the memory
// bottleneck. Phase 3 adds a marker budget across categories.
const CELLS_ACROSS = 9;

// Wait this long after the viewport stops moving before refetching, so a rapid
// pan/zoom coalesces into a single request instead of one per intermediate frame.
const RELOAD_DEBOUNCE_MS = 400;

function gridForRegion(r: Region): number {
  return Math.max(r.latitudeDelta, r.longitudeDelta) / CELLS_ACROSS;
}

export default function MapScreen() {
  const { city, mapFilter, compassCategory } = useAppState();
  const { coords, gpsCoords, spoofedCoords, setSpoofedCoords } = useUserLocation();
  // Same target as the compass; the map draws a dotted guide line to it.
  const { nearest } = useNearestPlace();
  const insets = useSafeAreaInsets();

  const cityDefaults = cityConfig(city);
  const initialRegion: Region = {
    ...cityDefaults.center,
    latitudeDelta: cityDefaults.delta,
    longitudeDelta: cityDefaults.delta,
  };

  const [region, setRegion] = useState<Region>(initialRegion);
  const [clusters, setClusters] = useState<PlaceCluster[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Dev tool: while true, the next tap on the map sets the spoofed location.
  const [pickingLocation, setPickingLocation] = useState(false);
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

  function centerOn(lat: number, lng: number) {
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: cityDefaults.delta,
        longitudeDelta: cityDefaults.delta,
      },
      400,
    );
  }

  // Center on the user once, when their location first arrives.
  useEffect(() => {
    if (coords && !didCenterOnUser.current) {
      didCenterOnUser.current = true;
      centerOn(coords.lat, coords.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  // Jump to a newly spoofed location, and back to GPS when spoofing ends.
  const hadSpoof = useRef(false);
  useEffect(() => {
    if (spoofedCoords) {
      hadSpoof.current = true;
      centerOn(spoofedCoords.lat, spoofedCoords.lng);
    } else if (hadSpoof.current && gpsCoords) {
      hadSpoof.current = false;
      centerOn(gpsCoords.lat, gpsCoords.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoofedCoords]);

  async function loadClusters(r: Region) {
    const reqId = ++requestIdRef.current;
    try {
      const data = await fetchPlaceClusters(
        {
          minLat: r.latitude - r.latitudeDelta / 2,
          maxLat: r.latitude + r.latitudeDelta / 2,
          minLng: r.longitude - r.longitudeDelta / 2,
          maxLng: r.longitude + r.longitudeDelta / 2,
        },
        gridForRegion(r),
        mapFilter,
      );
      if (reqId !== requestIdRef.current) return; // a newer fetch superseded this one
      setClusters(data);
      setErrorMsg(null);
    } catch (e: any) {
      if (reqId !== requestIdRef.current) return;
      setErrorMsg(e?.message ?? 'Could not load places.');
    }
  }

  // Coalesce rapid region changes into a single fetch once movement settles.
  function scheduleLoad(r: Region) {
    // Invalidate any in-flight response right away, so an answer for the old
    // viewport or filter can't land during the debounce window.
    requestIdRef.current++;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadClusters(r), RELOAD_DEBOUNCE_MS);
  }

  // Refetch when the city or category filter changes (Phase 3 adds the UI).
  // Skips the first run: onMapReady does the initial load.
  const filterKey = `${mapFilter.city}|${mapFilter.categories.join(',')}`;
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    setClusters([]); // old filter's clusters are wrong now
    scheduleLoad(region);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

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
  function zoomToCluster(c: PlaceCluster) {
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
        initialRegion={initialRegion}
        // While spoofing, hide the real blue dot; the spoofed pin replaces it.
        showsUserLocation={!spoofedCoords}
        showsMyLocationButton
        // Hide Apple Maps' own business/POI labels so the map reads as just our
        // places. All-or-nothing on Apple Maps (also drops parks/transit labels);
        // see docs/decisions.md (2026-06-15, basemap styling).
        showsPointsOfInterests={false}
        onPress={(e) => {
          if (!pickingLocation) return;
          const { latitude, longitude } = e.nativeEvent.coordinate;
          setSpoofedCoords({ lat: latitude, lng: longitude });
          setPickingLocation(false);
        }}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          scheduleLoad(r);
        }}
        onMapReady={() => loadClusters(region)}>
        {clusters.map((c) => {
          const cat = categoryConfig(c.category);
          const key = `${c.category}:${c.gx}:${c.gy}`;
          return c.point_count === 1 ? (
            <Marker
              key={key}
              coordinate={{ latitude: c.cluster_lat, longitude: c.cluster_lng }}
              // Default pin for now (no visible change in Phase 2); Phase 3
              // colors pins by category once there's more than one.
              title={placeLabel(c)}
              description={c.name ? (c.address ?? undefined) : undefined}
            />
          ) : (
            <Marker
              key={key}
              coordinate={{ latitude: c.cluster_lat, longitude: c.cluster_lng }}
              onPress={() => zoomToCluster(c)}
              tracksViewChanges={tracksChanges}>
              <ClusterBubble count={c.point_count} color={cat.color} />
            </Marker>
          );
        })}
        {coords && nearest ? (
          // Dotted guide line from the user (or spoofed location) to the place
          // the compass points to. A straight line, not a walking route.
          <Polyline
            key="nearest-guide"
            coordinates={[
              { latitude: coords.lat, longitude: coords.lng },
              { latitude: nearest.lat, longitude: nearest.lng },
            ]}
            strokeColor={categoryConfig(compassCategory).color}
            strokeWidth={3}
            lineDashPattern={[6, 8]}
            lineCap="round"
          />
        ) : null}
        {spoofedCoords ? (
          <Marker
            key="spoofed-location"
            coordinate={{ latitude: spoofedCoords.lat, longitude: spoofedCoords.lng }}
            pinColor="#7C3AED"
            title="Spoofed location (dev)"
          />
        ) : null}
      </MapView>

      {errorMsg ? (
        <View style={[styles.banner, { top: insets.top + 56 }]}>
          <Text style={styles.bannerText}>{errorMsg}</Text>
        </View>
      ) : null}

      {DEV_TOOLS_ENABLED ? (
        <View style={[styles.devTools, { bottom: 24 }]}>
          {pickingLocation ? (
            <Text style={styles.devHint}>Tap the map to set your location</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              pickingLocation ? 'Cancel picking a location' : 'Dev tool: set a spoofed location'
            }
            onPress={() => setPickingLocation((p) => !p)}
            style={[styles.devButton, pickingLocation && styles.devButtonActive]}>
            <Ionicons name={pickingLocation ? 'close' : 'locate'} size={18} color="#fff" />
            <Text style={styles.devButtonText}>
              {pickingLocation ? 'Cancel' : 'DEV: set location'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ClusterBubble({ count, color }: { count: number; color: string }) {
  // Scale the bubble a little with magnitude so dense cells read as bigger.
  const size = count >= 100 ? 56 : count >= 10 ? 48 : 40;
  return (
    <View
      style={[
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
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
    opacity: 0.92,
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
  devTools: {
    position: 'absolute',
    left: 16,
    alignItems: 'flex-start',
    gap: 8,
  },
  devHint: {
    backgroundColor: 'rgba(17,17,17,0.85)',
    color: '#fff',
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  devButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(124,58,237,0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  devButtonActive: {
    backgroundColor: 'rgba(17,17,17,0.9)',
  },
  devButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
