/**
 * One UI-style collapsing large title for long-list screens.
 *
 * Screens open EXPANDED: a big centred title (+ optional subtitle) fills the
 * top ~42% of the window so the first rows sit in thumb reach. Scrolling up
 * moves it away and fades a compact bar title in (back arrow + `right` slot
 * stay visible in both states; the hairline appears once content is under the
 * bar). A fling back up from inside the list stops at COLLAPSED — only a new
 * downward drag that starts at the collapsed-top position re-opens the large
 * title. Releasing half-way snaps to the nearer state (instant under reduced
 * motion). The decision math lives in `./collapse.ts` (pure + tested).
 *
 * Adopting it — the screen keeps its own list; spread `scrollProps` onto an
 * Animated scrollable and render `largeTitle` as the first piece of content:
 *
 * ```tsx
 * <CollapsingHeaderScreen title="Търговци" subtitle="12 търговеца" back
 *   right={<IconButton … />} floatingAboveTabBar={<FloatingActionBar … />}>
 *   {({ scrollProps, largeTitle, refreshOffset }) => (
 *     <Animated.FlatList            // or AnimatedSectionList / Animated.ScrollView
 *       {...scrollProps}
 *       data={rows}
 *       renderItem={…}
 *       ListHeaderComponent={<>{largeTitle}{searchInput}</>}
 *       // ScrollView body: <Animated.ScrollView {...scrollProps}>{largeTitle}…
 *       // pull-to-refresh (optional): <RefreshControl progressViewOffset={refreshOffset} …/>
 *     />
 *   )}
 * </CollapsingHeaderScreen>
 * ```
 *
 * `scrollProps` carries the ref, the UI-thread scroll handler and a
 * `contentContainerStyle` (bottom clearance for the floating pills + a min
 * height so short lists can still collapse) — don't override those; to add
 * content styles, merge: `contentContainerStyle={[scrollProps.contentContainerStyle, extra]}`.
 * The body sits inside `Screen`'s 16px gutter, so rows need no horizontal padding.
 *
 * Pull-to-refresh: works only from the fully EXPANDED position (it is the
 * native top-of-list pull). From COLLAPSED, the first pull opens the title, a
 * second pull refreshes.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, useScreenBottomPad } from '@/components/Screen';
import { colors } from '@/lib/theme';
import {
  BAR_HEIGHT,
  canExpandFromDragStart,
  clampOffset,
  collapseDistance,
  contentMinHeight,
  expandedHeight,
  headerVisuals,
  releaseVelocity,
  sampleVelocity,
  snapTarget,
} from './collapse';

/** SectionList with Reanimated props (the scroll handler). Typed for generic use. */
export const AnimatedSectionList = Animated.createAnimatedComponent(
  SectionList,
) as unknown as typeof SectionList;

/** Gutter of `Screen`'s non-scroll body — the bar bleeds through it edge to edge. */
const GUTTER = 16;
/** The compact bar background never goes fully opaque, so the glow still reads. */
const BAR_BACKGROUND_MAX_OPACITY = 0.96;

/** Wall clock for velocity sampling — only ever called from scroll events. */
function nowMs(): number {
  'worklet';
  return Date.now();
}

export interface CollapsingScrollProps {
  // The ref is a callable AnimatedRef; typed loosely so it fits FlatList,
  // SectionList and ScrollView alike.
  ref: never;
  onScroll: never;
  scrollEventThrottle: number;
  contentContainerStyle: { paddingBottom: number; minHeight: number };
  showsVerticalScrollIndicator: boolean;
  keyboardShouldPersistTaps: 'handled';
}

export interface CollapsingHeaderApi {
  /** Spread onto the Animated list / ScrollView. */
  scrollProps: CollapsingScrollProps;
  /** The expanded title block — render it first (ListHeaderComponent / first child). */
  largeTitle: ReactElement;
  /** `progressViewOffset` for a RefreshControl so the Android spinner clears the bar. */
  refreshOffset: number;
}

interface CollapsingHeaderScreenProps {
  title: string;
  /** Line under the large title (expanded state only). */
  subtitle?: string | null;
  /** Show a back arrow: `true` = `router.back()`, or a custom handler. */
  back?: boolean | (() => void);
  /** Trailing actions in the compact bar (visible in both states). */
  right?: ReactNode;
  /** Same as `Screen`: clearance for the floating tab bar. */
  withTabBar?: boolean;
  /** Same as `Screen`: floating pill actions above the tab bar. */
  floatingAboveTabBar?: ReactNode;
  children: (api: CollapsingHeaderApi) => ReactNode;
}

export function CollapsingHeaderScreen({
  title,
  subtitle,
  back = false,
  right,
  withTabBar = false,
  floatingAboveTabBar,
  children,
}: CollapsingHeaderScreenProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const bottomPad = useScreenBottomPad({ floating: !!floatingAboveTabBar, withTabBar });
  const [viewport, setViewport] = useState(0);

  const heroHeight = expandedHeight(windowHeight, insets.top);
  const distance = collapseDistance(heroHeight);

  const listRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const expandAllowed = useSharedValue(true);
  const lastY = useSharedValue(0);
  const lastT = useSharedValue(0);
  const velocity = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler(
    {
      onBeginDrag: (e) => {
        expandAllowed.value = canExpandFromDragStart(e.contentOffset.y, distance);
      },
      onScroll: (e) => {
        const y = e.contentOffset.y;
        const now = nowMs();
        velocity.value = sampleVelocity(lastY.value, lastT.value, y, now);
        lastY.value = y;
        lastT.value = now;
        scrollY.value = y;
        const pinned = clampOffset(y, distance, expandAllowed.value);
        if (pinned !== null) scrollTo(listRef, 0, pinned, false);
      },
      onEndDrag: (e) => {
        const v = releaseVelocity(velocity.value, lastT.value, nowMs());
        const target = snapTarget(e.contentOffset.y, v, distance, expandAllowed.value);
        if (target !== null) scrollTo(listRef, 0, target, !reduceMotion);
      },
      onMomentumEnd: (e) => {
        const target = snapTarget(e.contentOffset.y, 0, distance, expandAllowed.value);
        if (target !== null) scrollTo(listRef, 0, target, !reduceMotion);
      },
    },
    [distance, reduceMotion],
  );

  const api: CollapsingHeaderApi = {
    scrollProps: {
      ref: listRef as never,
      onScroll: onScroll as never,
      scrollEventThrottle: 16,
      contentContainerStyle: {
        paddingBottom: bottomPad,
        minHeight: contentMinHeight(viewport, distance),
      },
      showsVerticalScrollIndicator: false,
      keyboardShouldPersistTaps: 'handled',
    },
    largeTitle: (
      <LargeTitle
        title={title}
        subtitle={subtitle}
        height={heroHeight}
        scrollY={scrollY}
        distance={distance}
        reduceMotion={reduceMotion}
      />
    ),
    refreshOffset: BAR_HEIGHT,
  };

  return (
    <Screen
      scroll={false}
      padBottom={false}
      withTabBar={withTabBar}
      floatingAboveTabBar={floatingAboveTabBar}
    >
      <View className="flex-1" onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        {children(api)}
        <CompactBar
          title={title}
          back={back}
          right={right}
          scrollY={scrollY}
          distance={distance}
        />
      </View>
    </Screen>
  );
}

interface AnimatedPartProps {
  scrollY: SharedValue<number>;
  distance: number;
}

function LargeTitle({
  title,
  subtitle,
  height,
  scrollY,
  distance,
  reduceMotion,
}: AnimatedPartProps & {
  title: string;
  subtitle?: string | null;
  height: number;
  reduceMotion: boolean;
}) {
  const fade = useAnimatedStyle(() => {
    const v = headerVisuals(scrollY.value, distance, reduceMotion);
    return { opacity: v.largeTitleOpacity, transform: [{ scale: v.largeTitleScale }] };
  });

  return (
    <View style={[styles.hero, { height }]}>
      <Animated.View style={[styles.heroText, fade]}>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          className="text-center font-jakarta-semibold text-headline-xl text-on-surface"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-sm text-center font-inter text-body-md text-on-surface-variant">
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

function CompactBar({
  title,
  back,
  right,
  scrollY,
  distance,
}: AnimatedPartProps & {
  title: string;
  back: boolean | (() => void);
  right?: ReactNode;
}) {
  const titleStyle = useAnimatedStyle(() => ({
    opacity: headerVisuals(scrollY.value, distance).barTitleOpacity,
  }));
  const backgroundStyle = useAnimatedStyle(() => ({
    opacity:
      headerVisuals(scrollY.value, distance).barBackgroundOpacity *
      BAR_BACKGROUND_MAX_OPACITY,
  }));
  const borderStyle = useAnimatedStyle(() => ({
    opacity: headerVisuals(scrollY.value, distance).borderOpacity,
  }));

  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barBackground, backgroundStyle]} />
      <Animated.View style={[styles.barBorder, borderStyle]} />
      {back ? (
        <Pressable
          onPress={typeof back === 'function' ? back : () => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          className="-ml-2 p-2"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
      ) : null}
      <Animated.View
        style={[styles.barTitle, titleStyle]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          numberOfLines={1}
          className="font-jakarta-semibold text-headline-md text-on-surface"
        >
          {title}
        </Text>
      </Animated.View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    // The top BAR_HEIGHT of the hero sits under the compact bar.
    paddingTop: BAR_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { alignItems: 'center', paddingHorizontal: 8 },
  bar: {
    position: 'absolute',
    top: 0,
    left: -GUTTER,
    right: -GUTTER,
    height: BAR_HEIGHT,
    paddingHorizontal: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    // Drags on the empty bar fall through to the list underneath.
    pointerEvents: 'box-none',
  },
  barBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    pointerEvents: 'none',
  },
  barBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    pointerEvents: 'none',
  },
  barTitle: { flex: 1, pointerEvents: 'none' },
});
