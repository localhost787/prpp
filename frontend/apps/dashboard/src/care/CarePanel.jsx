import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CARMEN_CARE_FIXTURE, createCareModel } from './care.mjs';

/**
 * Isolated AYO-89 panel. It is intentionally not connected to App.jsx.
 *
 * Props:
 * - language: "en" (default) or "es".
 * - patientDisplayName: already-authorized display name used only in restriction copy.
 * - permissions: explicit booleans for { team, instructions, medicines }.
 *   Missing/non-boolean values fail closed as unavailable; data shape never grants access.
 * - data: { participant, instructions, medicines }; defaults to the documented Carmen mock.
 * - textScale: optional positive multiplier supplied by the eventual host.
 *
 * The host remains responsible for removing this component on context/session changes and
 * for never passing data from a previous patient or role. This module performs no fetching,
 * subscriptions, persistence, analytics, navigation, or Medplum operations.
 */
export default function CarePanel({
  language = 'en',
  patientDisplayName = 'Doña Carmen',
  permissions = {},
  data = CARMEN_CARE_FIXTURE,
  textScale = 1,
}) {
  const model = createCareModel({ language, patientDisplayName, permissions, data });
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const label = (children, style) => <Text style={[styles.text, { fontSize: 16 * scale, lineHeight: 24 * scale }, style]}>{children}</Text>;
  const sectionMessage = section => section.message ? <View style={section.status === 'restricted' ? styles.restricted : styles.notice}>{label(section.message)}</View> : null;

  return <View testID="care-panel" style={styles.panel}>
    <View style={styles.header}>
      {label(model.copy.title, [styles.title, { fontSize: 28 * scale, lineHeight: 36 * scale }])}
      {label(model.copy.provisional, styles.provisional)}
    </View>

    {model.sections.team.status !== 'hidden' && <View testID="care-team-section" style={styles.card}>
      <Text accessibilityRole="header" style={[styles.heading, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.teamTitle}</Text>
      {sectionMessage(model.sections.team)}
      {model.sections.team.items.map(person => <View key={person.id} style={styles.item}>
        {label(person.name, styles.itemTitle)}
        {person.role && label(person.role)}
        {person.location && label(person.location, styles.muted)}
      </View>)}
    </View>}

    <View testID="care-instructions-section" style={styles.card}>
      <Text accessibilityRole="header" style={[styles.heading, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.instructionsTitle}</Text>
      {sectionMessage(model.sections.instructions)}
      {model.sections.instructions.items.map(instruction => <View key={instruction.id} style={styles.instruction}>
        {label(instruction.text, styles.itemTitle)}
      </View>)}
    </View>

    <View testID="care-medicines-section" style={styles.card}>
      <Text accessibilityRole="header" style={[styles.heading, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>{model.copy.medicinesTitle}</Text>
      {sectionMessage(model.sections.medicines)}
      {model.sections.medicines.items.map(medicine => <View key={medicine.id} style={styles.medicine}>
        {label(medicine.name, styles.itemTitle)}
        {medicine.mockOnly && label(model.copy.additionalMock, styles.provisional)}
        {label(`${model.copy.doseLabel}: ${medicine.dose ?? model.copy.notDocumented}`, styles.detail)}
        {label(`${model.copy.routeLabel}: ${medicine.route ?? model.copy.notDocumented}`, styles.detail)}
        {label(`${model.copy.timeLabel}: ${medicine.time ?? model.copy.notDocumented}`, styles.detail)}
        {label(`${model.copy.purposeLabel}: ${medicine.purpose ?? model.copy.notDocumented}`, styles.detail)}
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 16, minWidth: 0 },
  header: { gap: 6 },
  title: { color: '#172b4d', fontWeight: '800' },
  text: { color: '#172b4d', flexShrink: 1 },
  heading: { color: '#172b4d', fontWeight: '700' },
  card: { backgroundColor: '#ffffff', borderColor: '#dce4ef', borderWidth: 1, borderRadius: 14, padding: 20, gap: 14, minWidth: 0 },
  item: { borderTopColor: '#52647a', borderTopWidth: 1, paddingTop: 12, gap: 3 },
  medicine: { borderTopColor: '#52647a', borderTopWidth: 1, paddingTop: 12, gap: 5 },
  instruction: { backgroundColor: '#eaf0fb', borderRadius: 10, padding: 14 },
  itemTitle: { fontWeight: '700' },
  detail: { color: '#425570' },
  muted: { color: '#425570' },
  provisional: { color: '#425570', fontWeight: '700' },
  restricted: { backgroundColor: '#fff4ce', borderColor: '#52647a', borderWidth: 1, borderRadius: 10, padding: 14 },
  notice: { backgroundColor: '#f2f5fa', borderRadius: 10, padding: 14 },
});
