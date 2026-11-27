import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { CATEGORIES } from '@/lib/categories';
import { DEFAULT_CITY } from '@/lib/cities';
import type { PlaceFilter } from '@/lib/queries';
import type { CategorySlug, CitySlug } from '@/types/place';

/**
 * App-wide view settings shared by the compass and map: which city we're in and
 * which categories are shown. Phase 3 adds the UI to change them (city chosen
 * from the user's location, category chips, compass category picker).
 */
type AppState = {
  city: CitySlug;
  setCity: (c: CitySlug) => void;
  /** Categories shown on the map. */
  categories: CategorySlug[];
  setCategories: (c: CategorySlug[]) => void;
  /** Category the compass points to. */
  compassCategory: CategorySlug;
  setCompassCategory: (c: CategorySlug) => void;
  /** Ready-made filter for the map queries. */
  mapFilter: PlaceFilter;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<CitySlug>(DEFAULT_CITY);
  const [categories, setCategories] = useState<CategorySlug[]>(CATEGORIES.map((c) => c.slug));
  const [compassCategory, setCompassCategory] = useState<CategorySlug>(CATEGORIES[0].slug);

  const value = useMemo<AppState>(
    () => ({
      city,
      setCity,
      categories,
      setCategories,
      compassCategory,
      setCompassCategory,
      mapFilter: { city, categories },
    }),
    [city, categories, compassCategory],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}
