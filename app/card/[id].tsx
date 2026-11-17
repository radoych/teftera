import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Barcode } from '@/components/Barcode';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { NotFoundView } from '@/components/NotFoundView';
import { CardChip } from '@/features/loyalty/components/CardChip';
import { CardFormSheet } from '@/features/loyalty/components/CardFormSheet';
import { displayCode } from '@/features/loyalty/format';
import { NO_VENDOR_TITLE } from '@/features/loyalty/group';
import { useLoyaltyStore } from '@/features/loyalty/store';
import { useCardsForVendor } from '@/features/loyalty/sync';
import { useBrightnessBoost } from '@/features/loyalty/useBrightnessBoost';
import { useVendorNameLookup } from '@/features/loyalty/vendorNames';
import { colors } from '@/lib/theme';

/** How long "Копирано" stays up (ms). */
const COPIED_MS = 1400;

/**
 * Full-screen card presenter: max brightness, the barcode on its white surface,
 * the human-readable code (tap to copy), and a switcher across the vendor's
 * other cards.
 */
export default function CardPresenterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [currentId, setCurrentId] = useState(id);
  const card = useLoyaltyStore((s) => s.cards.find((c) => c.id === currentId));
  const loaded = useLoyaltyStore((s) => s.loaded);
  const vendorName = useVendorNameLookup();
  const siblings = useCardsForVendor(card?.vendor_id ?? null);
  const { width } = useWindowDimensions();
  const [editOpen, setEditOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useBrightnessBoost();

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  if (!card) {
    // Before the first load the card simply is not there yet — not "not found".
    if (!loaded) return <View className="flex-1 bg-background" />;
    return <NotFoundView message="Картата не е намерена." />;
  }

  const title = card.vendor_id ? (vendorName(card.vendor_id) ?? NO_VENDOR_TITLE) : NO_VENDOR_TITLE;
  // Orphans are not "the same vendor" — only real vendors get a switcher.
  const showSwitcher = card.vendor_id !== null && siblings.length > 1;

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(card.code);
    } catch {
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="flex-row justify-end px-md py-sm">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Затвори"
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-container">
            <MaterialIcons name="close" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 160 }}>
          <Animated.View entering={FadeIn.duration(180)}>
            <Text
              className="font-jakarta-semibold text-headline-lg-mobile text-on-surface"
              numberOfLines={2}>
              {title}
            </Text>
            <Text className="mt-xs font-inter text-body-md text-on-surface-variant">
              {card.nickname}
            </Text>
          </Animated.View>

          {/* Keyed by card so a switch fades the new code in. */}
          <Animated.View
            key={card.id}
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(120)}
            className="mt-lg">
            <Barcode value={card.code} format={card.code_format} height={120} width={width - 48} />
            <Pressable
              onPress={() => void onCopy()}
              accessibilityRole="button"
              accessibilityLabel="Копирай кода"
              className="mt-md flex-row items-center justify-center gap-sm active:opacity-70">
              <Text className="font-inter-semibold text-headline-md text-on-surface" selectable>
                {displayCode(card.code, card.code_format)}
              </Text>
              <MaterialIcons name="content-copy" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </Animated.View>

          <View className="h-6 items-center justify-center">
            {copied ? (
              <Animated.Text
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(160)}
                className="font-inter-medium text-label-md uppercase text-on-surface-variant">
                Копирано
              </Animated.Text>
            ) : null}
          </View>

          {card.note ? (
            <Text className="mt-sm text-center font-inter text-body-md text-on-surface-variant">
              {card.note}
            </Text>
          ) : null}

          {showSwitcher ? (
            <View className="mt-lg flex-row flex-wrap justify-center gap-sm">
              {siblings.map((s) => (
                <CardChip
                  key={s.id}
                  nickname={s.nickname}
                  active={s.id === card.id}
                  onPress={() => {
                    if (s.id === card.id) return;
                    setCurrentId(s.id);
                  }}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <FloatingActionBar
        actions={[{ label: 'Редактирай', icon: 'edit', onPress: () => setEditOpen(true) }]}
      />

      <CardFormSheet
        visible={editOpen}
        card={card}
        onClose={() => setEditOpen(false)}
        onDeleted={() => router.back()}
      />
    </View>
  );
}

// Route-level crash fallback — keeps the rest of the nav tree alive.
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';
