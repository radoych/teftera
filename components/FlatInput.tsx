import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

/**
 * Flat, borderless input: transparent background with a single bottom hairline
 * that brightens to primary on focus. Matches the Stitch auth screens.
 */
export function FlatInput(props: TextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: focused ? '#adc7ff' : 'rgba(255,255,255,0.1)',
      }}>
      <TextInput
        placeholderTextColor="rgba(196,198,208,0.5)"
        className="py-sm font-inter text-body-lg text-on-surface"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </View>
  );
}
