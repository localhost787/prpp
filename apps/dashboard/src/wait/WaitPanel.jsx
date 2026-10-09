import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, spacing, surfaceStyles } from '../ui.mjs';

function Copy({ children, languageTag, scale, style, ...props }) {
  return <Text accessibilityLanguage={languageTag} {...props} style={[styles.text, { fontSize: 16 * scale, lineHeight: 24 * scale }, style]}>{children}</Text>;
}

export default function WaitPanel({ language = 'en', textScale = 1, state }) {
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const languageTag = language === 'es' ? 'es-PR' : 'en-US';
  const status = state?.status ?? 'empty';
  if (status === 'empty') return <View testID="wait-panel" />;
  if (status === 'loading' || status === 'error') {
    return <View testID="wait-panel" accessibilityLiveRegion="polite" accessibilityState={status === 'loading' ? { busy: true } : undefined} style={styles.card}>
      <Copy languageTag={languageTag} scale={scale}>{state?.message}</Copy>
    </View>;
  }
  if (status !== 'ready' || !state?.card) return <View testID="wait-panel" />;

  return <View testID="wait-panel" style={styles.card}>
    <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.heading, { fontSize: 24 * scale, lineHeight: 32 * scale }]}>{state.card.heading}</Copy>
    <Copy languageTag={languageTag} scale={scale} style={styles.level}>{state.card.triageLabel}</Copy>
    <Copy languageTag={languageTag} scale={scale}>{state.card.reason}</Copy>
    <View style={styles.details}>
      <Copy languageTag={languageTag} scale={scale} style={styles.detail}>{state.card.peopleAheadLabel}</Copy>
      <Copy languageTag={languageTag} scale={scale} style={styles.detail}>{state.card.estimatedWaitLabel}</Copy>
    </View>
    <Copy languageTag={languageTag} scale={scale} style={styles.caution}>{state.card.caution}</Copy>
  </View>;
}

const styles = StyleSheet.create({
  card: { ...surfaceStyles.card, padding: spacing.lg, gap: spacing.md, minWidth: 0 },
  text: { color: palette.ink, flexShrink: 1 },
  heading: { fontWeight: '800' },
  level: { color: palette.blue, fontWeight: '700' },
  details: { gap: spacing.sm },
  detail: { fontWeight: '700' },
  caution: { color: palette.muted },
});
