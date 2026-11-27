import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { CategorySlug } from '@/types/place';

/**
 * Every category the app knows about. Registering a new category = add an entry
 * here (and import its data with `category = <slug>`). Order = display order.
 */
export type CategoryConfig = {
  slug: CategorySlug;
  /** Singular, lowercase, for sentences: "the nearest bodega". */
  label: string;
  /** Short title for chips and pickers. */
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Bubble / pin color. */
  color: string;
};

export const CATEGORIES: CategoryConfig[] = [
  { slug: 'bodega', label: 'bodega', title: 'Bodegas', icon: 'storefront', color: '#208AEF' },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

/** Config for a slug. Unknown slugs (data ahead of the app) get a neutral fallback. */
export function categoryConfig(slug: CategorySlug): CategoryConfig {
  return (
    BY_SLUG.get(slug) ?? {
      slug,
      label: slug.replace(/_/g, ' '),
      title: slug.replace(/_/g, ' '),
      icon: 'location',
      color: '#667085',
    }
  );
}

/** Display label for a place: its name, else its address, else the category. */
export function placeLabel(p: {
  name: string | null;
  address: string | null;
  category: CategorySlug;
}): string {
  if (p.name) return p.name;
  if (p.address) return p.address;
  const label = categoryConfig(p.category).label;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
