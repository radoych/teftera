import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

/**
 * Flat, borderless input: transparent background with a single bottom hairline
 * that brightens to primary on focus. Matches the Stitch auth screens.
 *
 * When `secureTextEntry` is set it becomes a password field: a show/hide eye
 * toggle is rendered, and auto-capitalize / auto-correct are forced off so the
 * first character isn't capitalized and the password isn't "corrected".
 */
export function FlatInput({
  secureTextEntry,
  autoCapitalize,
  autoCorrect,
  ...props
}: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isPassword = secureTextEntry === true;

  return (
    <View
      className="flex-row items-center"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: focused ? '#adc7ff' : 'rgba(255,255,255,0.1)',
      }}>
      <TextInput
        placeholderTextColor="rgba(196,198,208,0.5)"
        className="flex-1 py-sm font-inter text-body-lg text-on-surface"
        {...props}
        secureTextEntry={isPassword && hidden}
        autoCapitalize={isPassword ? 'none' : autoCapitalize}
        autoCorrect={isPassword ? false : autoCorrect}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {isPassword ? (
        <Pressable
          onPress={() => setHidden((h) => !h)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Покажи паролата' : 'Скрий паролата'}
          className="pl-2">
          <MaterialIcons
            name={hidden ? 'visibility-off' : 'visibility'}
            size={20}
            color="#8e909a"
          />
        </Pressable>
      ) : null}
    </View>
  );
}
