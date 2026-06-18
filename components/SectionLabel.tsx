import { Text, type TextProps } from 'react-native';

/**
 * Uppercase section label: label-md, on-surface-variant at 50% opacity,
 * wide letter-spacing. Used above each grouped section.
 */
export function SectionLabel({ children, className, ...rest }: TextProps) {
  return (
    <Text
      className={`font-inter-medium text-label-md uppercase text-on-surface-variant opacity-50 ${className ?? ''}`}
      {...rest}>
      {children}
    </Text>
  );
}
