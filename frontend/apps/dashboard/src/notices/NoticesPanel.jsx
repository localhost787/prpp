import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { controlSizes, palette, radii, spacing, surfaceStyles } from '../ui.mjs';

function Copy({ children, languageTag, scale, style, ...props }) {
  return <Text accessibilityLanguage={languageTag} {...props} style={[styles.text, { fontSize: 16 * scale, lineHeight: 24 * scale }, style]}>{children}</Text>;
}

export default function NoticesPanel({ language = 'en', textScale = 1, state, unreadCount = 0, onOpen }) {
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const languageTag = language === 'es' ? 'es-PR' : 'en-US';
  const copy = state?.copy;
  const status = state?.status ?? 'empty';
  return <View testID="notices-panel" style={styles.panel}>
    <View style={styles.header}>
      <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.heading, { fontSize: 24 * scale, lineHeight: 32 * scale }]}>{copy?.title ?? (language === 'es' ? 'Avisos' : 'Notices')}</Copy>
      <Copy languageTag={languageTag} scale={scale} style={styles.count}>{copy?.unread?.(unreadCount) ?? `${unreadCount}`}</Copy>
    </View>
    <Pressable accessibilityLanguage={languageTag} accessibilityRole="button" accessibilityLabel={copy?.open} onPress={onOpen} style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}>
      <Copy languageTag={languageTag} scale={scale} style={styles.openText}>{copy?.open}</Copy>
    </Pressable>
    {status !== 'ready' ? <View accessibilityLiveRegion="polite" accessibilityState={status === 'loading' ? { busy: true } : undefined} style={styles.notice}>
      <Copy languageTag={languageTag} scale={scale}>{state?.message}</Copy>
    </View> : <View style={styles.list}>
      {state.items.map(item => <View key={item.id} style={styles.card}>
        <View style={styles.row}>
          {item.time && <Copy languageTag={languageTag} scale={scale} style={styles.time}>{item.time}</Copy>}
          {item.synthetic && <Copy languageTag={languageTag} scale={scale} style={styles.synthetic}>{copy.synthetic}</Copy>}
        </View>
        <Copy languageTag={languageTag} scale={scale}>{item.text}</Copy>
      </View>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.lg, minWidth: 0 },
  header: { gap: spacing.xs },
  heading: { fontWeight: '800' },
  text: { color: palette.ink, flexShrink: 1 },
  count: { color: palette.blue, fontWeight: '700' },
  list: { gap: spacing.md },
  card: { ...surfaceStyles.card, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  time: { color: palette.muted, fontWeight: '700' },
  synthetic: { color: palette.muted },
  notice: { ...surfaceStyles.card, padding: spacing.lg },
  openButton: { minHeight: controlSizes.compact, alignSelf: 'flex-start', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: radii.control, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  openText: { color: palette.blue, fontWeight: '700' },
  pressed: { backgroundColor: palette.palePressed },
});
