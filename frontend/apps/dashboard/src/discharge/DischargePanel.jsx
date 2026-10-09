import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createDischargeModel } from './discharge.mjs';
import { palette, spacing, surfaceStyles } from '../ui.mjs';

function Copy({ children, languageTag, scale, style, ...props }) {
  return <Text accessibilityLanguage={languageTag} {...props} style={[styles.text, { fontSize: 16 * scale, lineHeight: 24 * scale }, style]}>{children}</Text>;
}

function SectionMessage({ section, languageTag, scale }) {
  if (!section?.message) return null;
  return <Copy languageTag={languageTag} scale={scale} style={styles.muted}>{section.message}</Copy>;
}

export default function DischargePanel({ language = 'en', textScale = 1, state, permissions = {} }) {
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const languageTag = language === 'es' ? 'es-PR' : 'en-US';
  const model = createDischargeModel({
    language,
    state: state?.status,
    visit: state?.visit,
    data: state?.data,
    permissions,
  });
  if (model.status === 'empty') return <View testID="discharge-panel" />;
  if (model.status === 'loading' || model.status === 'error') {
    return <View testID="discharge-panel" accessibilityLiveRegion="polite" accessibilityState={model.status === 'loading' ? { busy: true } : undefined} style={styles.card}>
      <Copy languageTag={languageTag} scale={scale}>{model.message}</Copy>
    </View>;
  }

  return <View testID="discharge-panel" style={styles.panel}>
    <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.title, { fontSize: 28 * scale, lineHeight: 36 * scale }]}>{model.copy.title}</Copy>

    <View style={styles.card}>
      <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.diagnosis}</Copy>
      <Copy languageTag={languageTag} scale={scale}>{model.diagnosis.value ?? model.copy.notDocumented}</Copy>
    </View>

    <View style={styles.card}>
      <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.medicines}</Copy>
      <SectionMessage section={model.medicines} languageTag={languageTag} scale={scale} />
      {model.medicines.items.map(item => <View key={item.id} style={styles.item}>
        {item.labelText && <Copy languageTag={languageTag} scale={scale} style={styles.badge}>{item.labelText}</Copy>}
        <Copy languageTag={languageTag} scale={scale} style={styles.itemTitle}>{[item.name, item.strength].filter(Boolean).join(' ')}</Copy>
        <Copy languageTag={languageTag} scale={scale} style={styles.muted}>{item.directions ?? model.copy.notDocumented}</Copy>
      </View>)}
    </View>

    <View style={styles.card}>
      <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.instructions}</Copy>
      <SectionMessage section={model.instructions} languageTag={languageTag} scale={scale} />
      {model.instructions.value && <Copy languageTag={languageTag} scale={scale}>{model.instructions.value}</Copy>}
    </View>

    <View style={styles.warning}>
      <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.warningTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.alarms}</Copy>
      {model.alarms.status === 'not-documented' && <Copy languageTag={languageTag} scale={scale}>{model.copy.notDocumented}</Copy>}
      {model.alarms.status === 'empty' && <Copy languageTag={languageTag} scale={scale}>{model.copy.empty}</Copy>}
      {model.alarms.items.map((alarm, index) => <Copy key={`${index}-${alarm}`} languageTag={languageTag} scale={scale}>{`• ${alarm}`}</Copy>)}
    </View>

    <View style={styles.card}>
      <Copy languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.sectionTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.appointment}</Copy>
      <SectionMessage section={model.appointment} languageTag={languageTag} scale={scale} />
      {model.appointment.status === 'ready' && <>
        <Copy languageTag={languageTag} scale={scale} style={styles.itemTitle}>{model.appointment.time}</Copy>
        {model.appointment.mode && <Copy languageTag={languageTag} scale={scale}>{model.appointment.mode}</Copy>}
        {model.appointment.clinician && <Copy languageTag={languageTag} scale={scale}>{model.appointment.clinician}</Copy>}
      </>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.lg, minWidth: 0 },
  text: { color: palette.ink, flexShrink: 1 },
  title: { fontWeight: '800' },
  sectionTitle: { fontWeight: '700' },
  card: { ...surfaceStyles.card, padding: spacing.lg, gap: spacing.md },
  item: { borderTopWidth: 1, borderTopColor: palette.borderSoft, paddingTop: spacing.md, gap: spacing.xs },
  itemTitle: { fontWeight: '700' },
  badge: { color: palette.blue, fontWeight: '800' },
  muted: { color: palette.muted },
  warning: { ...surfaceStyles.card, borderColor: palette.red, borderWidth: 2, padding: spacing.lg, gap: spacing.sm },
  warningTitle: { color: palette.red, fontWeight: '800' },
});
