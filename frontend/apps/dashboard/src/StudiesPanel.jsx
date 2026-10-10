import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { createStudiesController, studyPresentation } from './studies.mjs';
import { useLanguage } from './Language.jsx';
import { palette } from './ui.mjs';

// Scoped presentation copy; the model and its permission gates remain unchanged.
const metadataCopy = {
  en: { missingPurpose: 'Some studies do not include a description.', missingTime: 'Completion times are not available.' },
  es: { missingPurpose: 'Algunos estudios no incluyen una descripción.', missingTime: 'No hay tiempos de entrega disponibles.' },
};

export default function StudiesPanel({ session, Label, Action, styles, scale }) {
  const { t, language } = useLanguage();
  const [controller] = useState(() => createStudiesController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.open(session); return () => controller.close(); }, [controller, session]);

  return <View testID="studies-panel" style={{ gap: 12, borderTopWidth: 1, borderColor: palette.borderSoft, paddingTop: 16 }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 20 * scale, lineHeight: 28 * scale }}>{t('studiesHeading')}</Label>
    <View accessibilityLiveRegion="polite" style={{ gap: 12 }}>
      {state.status === 'restricted' && <View style={styles.restriction}>
        <Label>{t(state.count === 1 ? 'studiesRestricted' : 'studiesRestrictedPlural', { count: state.count ?? 0 })}</Label>
      </View>}
      {state.status === 'unavailable' && <Label>{t('studiesUnavailable')}</Label>}
      {state.status === 'loading' && <Label>{t('studiesLoading')}</Label>}
      {state.status === 'error' && <View style={{ gap: 8 }}><Label>{t('studiesError')}</Label><Action label={t('retry')} onPress={() => controller.open(session)}>{t('retry')}</Action></View>}
      {state.status === 'empty' && <View style={{ gap: 6 }}><Label>{t('studiesEmpty')}</Label><Label style={styles.small}>{t('studiesEmptyDisclaimer')}</Label></View>}
      {state.status === 'ready' && state.items.map(item => {
        const row = studyPresentation(item, language);
        return <View testID="study-row" key={item.id} style={[styles.card, { boxShadow: 'none', gap: 8 }]}>
          <View style={styles.topline}>
            <Label accessibilityRole="header" style={{ fontWeight: '700', flex: 1 }}>{row.name}</Label>
            <Label style={{ fontWeight: '700', color: palette.blue, backgroundColor: palette.borderSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 }}>{row.status}</Label>
          </View>
          <Label>{row.explanation}</Label>
          {item.purposeKey && <Label style={styles.small}>{t('studyPurpose', { purpose: row.purpose })}</Label>}
        </View>;
      })}
      {state.status === 'ready' && <Label style={styles.small}>{[
        state.items.some(item => !item.purposeKey) && metadataCopy[language === 'es' ? 'es' : 'en'].missingPurpose,
        metadataCopy[language === 'es' ? 'es' : 'en'].missingTime,
      ].filter(Boolean).join(' ')}</Label>}
    </View>
  </View>;
}
