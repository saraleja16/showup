import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { MatchCandidate } from '@/src/api';
import { colors, radii, typography } from '@/src/constants/theme';
import { MatchCandidateCard } from '@/src/features/match/MatchCandidateCard';

const ITEM_SPACING = 16;
const STACK_SCALE_MIN = 0.87;
const STACK_OPACITY_MIN = 0.55;
/** Progress (in "slots away from center") beyond which a card is fully invisible. */
const FADE_LIMIT = 1.4;
/** How many neighbors on each side stay mounted, so they're ready before a drag reaches them. */
const RENDER_WINDOW = 2;
/** Total duration of the connect/skip flourish, in ms — slow enough to read as intentional. */
const ACTION_DURATION_MS = 1000;

export type ProfileAction = { userId: string; kind: 'connect' | 'skip' };

type Props = {
  candidates: MatchCandidate[];
  focusedIndex: number;
  onFocusedIndexChange: (index: number) => void;
  /** The candidate currently playing its connect/skip flourish, if any. */
  activeAction?: ProfileAction | null;
  /** Called once the flourish finishes — safe to remove the card from the queue now. */
  onActionComplete?: (userId: string) => void;
  /** Decision handlers, rendered inside the focused card's own footer. */
  onSkip?: () => void;
  onConnect?: () => void;
  /** True while a decision is in flight — the focused card's buttons go inert. */
  actionBusy?: boolean;
};

/**
 * Vertical, snapping card-stack carousel: the focused profile sits centered and
 * full-size, with the previous/next profiles peeking out from behind it — scaled down,
 * dimmed, and layered by z-index so they visibly emerge from underneath as you scroll,
 * rather than sliding in from a separate list row. Scrolling only changes which profile
 * is focused — it never records a decision. Connect/Skip act on whichever card is
 * currently centered.
 *
 * The scroll gesture itself is driven by an invisible ScrollView sized to the full
 * candidate list (for correct momentum/snap physics); the visible cards are a small,
 * absolutely-positioned overlay window driven purely off the scroll position, decoupled
 * from native per-row layout so their motion can be compressed into a "stacked" look.
 */
export function ProfileCarousel({
  candidates,
  focusedIndex,
  onFocusedIndexChange,
  activeAction = null,
  onActionComplete,
  onSkip,
  onConnect,
  actionBusy = false,
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const itemHeight = Math.min(420, Math.max(300, windowHeight * 0.46));
  const containerHeight = Math.min(560, Math.max(420, windowHeight * 0.6));
  const snapInterval = itemHeight + ITEM_SPACING;
  const peekOffset = itemHeight * 0.1;

  const scrollY = useSharedValue(focusedIndex * snapInterval);
  const scrollRef = useRef<Animated.ScrollView>(null);

  // Re-sync scroll position whenever the list shrinks (a decision removed a card) or
  // resets (new search/filters). Removing the currently-focused card leaves the raw
  // scroll offset unchanged, which already lands on the card that took its place — this
  // effect only needs to correct the edge case where the last card was the one decided.
  useEffect(() => {
    if (candidates.length === 0) return;
    const clamped = Math.min(focusedIndex, candidates.length - 1);
    if (clamped !== focusedIndex) {
      onFocusedIndexChange(clamped);
    }
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: clamped * snapInterval, animated: false });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length, snapInterval]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
    onMomentumEnd: (event) => {
      const idx = Math.round(event.contentOffset.y / snapInterval);
      const clamped = Math.max(0, Math.min(idx, candidates.length - 1));
      runOnJS(onFocusedIndexChange)(clamped);
    },
  });

  const visibleIndices = useMemo(() => {
    const start = Math.max(0, focusedIndex - RENDER_WINDOW);
    const end = Math.min(candidates.length - 1, focusedIndex + RENDER_WINDOW);
    const out: number[] = [];
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
  }, [focusedIndex, candidates.length]);

  return (
    <View style={[styles.wrap, { height: containerHeight }]}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        disableIntervalMomentum
        bounces={false}
        scrollEnabled={!activeAction}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          // Scrollable range such that the last item's natural snap offset,
          // (n-1) * snapInterval, is exactly the max scroll position.
          height:
            candidates.length > 0
              ? containerHeight + (candidates.length - 1) * snapInterval
              : containerHeight,
        }}
      />

      {/* box-none: the stack itself never swallows the pan gesture (that belongs to the
          ScrollView underneath), but the focused card's own buttons stay tappable. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {visibleIndices.map((i) => {
          const candidate = candidates[i];
          const isFocused = i === focusedIndex;
          return (
            <CarouselItem
              key={candidate.userId}
              candidate={candidate}
              index={i}
              focused={isFocused}
              onSkip={isFocused && !activeAction ? onSkip : undefined}
              onConnect={isFocused && !activeAction ? onConnect : undefined}
              actionBusy={actionBusy}
              actionKind={activeAction?.userId === candidate.userId ? activeAction.kind : null}
              scrollY={scrollY}
              itemHeight={itemHeight}
              snapInterval={snapInterval}
              containerHeight={containerHeight}
              peekOffset={peekOffset}
              onActionComplete={
                onActionComplete ? () => onActionComplete(candidate.userId) : undefined
              }
            />
          );
        })}
      </View>
    </View>
  );
}

function CarouselItem({
  candidate,
  index,
  focused,
  actionKind,
  scrollY,
  itemHeight,
  snapInterval,
  containerHeight,
  peekOffset,
  onActionComplete,
  onSkip,
  onConnect,
  actionBusy,
}: {
  candidate: MatchCandidate;
  index: number;
  focused: boolean;
  actionKind: 'connect' | 'skip' | null;
  onSkip?: () => void;
  onConnect?: () => void;
  actionBusy?: boolean;
  scrollY: SharedValue<number>;
  itemHeight: number;
  snapInterval: number;
  containerHeight: number;
  peekOffset: number;
  onActionComplete?: () => void;
}) {
  const actionProgress = useSharedValue(0);

  useEffect(() => {
    if (actionKind) {
      actionProgress.value = withTiming(
        1,
        { duration: ACTION_DURATION_MS, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished && onActionComplete) runOnJS(onActionComplete)();
        }
      );
    } else {
      actionProgress.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionKind]);

  // Position + depth: how far this card is from the focused slot, in "slots".
  const stackStyle = useAnimatedStyle(() => {
    const progress = index - scrollY.value / snapInterval;
    const clamped = Math.max(-FADE_LIMIT, Math.min(FADE_LIMIT, progress));
    const absProgress = Math.abs(clamped);
    const direction = clamped === 0 ? 0 : clamped > 0 ? 1 : -1;

    const peek = interpolate(absProgress, [0, 1, FADE_LIMIT], [0, peekOffset, peekOffset], Extrapolation.CLAMP);
    const scale = interpolate(absProgress, [0, 1, FADE_LIMIT], [1, STACK_SCALE_MIN, STACK_SCALE_MIN], Extrapolation.CLAMP);
    const opacity = interpolate(absProgress, [0, 1, FADE_LIMIT], [1, STACK_OPACITY_MIN, 0], Extrapolation.CLAMP);
    const z = Math.round((FADE_LIMIT - absProgress) * 100);

    return {
      opacity,
      zIndex: z,
      elevation: z,
      transform: [{ translateY: direction * peek }, { scale }],
    };
  });

  // The connect/skip flourish: a slow, deliberate color wash, held, then the card
  // shrinks and fades away.
  const actionCardStyle = useAnimatedStyle(() => {
    const p = actionProgress.value;
    const scale = interpolate(p, [0, 0.4, 1], [1, 1.04, 0.78], Extrapolation.CLAMP);
    const opacity = interpolate(p, [0, 0.7, 1], [1, 1, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale }] };
  });

  const actionOverlayStyle = useAnimatedStyle(() => {
    const p = actionProgress.value;
    const overlayOpacity = interpolate(
      p,
      [0, 0.4, 0.8, 1],
      [0, 0.94, 0.94, 0],
      Extrapolation.CLAMP
    );
    return { opacity: overlayOpacity };
  });

  const overlayColor = actionKind === 'skip' ? colors.danger : colors.accent;
  const overlayForeground = actionKind === 'skip' ? colors.textPrimary : colors.background;

  return (
    <Animated.View
      pointerEvents={focused && !actionKind ? 'box-none' : 'none'}
      style={[
        styles.itemBox,
        { top: (containerHeight - itemHeight) / 2, height: itemHeight },
        stackStyle,
      ]}
    >
      <Animated.View style={actionCardStyle}>
        <MatchCandidateCard
          candidate={candidate}
          focused={focused}
          onSkip={onSkip}
          onConnect={onConnect}
          actionsBusy={actionBusy}
        />
      </Animated.View>

      {actionKind ? (
        <Animated.View
          style={[styles.actionOverlay, { backgroundColor: overlayColor }, actionOverlayStyle]}
        >
          <Ionicons
            name={actionKind === 'skip' ? 'close-circle' : 'checkmark-circle'}
            size={48}
            color={overlayForeground}
          />
          <Text style={[styles.actionText, { color: overlayForeground }]}>
            {actionKind === 'skip' ? 'Skipped' : 'Request sent'}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    width: '100%',
  },
  itemBox: {
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  actionOverlay: {
    alignItems: 'center',
    borderRadius: radii.xl,
    bottom: 0,
    gap: 8,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  actionText: {
    ...typography.label,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
