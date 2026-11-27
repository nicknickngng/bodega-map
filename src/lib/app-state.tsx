import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { cityConfig, cityForCoords, DEFAULT_CITY } from '@/lib/cities';
import { useUserLocation } from '@/lib/location';
import type { PlaceFilter } from '@/lib/queries';
import type { CategorySlug, CitySlug } from '@/types/place';

/**
 * App-wide view settings shared by the compass and map: which city we're in
 * (picked from the user's or spoofed location), which categories the map shows,
 * and which category the compass points to.
 */
type AppState = {
  city: CitySlug;
  /** Categories available in the current city, in display order. */
  cityCategories: CategorySlug[];
  /** Categories shown on the map (a subset of cityCategories, never empty). */
  categories: CategorySlug[];
  toggleCategory: (c: CategorySlug) => void;
  /** Category the compass points to. */
  compassCategory: CategorySlug;
  setCompassCategory: (c: CategorySlug) => void;
  /** Ready-made filter for the map queries. */
  mapFilter: PlaceFilter;
};

const AppStateContext = createContext<AppState | null>(null);

/** Must be inside <LocationProvider>: the city follows the user's location. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const { coords } = useUserLocation();
  const [city, setCity] = useState<CitySlug>(DEFAULT_CITY);
  const cityCategories = cityConfig(city).categories;
  const [categories, setCategories] = useState<CategorySlug[]>(cityCategories);
  const [compassCategory, setCompassCategory] = useState<CategorySlug>(cityCategories[0]);

  // Switch city when the user (or the spoofed location) enters another city's
  // box. Outside every city, keep the last one.
  useEffect(() => {
    if (!coords) return;
    const next = cityForCoords(coords.lat, coords.lng);
    if (next && next !== city) {
      const nextCategories = cityConfig(next).categories;
      setCity(next);
      setCategories(nextCategories);
      setCompassCategory((cur) => (nextCategories.includes(cur) ? cur : nextCategories[0]));
    }
  }, [coords, city]);

  const value = useMemo<AppState>(
    () => ({
      city,
      cityCategories,
      categories,
      toggleCategory: (c) =>
        setCategories((cur) => {
          if (cur.includes(c)) return cur.length > 1 ? cur.filter((x) => x !== c) : cur; // keep one on
          return cityCategories.filter((x) => x === c || cur.includes(x)); // keep display order
        }),
      compassCategory,
      setCompassCategory,
      mapFilter: { city, categories },
    }),
    [city, cityCategories, categories, compassCategory],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}
