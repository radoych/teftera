// features/shopping/components/QuickAddBar.tsx — keyboard-sticky "add an item" bar (spec §8.6).
import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { parseQuickAdd } from '../quickAdd';
import type { QuickAddDraft } from '../types';

export interface QuickAddBarProps {
  /** A non-blank parsed line. The bar clears itself and keeps focus. */
  onSubmit: (draft: QuickAddDraft) => void;
  /** Reports the bar's height so the list can pad its bottom. */
  onHeight?: (height: number) => void;
}

const OFFSET = { closed: 0, opened: 0 } as const;

/**
 * Pinned to the bottom and lifted with the keyboard. Submitting keeps the
 * keyboard up (`submitBehavior="submit"`) so several items go in in a row.
 * `KeyboardStickyView` ignores `className` (third-party) — style only.
 */
export function QuickAddBar({ onSubmit, onHeight }: QuickAddBarProps) {
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const blank = text.trim() === '';

  const submit = () => {
    const draft = parseQuickAdd(text);
    if (!draft) return;
    onSubmit(draft);
    setText('');
    input.current?.focus();
  };

  return (
    <KeyboardStickyView offset={OFFSET} style={styles.sticky}>
      <View
        style={styles.bar}
        onLayout={(e: LayoutChangeEvent) => onHeight?.(e.nativeEvent.layout.height)}>
        <SafeAreaView edges={['bottom']}>
          <View className="flex-row items-center gap-sm px-md py-sm">
            <MaterialIcons name="add" size={22} color={colors.onSurfaceVariant} />
            <TextInput
              ref={input}
              value={text}
              onChangeText={setText}
              placeholder="Добави продукт…"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              submitBehavior="submit"
              onSubmitEditing={submit}
              autoCorrect={false}
              className="min-h-11 flex-1 font-inter text-body-lg text-on-surface"
            />
            <Pressable
              onPress={submit}
              disabled={blank}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Добави"
              accessibilityState={{ disabled: blank }}
              className={`h-9 w-9 items-center justify-center bg-primary-container active:opacity-80 ${
                blank ? 'opacity-40' : ''
              }`}
              style={{ borderRadius: 9999 }}>
              <MaterialIcons name="arrow-upward" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    backgroundColor: colors.surfaceContainer,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
});
