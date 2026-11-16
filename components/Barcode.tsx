import { type ReactNode, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Rect } from 'react-native-svg';
import { encodeBarcode, type BarcodeFormat } from '@/lib/barcode';
import { barRuns, moduleWidthFor } from './barcodeLayout';
import { colors } from '@/lib/theme';

// DELIBERATE DESIGN EXCEPTION: the barcode sits on the one white surface in the
// app. Scanners need dark bars on a light ground with a quiet zone; the dark
// theme would make the code unreadable at the till.
const PAPER = '#ffffff';
/** Bars / QR cells: the darkest palette token — scanner contrast is the same as pure black. */
const INK = colors.surfaceContainerLowest;
/** Quiet zone each side of a 1-D code (px), also the surface's padding. */
const QUIET_ZONE = 16;

export interface BarcodeProps {
  value: string;
  format: BarcodeFormat;
  /** Bar height (px). Default 96. */
  height?: number;
  /** Total surface width (px). Measured from the container (onLayout) when omitted. */
  width?: number;
  /**
   * Draw straight on a coloured surface (e.g. a loyalty card tile) instead of
   * the white paper: `paper` is the ground, `ink` the bars. Keeps the quiet zone
   * but drops the rounded white box. The white surface stays the presenter's.
   */
  tone?: { paper: string; ink: string };
}

function InvalidCode({ value, ink = INK }: { value: string; ink?: string }) {
  return (
    <View className="items-center py-md">
      <Text
        className="text-center font-inter-semibold text-headline-md"
        style={{ color: ink }}
      >
        {value}
      </Text>
      <Text
        className="mt-xs font-inter-medium text-label-md uppercase"
        style={{ color: ink }}
      >
        Невалиден код
      </Text>
    </View>
  );
}

/**
 * Renders a loyalty-card code on its white surface: EAN-13 / EAN-8 / Code128
 * as SVG bars from `lib/barcode`, QR via react-native-qrcode-svg. A value the
 * encoder rejects (or a QR payload too long to encode) falls back to the code
 * as text + "Невалиден код". Never throws.
 */
export function Barcode({ value, format, height = 96, width, tone }: BarcodeProps) {
  const [measured, setMeasured] = useState(0);
  const [qrFailed, setQrFailed] = useState<string | null>(null);
  const paper = tone?.paper ?? PAPER;
  const ink = tone?.ink ?? INK;
  const surfaceWidth = width ?? measured;
  const inner = Math.max(0, surfaceWidth - QUIET_ZONE * 2);

  const modules = useMemo(
    () => (format === 'qr' ? null : encodeBarcode(value, format)),
    [value, format],
  );

  const onLayout =
    width === undefined
      ? (e: LayoutChangeEvent) => setMeasured(Math.round(e.nativeEvent.layout.width))
      : undefined;

  let content: ReactNode = null;
  if (format === 'qr') {
    if (value.length === 0 || qrFailed === value) {
      content = <InvalidCode value={value} ink={ink} />;
    } else if (inner > 0) {
      const size = Math.min(inner, height * 2);
      content = (
        <View className="items-center">
          <QRCode
            value={value}
            size={size}
            color={ink}
            backgroundColor={paper}
            // The library reports from inside its render (useMemo); defer the
            // state update so we never set parent state mid-render.
            onError={() => setTimeout(() => setQrFailed(value), 0)}
          />
        </View>
      );
    }
  } else if (!modules) {
    content = <InvalidCode value={value} ink={ink} />;
  } else if (inner > 0) {
    const mw = moduleWidthFor(inner, modules.length);
    const svgWidth = mw * modules.length;
    content = (
      <View className="items-center">
        <Svg width={svgWidth} height={height} style={{ width: svgWidth, height }}>
          {barRuns(modules).map(([start, run]) => (
            <Rect
              key={start}
              x={start * mw}
              y={0}
              width={run * mw}
              height={height}
              fill={ink}
            />
          ))}
        </Svg>
      </View>
    );
  }

  return (
    <View
      onLayout={onLayout}
      style={{
        borderRadius: tone ? 0 : 12,
        backgroundColor: paper,
        paddingHorizontal: QUIET_ZONE,
        paddingVertical: QUIET_ZONE,
        width,
        minHeight: height + QUIET_ZONE * 2,
        justifyContent: 'center',
      }}
    >
      {content}
    </View>
  );
}
