import React, { createContext, useContext, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { useLanguage, accessibilityLanguageProps } from '../Language.jsx';
import { palette, buttonVisualState, controlSizes, radii } from '../ui.mjs';

export const Scale = createContext(1);
export function Label({ children, style, ...props }) {
  const scale = useContext(Scale);
  const { language } = useLanguage();
  return <Text {...accessibilityLanguageProps(Platform.OS, language)} {...props} style={[{ color: palette.ink, fontSize: 16 * scale, lineHeight: 24 * scale, flexShrink: 1 }, style]}>{children}</Text>;
}

// `primary` remains a compatibility alias for existing panel consumers.
export function Action({ children, label, onPress, selected, disabled = false, primary = false, variant = primary ? 'primary' : 'secondary', size = 'regular', expanded, controls, showMarker = true, controlRef, style, content }) {
  const { language } = useLanguage();
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const state = pressed => buttonVisualState({variant, selected, disabled, hovered, pressed, focused});
  return <Pressable {...accessibilityLanguageProps(Platform.OS, language)} ref={controlRef}
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }), ...(Platform.OS === 'web' || selected === undefined ? {} : { selected }) }}
    {...(Platform.OS === 'web' ? { 'aria-pressed': selected, 'aria-expanded': expanded, 'aria-controls': controls, dataSet: { variant, size } } : {})}
    disabled={disabled} onPress={onPress}
    onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    onFocus={event => setFocused(Platform.OS !== 'web' || event.target.matches?.(':focus-visible') === true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [{ minWidth: 44, minHeight: controlSizes[size] ?? controlSizes.regular, maxWidth: '100%', alignSelf: 'flex-start',
      borderRadius: radii.control, paddingHorizontal: size === 'compact' ? 10 : 16, paddingVertical: size === 'compact' ? 7 : 11,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 }, state(pressed).container, style]}>
    {({ pressed }) => <>
      {content ?? <Label style={state(pressed).label}>{children}</Label>}
      {selected && showMarker && <Text testID="selected-marker" accessible={false} {...(Platform.OS === 'web' ? { 'aria-hidden': true } : {})} style={{ color: state(pressed).label.color, fontSize: 16, fontWeight: '800' }}>✓</Text>}
    </>}
  </Pressable>;
}
