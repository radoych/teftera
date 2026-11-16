import Svg, { Path } from 'react-native-svg';
import { colors } from '@/lib/theme';

type RMarkProps = {
  size?: number;
  color?: string;
};

/** Bare "R" letterform used as the app mark. No container, background or border. */
export function RMark({ size = 30, color = colors.primary }: RMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path
        fill={color}
        fillRule="evenodd"
        d="M3 6 H23 C30.5 6 34.5 9.6 34.5 15 C34.5 18.6 32.3 21 28.8 22 C31.4 22.9 32.7 24.8 33 27.6 L33.3 30.4 C33.45 31.7 34.1 32.2 35.2 31.9 L36.6 31.5 V34.6 C35 35.6 33 36.2 30.8 36.2 C27.3 36.2 25.5 34.4 25.2 31.1 L24.9 27.9 C24.65 25.4 23.4 24.4 20.9 24.4 H16.2 V30.6 H20.2 V36 H3 V30.6 H7.4 V11.4 H3 Z M16.2 11.4 V19.2 H22.2 C24.9 19.2 26.2 17.8 26.2 15.3 C26.2 12.8 24.9 11.4 22.2 11.4 Z"
      />
    </Svg>
  );
}
