import React, { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useLanguage } from './Language.jsx';
import { visitPresentation } from './visit.mjs';

export default function VisitPanel({ session, controller, Label, Action, styles, scale }) {
  const { t, language } = useLanguage();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.open(session); return () => controller.close(); }, [controller, session]);
  // Render gate precedes effects: a switched context can never flash the old visit.
  const status = session.permissions.visita !== true ? 'restricted' : state.session === session ? state.status : 'loading';
  const visit = status === 'ready' ? state.visit : null;
  const presentation = visit ? visitPresentation(visit, session.permissions, language) : null;
  return <View testID="visit-panel" style={{ gap: 16 }}>
    <Label style={styles.eyebrow}>{t('visitEyebrow')}</Label>
    <Label testID="section-heading" accessibilityRole="header" style={{ fontSize: 26 * scale, lineHeight: 34 * scale, fontWeight: '700' }}>{t('visit')}</Label>

    <View accessibilityLiveRegion="polite" style={{ gap: 16 }}>
      {visit ? <>
        <Label testID="visit-current" style={{ fontWeight: '700', fontSize: 20 * scale, lineHeight: 28 * scale }}>{t('visitCurrent', { stage: visit.stage, name: presentation.stages[visit.stage - 1] })}</Label>
        <View style={{ gap: 8 }}>
          {presentation.stages.map((name, index) => <View testID="visit-phase" key={index} style={{ borderLeftWidth: 3, borderColor: index + 1 === visit.stage ? '#063b9e' : '#dce4ef', paddingVertical: 5, paddingHorizontal: 10, backgroundColor: index + 1 === visit.stage ? '#063b9e' : '#ffffff', borderRadius: 6 }}>
            <Label style={{ color: index + 1 === visit.stage ? '#ffffff' : '#172b4d', fontWeight: index + 1 === visit.stage ? '700' : '400' }}>{t('visitPhaseLabel', { number: index + 1, name, status: t(index + 1 === visit.stage ? 'visitCurrentMarker' : 'visitOtherMarker') })}</Label>
          </View>)}
        </View>
        <Label>{presentation.description}</Label>
        <Label accessibilityRole="header" style={styles.cardHeading}>{t('visitNext')}</Label>
        <Label>{presentation.next}</Label>
        <Label>{t('visitInitialStatus', { status: t(visit.status === 'in-progress' ? 'visitInCare' : 'unavailable') })}</Label>
        <Label>{t('visitLocation', visit)}</Label>
        <Label>{t('visitClinician', visit)}</Label>
        <Label>{t('visitStarted', { date: presentation.startedAt })}</Label>
        <Label style={styles.small}>{t('visitFixedSnapshot')}</Label>
      </> : <>
        <Label>{t({ restricted: 'visitRestricted', error: 'visitError', empty: 'visitEmpty' }[status] ?? 'visitLoading')}</Label>
        {status === 'empty' && <Label>{t('visitEmptyDisclaimer')}</Label>}
      </>}
    </View>
    <View testID="simulation-controls" style={styles.simulation}>
    <Label accessibilityRole="header" style={styles.cardHeading}>{t('visitScenarios')}</Label>
    <Label style={styles.small}>{t('visitSimulation')}</Label>
    {visit && <View style={styles.selector}>
      <Action size="compact" variant="ghost" label={t('visitPrevious')} disabled={visit.stage === 1} onPress={() => controller.stage(visit.stage - 1)}>{t('visitPrevious')}</Action>
      <Action size="compact" variant="ghost" label={t('visitAdvance')} disabled={visit.stage === 7} onPress={() => controller.stage(visit.stage + 1)}>{t('visitAdvance')}</Action>
      <Action size="compact" variant="ghost" label={t('visitReset')} onPress={() => controller.stage(5)}>{t('visitReset')}</Action>
    </View>}
    {status === 'error' && <Action size="compact" variant="ghost" label={t('visitRetry')} onPress={() => controller.open(session, state.scenario)}>{t('visitRetry')}</Action>}
    {session.permissions.estudios !== true && <View style={styles.restriction}><Label>{t('restrictedResults')}</Label></View>}
    <Label style={styles.small}>{t('translationReview')}</Label>
    <View style={styles.selector}>
      {['normal', 'denied', 'empty', 'error', 'loading'].map(scenario => <Action size="compact" variant="ghost" key={scenario} label={t(`visitScenario_${scenario}`)} selected={state.session === session && state.scenario === scenario} onPress={() => controller.open(session, scenario)}>{t(`visitScenario_${scenario}`)}</Action>)}
    </View>
    </View>
  </View>;
}
