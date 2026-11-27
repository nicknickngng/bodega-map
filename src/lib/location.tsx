import * as Location from 'expo-location';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { DEV_TOOLS_ENABLED } from '@/lib/dev-tools';

export type Coords = { lat: number; lng: number };

type LocationState = {
  /** The location the app should use: the spoofed one if set, else GPS. */
  coords: Coords | null;
  /** Real GPS position, regardless of spoofing. */
  gpsCoords: Coords | null;
  /** Dev tool: a manually chosen location that overrides GPS. Null = use GPS. */
  spoofedCoords: Coords | null;
  setSpoofedCoords: (c: Coords | null) => void;
  /** 'undetermined' until the permission prompt is answered. */
  permission: 'undetermined' | 'granted' | 'denied';
  error: string | null;
};

const LocationContext = createContext<LocationState | null>(null);

/**
 * One shared GPS subscription for the whole app (compass and map both read it),
 * plus the dev-only location override used for testing other cities.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [gpsCoords, setGpsCoords] = useState<Coords | null>(null);
  const [spoofedCoords, setSpoofed] = useState<Coords | null>(null);
  const [permission, setPermission] = useState<LocationState['permission']>('undetermined');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
        (loc) => setGpsCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
      );
      // The effect may have been cleaned up while we awaited the subscription.
      if (cancelled) sub.remove();
    })().catch((e) => {
      if (!cancelled) setError(e?.message ?? String(e));
    });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const value = useMemo<LocationState>(
    () => ({
      coords: (DEV_TOOLS_ENABLED ? spoofedCoords : null) ?? gpsCoords,
      gpsCoords,
      spoofedCoords: DEV_TOOLS_ENABLED ? spoofedCoords : null,
      setSpoofedCoords: (c) => {
        if (DEV_TOOLS_ENABLED) setSpoofed(c);
      },
      permission,
      error,
    }),
    [gpsCoords, spoofedCoords, permission, error],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useUserLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useUserLocation must be used inside <LocationProvider>');
  return ctx;
}
