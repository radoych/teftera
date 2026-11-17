// features/vendors/components/VendorAutocomplete.tsx — merchant input + in-flow suggestions.
import { useMemo, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { listExiting, rowEntering, rowLayout } from '@/lib/animation';
import { colors } from '@/lib/theme';
import { merchantKey } from '../key';
import { suggestVendors } from '../resolve';
import { useVendorIndex } from '../store';
import type { Vendor, VendorSuggestion } from '../types';

export interface VendorAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Fires after the text is replaced by `vendor.name`. */
  onSelect?: (vendor: Vendor) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Settings screens: don't suggest the vendor being edited. */
  excludeVendorId?: string;
  /** `field` = manual-entry body-lg; `headline` = confirm-receipt headline-lg-mobile. */
  variant?: 'field' | 'headline';
  error?: string;
  /**
   * Loyalty-card count per vendor for the row's card indicator. Phase 2 (loyalty
   * cards) wires this from its store; until then no indicator renders.
   */
  cardCount?: (vendorId: string) => number;
}

const INPUT_CLASS = {
  field: 'font-inter text-body-lg text-on-surface',
  headline: 'font-jakarta-semibold text-headline-lg-mobile text-on-surface',
} as const;

const PLACEHOLDER_COLOR = {
  field: colors.placeholder,
  headline: 'rgba(142,144,154,0.5)',
} as const;

/** Split `name` around the first case-insensitive occurrence of `query`. */
function highlight(name: string, query: string): [string, string, string] {
  const q = merchantKey(query);
  const at = q ? name.toLowerCase().indexOf(q) : -1;
  if (at < 0) return [name, '', ''];
  return [name.slice(0, at), name.slice(at, at + q.length), name.slice(at + q.length)];
}

function SuggestionRow({
  suggestion,
  query,
  last,
  cards,
  onPress,
}: {
  suggestion: VendorSuggestion;
  query: string;
  last: boolean;
  cards: number;
  onPress: () => void;
}) {
  const [before, match, after] = highlight(suggestion.vendor.name, query);
  return (
    <Animated.View
      entering={rowEntering}
      layout={rowLayout}
      style={last ? undefined : styles.divider}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center px-2 py-1 active:bg-white/5">
        <View className="flex-1">
          <Text className="font-inter text-body-lg text-on-surface" numberOfLines={1}>
            {before}
            <Text className="text-primary-container">{match}</Text>
            {after}
          </Text>
          {suggestion.matchedAlias ? (
            <Text
              className="font-inter text-label-md text-on-surface-variant opacity-60"
              numberOfLines={1}>
              {`чрез „${suggestion.matchedAlias.alias}"`}
            </Text>
          ) : null}
        </View>
        {/* Loyalty-card indicator. `cards` stays 0 until phase 2 passes `cardCount`. */}
        {cards > 0 ? (
          <MaterialIcons name="card-membership" size={16} color={colors.onSurfaceVariant} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Merchant text input with autocomplete from the household's vendors and their
 * recognized names. Suggestions are synchronous (in-memory index) and render in
 * flow below the input, so they push content down instead of fighting the
 * scroll view's z-order. The parent scroll view must use
 * `keyboardShouldPersistTaps="handled"` or a row tap only dismisses the keyboard.
 */
export function VendorAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder,
  autoFocus,
  excludeVendorId,
  variant = 'field',
  error,
  cardCount,
}: VendorAutocompleteProps) {
  const index = useVendorIndex();
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(
    () => suggestVendors(value, index, 6, excludeVendorId),
    [value, index, excludeVendorId],
  );
  const open = focused && suggestions.length > 0;

  const pick = (vendor: Vendor) => {
    onChangeText(vendor.name);
    onSelect?.(vendor);
  };

  return (
    <Animated.View layout={rowLayout}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR[variant]}
        autoFocus={autoFocus}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={INPUT_CLASS[variant]}
      />
      {error ? <Text className="mt-1 font-inter text-body-md text-error">{error}</Text> : null}
      {open ? (
        <Animated.View
          entering={FadeInDown.duration(120)}
          exiting={listExiting}
          className="mt-xs">
          {suggestions.map((s, i) => (
            <SuggestionRow
              key={s.vendor.id}
              suggestion={s}
              query={value}
              last={i === suggestions.length - 1}
              cards={cardCount?.(s.vendor.id) ?? 0}
              onPress={() => pick(s.vendor)}
            />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    // Same hairline as components/HairlineDivider (CLAUDE.md visual patterns).
    borderColor: colors.hairline,
  },
});
