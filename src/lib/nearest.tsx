import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAppState } from '@/lib/app-state';
import { haversineMeters } from '@/lib/geo';
import { useUserLocation, type Coords } from '@/lib/location';
import { fetchNearestPlace } from '@/lib/queries';
import type { NearbyPlace } from '@/types/place';

// Don't re-query for every GPS tick, only after meaningful movement.
const REFETCH_DISTANCE_M = 25;
// A jump this far (e.g. setting a spoofed location) drops the old result
// immediately instead of showing it until the new one arrives.
const RESET_DISTANCE_M = 1000;
// After a failed query, try again on this delay even if the user hasn't moved.
const RETRY_MS = 5000;

type NearestState = {
  /** undefined = loading; null = nothing of this category in this city. */
  nearest: NearbyPlace | null | undefined;
  error: string | null;
};

const NearestContext = createContext<NearestState | null>(null);

/**
 * The place the compass points to (nearest place of the compass category in
 * the current city), shared so the compass and the map's guide line always
 * agree and only one query runs.
 */
export function NearestProvider({ children }: { children: ReactNode }) {
  const { city, compassCategory } = useAppState();
  const { coords } = useUserLocation();
  const [nearest, setNearest] = useState<NearbyPlace | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // Where and for what the current result was requested.
  const lastFetchRef = useRef<{ at: Coords; key: string } | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!coords) return;
    const key = `${city}|${compassCategory}`;
    const last = lastFetchRef.current;
    const moved = last ? haversineMeters(last.at.lat, last.at.lng, coords.lat, coords.lng) : Infinity;
    if (last && last.key === key && moved < REFETCH_DISTANCE_M) return;

    // A new filter or a big jump makes the old answer wrong: show loading.
    if (!last || last.key !== key || moved >= RESET_DISTANCE_M) {
      setNearest(undefined);
      setError(null); // an old error would otherwise hide the loading state
    }

    lastFetchRef.current = { at: coords, key };
    const reqId = ++requestIdRef.current;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    fetchNearestPlace(coords.lat, coords.lng, { city, categories: [compassCategory] })
      .then((p) => {
        if (reqId !== requestIdRef.current) return; // superseded by a newer query
        setNearest(p);
        setError(null);
      })
      .catch((e: any) => {
        if (reqId !== requestIdRef.current) return;
        setError(e?.message ?? 'Could not load nearby places.');
        // Forget this attempt so the retry (or any movement) queries again.
        lastFetchRef.current = null;
        retryTimer = setTimeout(() => setRetryTick((t) => t + 1), RETRY_MS);
      });

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [coords, city, compassCategory, retryTick]);

  const value = useMemo(() => ({ nearest, error }), [nearest, error]);
  return <NearestContext.Provider value={value}>{children}</NearestContext.Provider>;
}

export function useNearestPlace(): NearestState {
  const ctx = useContext(NearestContext);
  if (!ctx) throw new Error('useNearestPlace must be used inside <NearestProvider>');
  return ctx;
}
