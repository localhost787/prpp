import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  FAMILY_COPY,
  FAMILY_PERMISSION_FIXTURE,
  createDelegateFamilyModel,
  createOwnerFamilyModel,
} from './family.mjs';
import { controlSizes, palette, radii, spacing, surfaceStyles } from '../ui.mjs';

function FamilyText({ children, languageTag, scale, style, ...props }) {
  return <Text
    accessibilityLanguage={languageTag}
    {...props}
    style={[styles.text, { fontSize: 16 * scale, lineHeight: 24 * scale }, style]}
  >{children}</Text>;
}

function CategorySwitch({ caregiver, category, copy, languageTag, scale, onToggleCategory }) {
  const [focused, setFocused] = useState(false);
  const enabled = category.state === 'allowed';
  const disabled = category.state === 'unknown';
  const stateLabel = enabled ? copy.on : category.state === 'restricted' ? copy.off : copy.unknown;
  const localQualifier = languageTag === 'es-PR' ? 'en este ejemplo local' : 'in this local example';
  const meaning = disabled ? copy.unknown : `${enabled ? copy.allowed : copy.restricted} ${localQualifier}`;
  return <Pressable
    accessibilityLanguage={languageTag}
    accessibilityRole="switch"
    {...(Platform.OS === 'web' ? { 'aria-checked': enabled, 'aria-disabled': disabled } : {})}
    onFocus={event => setFocused(Platform.OS !== 'web' || event.target.matches?.(':focus-visible') === true)}
    onBlur={() => setFocused(false)}
    accessibilityLabel={`${category.label}: ${stateLabel}`}
    accessibilityHint={meaning}
    accessibilityState={{ checked: enabled, disabled }}
    disabled={disabled}
    onPress={() => onToggleCategory?.({ caregiverId: caregiver.id, category: category.id, enabled: !enabled })}
    style={({ pressed }) => [styles.switchRow, focused && styles.focused, enabled && styles.switchEnabled, pressed && styles.pressed, disabled && styles.disabled]}
  >
    <View style={styles.switchCopy}>
      <FamilyText languageTag={languageTag} scale={scale} style={styles.switchLabel}>{category.label}</FamilyText>
      <FamilyText languageTag={languageTag} scale={scale} style={styles.muted}>{meaning}</FamilyText>
    </View>
    <View style={styles.switchIndicator}>
      <View
        testID="family-switch-track"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
        style={[styles.switchTrack, enabled && styles.switchTrackEnabled]}
      >
        <View testID="family-switch-thumb" style={styles.switchThumb} />
      </View>
      <FamilyText languageTag={languageTag} scale={scale} style={[styles.switchState, !enabled && styles.muted]}>{stateLabel}</FamilyText>
    </View>
  </Pressable>;
}

export default function FamilyPanel({
  language = 'en',
  textScale = 1,
  viewer = { kind: 'patient' },
  patient = null,
  permissions = FAMILY_PERMISSION_FIXTURE,
  state = { status: 'ready' },
  onToggleCategory,
  onRemoveAccess,
}) {
  const resolvedLanguage = Object.hasOwn(FAMILY_COPY, language) ? language : 'en';
  const copy = FAMILY_COPY[resolvedLanguage];
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const languageTag = resolvedLanguage === 'es' ? 'es-PR' : 'en-US';
  const panelState = typeof state === 'string' ? state : state?.status ?? 'ready';
  const { width } = useWindowDimensions();
  const wide = width >= 1200 && scale === 1;

  let content;
  if (panelState === 'loading' || panelState === 'error') {
    content = <View
      accessibilityLiveRegion="polite"
      accessibilityState={panelState === 'loading' ? { busy: true } : undefined}
      style={styles.notice}
    >
      <FamilyText languageTag={languageTag} scale={scale}>
        {panelState === 'loading' ? copy.loadingPanel : copy.errorPanel}
      </FamilyText>
    </View>;
  } else if (viewer?.kind === 'delegate') {
    const caregiver = permissions.find?.(item => item.id === viewer.caregiverId);
    const model = createDelegateFamilyModel({
      language: resolvedLanguage,
      caregiver,
      sources: typeof state === 'object' ? state.sources : {},
    });
    content = <View style={styles.list} testID="delegate-family-categories">
      {model.categories.map(category => <View key={category.id} style={styles.card}>
        <FamilyText languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.cardTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{category.label}</FamilyText>
        <FamilyText languageTag={languageTag} scale={scale}>{category.message ?? copy.available}</FamilyText>
        {category.state === 'ready' && category.items.map(item => (
          <FamilyText key={item.id} languageTag={languageTag} scale={scale}>{item.label}</FamilyText>
        ))}
      </View>)}
    </View>;
  } else {
    const model = createOwnerFamilyModel({ language: resolvedLanguage, caregivers: permissions });
    content = <View style={[styles.list, { flexDirection: wide ? 'row' : 'column' }]} testID="patient-family-cards">
      {model.caregivers.map(caregiver => <View key={caregiver.id} style={[styles.card, wide && styles.wideCard]}>
        <FamilyText languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.cardTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{caregiver.name}</FamilyText>
        {caregiver.relationship && <FamilyText languageTag={languageTag} scale={scale} style={styles.muted}>{caregiver.relationship}</FamilyText>}
        {caregiver.categories.map(category => <CategorySwitch
          key={category.id}
          caregiver={caregiver}
          category={category}
          copy={copy}
          languageTag={languageTag}
          scale={scale}
          onToggleCategory={onToggleCategory}
        />)}
        <Pressable
          accessibilityLanguage={languageTag}
          accessibilityRole="button"
          accessibilityLabel={`${copy.removeLocal}: ${caregiver.name}`}
          onPress={() => onRemoveAccess?.({ caregiverId: caregiver.id })}
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
        >
          <FamilyText languageTag={languageTag} scale={scale} style={styles.removeText}>{copy.removeLocal}</FamilyText>
        </Pressable>
      </View>)}
    </View>;
  }

  return <View testID="family-panel" style={styles.panel}>
    <FamilyText languageTag={languageTag} scale={scale} accessibilityRole="header" style={[styles.title, { fontSize: 28 * scale, lineHeight: 36 * scale }]}>{copy.title}</FamilyText>
    {patient?.name && <FamilyText languageTag={languageTag} scale={scale} style={styles.muted}>{patient.name}</FamilyText>}
    {content}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.lg, minWidth: 0 },
  list: { gap: spacing.lg },
  text: { color: palette.ink, flexShrink: 1 },
  title: { fontWeight: '800' },
  muted: { color: palette.muted },
  card: { ...surfaceStyles.card, padding: spacing.lg, gap: spacing.md, minWidth: 0 },
  cardTitle: { fontWeight: '700' },
  notice: { ...surfaceStyles.card, padding: spacing.lg },
  switchRow: {
    minHeight: controlSizes.compact,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchEnabled: { backgroundColor: palette.pale },
  focused: { outlineColor: palette.blue, outlineStyle: 'solid', outlineWidth: 3, outlineOffset: 3 },
  switchCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0, gap: spacing.xs },
  switchLabel: { fontWeight: '600' },
  switchIndicator: { alignItems: 'center', maxWidth: '100%', gap: spacing.xs },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: palette.muted,
    backgroundColor: palette.muted,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  switchTrackEnabled: { backgroundColor: palette.blue, borderColor: palette.blue, justifyContent: 'flex-end' },
  switchThumb: { width: 20, height: 20, borderRadius: radii.pill, backgroundColor: palette.white },
  switchState: { color: palette.blue, fontWeight: '700' },
  pressed: { backgroundColor: palette.palePressed },
  disabled: { backgroundColor: palette.disabled, borderColor: palette.borderSoft },
  removeButton: {
    minHeight: controlSizes.compact,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  removeText: { color: palette.blue, fontWeight: '700' },
  wideCard: { flex: 1, flexBasis: 0 },
});
