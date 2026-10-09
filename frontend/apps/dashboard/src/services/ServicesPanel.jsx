import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Action, Scale } from '../ui/Action.jsx';
import { Language, accessibilityLanguageProps } from '../Language.jsx';
import { createServicesModel, SYNTHETIC_SERVICES } from './services.mjs';
import { palette, spacing, surfaceStyles } from '../ui.mjs';

export default function ServicesPanel({
  language = 'en',
  textScale = 1,
  state = 'list',
  services = SYNTHETIC_SERVICES,
  onRetry,
}) {
  const model = createServicesModel({ language, state, services });
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
  const languageProps = accessibilityLanguageProps(Platform.OS, model.language);
  const text = (children, style) => (
    <Text {...languageProps} style={[styles.text, { fontSize: 16 * scale, lineHeight: 24 * scale }, style]}>
      {children}
    </Text>
  );

  let content;
  if (model.state === 'list') {
    content = <View testID="services-list" style={styles.list}>
      {model.items.map(service => {
        const planValue = service.acceptsPlan === true
          ? model.copy.acceptsPlan
          : service.acceptsPlan === false
            ? model.copy.doesNotAcceptPlan
            : model.copy.notDocumented;
        return <View key={service.id} testID={`service-${service.id}`} style={styles.card}>
          <Text {...languageProps} accessibilityRole="header" style={[styles.text, styles.cardTitle, { fontSize: 20 * scale, lineHeight: 28 * scale }]}>
            {service.name}
          </Text>
          {service.type && text(service.type, styles.type)}
          {service.distanceKm !== null && text(`${model.copy.distance}: ${service.distanceKm} km`)}
          {text(`${model.copy.estimatedWait}: ${service.estimatedWait ?? model.copy.notDocumented}`)}
          {text(`${model.copy.planAcceptance}: ${planValue}`)}
        </View>;
      })}
    </View>;
  } else if (model.state === 'error') {
    content = <View accessibilityLiveRegion="polite" style={styles.status}>
      {text(model.message)}
      <Action label={model.copy.retry} disabled={typeof onRetry !== 'function'} onPress={onRetry}>{model.copy.retry}</Action>
    </View>;
  } else {
    content = <View
      accessibilityLiveRegion="polite"
      {...(Platform.OS === 'web' ? { 'aria-busy': model.state === 'loading' } : { accessibilityState: model.state === 'loading' ? { busy: true } : undefined })}
      style={styles.status}
    >
      {text(model.message)}
    </View>;
  }

  return <Language.Provider value={model.language}><Scale.Provider value={scale}><View testID="services-panel" style={styles.panel}>
    <Text {...languageProps} accessibilityRole="header" style={[styles.text, styles.title, { fontSize: 28 * scale, lineHeight: 36 * scale }]}>
      {model.copy.title}
    </Text>
    {text(model.copy.directoryNotice)}
    {content}
  </View></Scale.Provider></Language.Provider>;
}

const styles = StyleSheet.create({
  panel: { gap: spacing.lg, minWidth: 0 },
  title: { color: palette.ink, fontWeight: '800' },
  text: { color: palette.ink, flexShrink: 1 },
  list: { gap: spacing.md },
  card: { ...surfaceStyles.card, padding: spacing.lg, gap: spacing.sm, minWidth: 0 },
  cardTitle: { fontWeight: '700' },
  type: { color: palette.muted, fontWeight: '600' },
  status: { ...surfaceStyles.card, padding: spacing.lg, gap: spacing.md },
});
