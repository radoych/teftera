import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { barRuns } from '@/components/barcodeLayout';
import { colors } from '@/lib/theme';
import type { FormatGroup } from '../format';
import {
  EAN_SAMPLE,
  FORMAT_HINTS,
  FORMAT_ORDER,
  QR_GRID,
  code128SampleModules,
  eanSampleModules,
  qrDataCells,
  qrFinderOrigins,
  tooltipAnchor,
} from '../formatSamples';

const LONG_PRESS_MS = 400;
const TOOLTIP_MS = 1600;
const TOOLTIP_W = 220;
const DRAW_W = 76;
const DRAW_H = 48;

function Drawing({ group, color }: { group: FormatGroup; color: string }) {
  const ean = useMemo(() => eanSampleModules(), []);
  const c128 = useMemo(() => code128SampleModules(), []);
  const cells = useMemo(() => qrDataCells(), []);

  if (group === 'qr') {
    const u = DRAW_H / QR_GRID;
    const ox = (DRAW_W - DRAW_H) / 2;
    return (
      <Svg width={DRAW_W} height={DRAW_H}>
        {qrFinderOrigins().map(([fx, fy]) => (
          <G key={`${fx}-${fy}`}>
            <Rect
              x={ox + (fx + 0.5) * u}
              y={(fy + 0.5) * u}
              width={6 * u}
              height={6 * u}
              fill="none"
              stroke={color}
              strokeWidth={u}
            />
            <Rect x={ox + (fx + 2) * u} y={(fy + 2) * u} width={3 * u} height={3 * u} fill={color} />
          </G>
        ))}
        {cells.map(([x, y]) => (
          <Rect key={`${x}-${y}`} x={ox + x * u} y={y * u} width={u} height={u} fill={color} />
        ))}
      </Svg>
    );
  }

  const modules = group === 'ean' ? ean : c128;
  const mw = DRAW_W / Math.max(1, modules.length);
  const barH = group === 'ean' ? DRAW_H - 10 : DRAW_H;
  return (
    <Svg width={DRAW_W} height={DRAW_H}>
      {barRuns(modules).map(([start, run]) => (
        <Rect key={start} x={start * mw} y={0} width={run * mw} height={barH} fill={color} />
      ))}
      {group === 'ean' ? (
        <SvgText
          x={DRAW_W / 2}
          y={DRAW_H - 1}
          fontSize={8}
          fill={color}
          textAnchor="middle">
          {EAN_SAMPLE}
        </SvgText>
      ) : null}
    </Svg>
  );
}

export interface FormatPickerProps {
  value: FormatGroup;
  onChange: (group: FormatGroup) => void;
}

/**
 * Three equal tiles that show what EAN / Code128 / QR look like. Tap selects;
 * long-press shows a short explanation bubble above the tile.
 */
export function FormatPicker({ value, onChange }: FormatPickerProps) {
  const [hint, setHint] = useState<FormatGroup | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const show = (g: FormatGroup) => {
    longPressed.current = true;
    setHint(g);
    clear();
    timer.current = setTimeout(() => setHint(null), TOOLTIP_MS);
  };
  const hide = () => {
    clear();
    setHint(null);
  };

  return (
    <View className="flex-row gap-sm" accessibilityRole="radiogroup">
      {FORMAT_ORDER.map((g, i) => {
        const selected = value === g;
        const tint = selected ? colors.primaryContainer : colors.onSurfaceVariant;
        const anchor = tooltipAnchor(i, FORMAT_ORDER.length);
        const { label, text } = FORMAT_HINTS[g];
        return (
          <View key={g} className="flex-1" style={{ zIndex: hint === g ? 10 : 0 }}>
            {hint === g ? (
              <View
                pointerEvents="none"
                className="absolute rounded-xl bg-surface-container-highest p-sm"
                style={{
                  bottom: '100%',
                  marginBottom: 6,
                  width: TOOLTIP_W,
                  ...(anchor === 'left' ? { left: 0 } : null),
                  ...(anchor === 'right' ? { right: 0 } : null),
                  ...(anchor === 'center' ? { left: '50%', marginLeft: -TOOLTIP_W / 2 } : null),
                  shadowColor: colors.surfaceContainerLowest,
                  shadowOpacity: 0.5,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 8,
                }}>
                <Text className="font-inter-semibold text-label-md uppercase text-on-surface">
                  {label}
                </Text>
                <Text className="mt-xs font-inter text-body-md text-on-surface-variant">{text}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => {
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                onChange(g);
              }}
              onLongPress={() => show(g)}
              delayLongPress={LONG_PRESS_MS}
              onPressOut={hide}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={label}
              accessibilityHint={text}
              className="items-center py-md"
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: selected ? colors.primaryContainer : 'rgba(255,255,255,0.1)',
                backgroundColor: selected ? 'rgba(173,199,255,0.12)' : colors.surfaceContainer,
              }}>
              <Drawing group={g} color={tint} />
              <Text
                className="mt-sm font-inter-semibold text-label-md uppercase"
                style={{ color: tint }}>
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
