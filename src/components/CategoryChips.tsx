import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { categoryConfig } from '@/lib/categories';
import type { CategorySlug } from '@/types/place';

/**
 * A row of category chips. Used for the map's multi-select filter and the
 * compass's single-select target.
 */
export function CategoryChips({
  options,
  selected,
  onPress,
  style,
}: {
  options: CategorySlug[];
  selected: CategorySlug[];
  onPress: (c: CategorySlug) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={styles.row}>
      {options.map((slug) => {
        const cat = categoryConfig(slug);
        const on = selected.includes(slug);
        return (
          <Pressable
            key={slug}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={cat.title}
            onPress={() => onPress(slug)}
            style={[
              styles.chip,
              on ? { backgroundColor: cat.color, borderColor: cat.color } : styles.chipOff,
            ]}>
            <Ionicons name={cat.icon} size={16} color={on ? '#fff' : cat.color} />
            <Text style={[styles.text, { color: on ? '#fff' : '#111' }]}>{cat.title}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  chipOff: {
    backgroundColor: '#fff',
    borderColor: '#e3e8ef',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
