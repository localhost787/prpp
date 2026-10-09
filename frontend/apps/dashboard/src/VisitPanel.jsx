import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useLanguage } from './Language.jsx';
import { visitPresentation } from './visit.mjs';
import StudiesPanel from './StudiesPanel.jsx';
import { palette } from './ui.mjs';
import { uiCopy } from './ui-copy.mjs';
import Disclosure from './ui/Disclosure.jsx';
import { cancelSpeech, speakVisit } from './a11y.mjs';
import WaitPanel from './wait/WaitPanel.jsx';
import { WAIT_FIXTURES, createWaitModel } from './wait/wait.mjs';
import NoticesPanel from './notices/NoticesPanel.jsx';
import { SYNTHETIC_NOTICE_FIXTURE, createNoticesModel } from './notices/notices.mjs';

export default function VisitPanel({ session, controller, Label, Action, styles, scale, wide = false }) {
  const { t, language } = useLanguage();
  const copy = (key, values) => uiCopy(language, key, values);
  const [noticesRead, setNoticesRead] = useState(false);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.open(session); return () => controller.close(); }, [controller, session]);
  useEffect(() => { setNoticesRead(false); return () => cancelSpeech(); }, [session]);
  const status = session.permissions.visita !== true ? 'restricted' : state.session === session ? state.status : 'loading';
  useEffect(() => { if (status !== 'ready') cancelSpeech(); }, [status]);
  const visit = status === 'ready' ? state.visit : null;
  const presentation = visit ? visitPresentation(visit, session.permissions, language) : null;
  const waitingFixture = visit?.stage === 3 ? WAIT_FIXTURES.afterTriage : visit?.stage === 5 ? WAIT_FIXTURES.afterSamples : null;
  const waitState = createWaitModel({ language, state: waitingFixture ? 'ready' : 'empty', ...(waitingFixture ?? {}) });
  const validNoticeContext = ((session.account === 'carmen' && session.role === 'self') || (session.account === 'lourdes' && session.role === 'delegate')) && session.patient?.id === 'carmen';
  const noticePermission = status !== 'restricted' && validNoticeContext;
  const notices = createNoticesModel({ language, permission: noticePermission, state: noticePermission ? 'ready' : 'empty', communications: noticePermission ? SYNTHETIC_NOTICE_FIXTURE : [] });
  const unreadCount = noticesRead ? 0 : notices.items.length;

  return <View testID="visit-panel" style={{ gap: 22, minWidth: 0 }}>
    <Label testID="section-heading" accessibilityRole="header" style={{ fontSize: 30 * scale, lineHeight: 38 * scale, fontWeight: '700', letterSpacing: -0.6 }}>{t('visit')}</Label>
    <View accessibilityLiveRegion="polite" style={{ gap: 20 }}>
      {visit ? <>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18 }}>
          <View testID="visit-summary" style={[styles.card, { backgroundColor: palette.blue, borderColor: palette.blue, flex: wide ? 1.35 : undefined, padding: wide ? 30 : 24, gap: 18 }]}>
            <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: '#FFFFFF20' }}>
              <Label style={{ color: palette.white, fontSize: 13 * scale, lineHeight: 19 * scale, fontWeight: '600' }}>{copy('stage', { stage: visit.stage })}</Label>
            </View>
            <Label testID="visit-current" accessibilityLabel={t('visitCurrent', { stage: visit.stage, name: presentation.stages[visit.stage - 1] })} style={{ color: palette.white, fontSize: 34 * scale, lineHeight: 43 * scale, fontWeight: '700', letterSpacing: -0.7 }}>{presentation.stages[visit.stage - 1]}</Label>
            <Label style={{ color: '#E8EFFF' }}>{presentation.description}</Label>
            <View style={{ gap: 8, paddingTop: 18, marginTop: 2, borderTopWidth: 1, borderColor: '#FFFFFF38' }}>
              <Label accessibilityRole="header" style={{ color: palette.white, fontWeight: '700' }}>{t('visitNext')}</Label>
              <Label style={{ color: palette.white }}>{presentation.next}</Label>
            </View>
          </View>
          <View testID="visit-details" style={[styles.card, { flex: wide ? 1 : undefined, gap: 21, padding: wide ? 26 : 22 }]}>
            <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 18 * scale, lineHeight: 26 * scale }}>{copy('visitData')}</Label>
            <View style={{ gap: 4 }}><Label style={styles.small}>{copy('location')}</Label><Label style={{ fontWeight: '700' }}>{copy('cubicle', { number: visit.cubicle })}</Label></View>
            <View style={{ gap: 4 }}><Label style={styles.small}>{copy('clinician')}</Label><Label style={{ fontWeight: '700' }}>{copy('doctor', { name: visit.clinician })}</Label></View>
            <Label style={{ color: palette.muted, fontSize: 13 * scale, lineHeight: 20 * scale }}>{t('visitStarted', { date: presentation.startedAt })}</Label>
            <Action size="compact" label={t('listen')} onPress={() => speakVisit({ visit, permissions: session.permissions })}>{t('listen')}</Action>
          </View>
        </View>
        <View style={[styles.card, { paddingVertical: 10 }]}>
          <Disclosure title={copy('stages')} {...{ Action, Label }}>
            <View style={{ gap: 6 }}>{presentation.stages.map((name, index) => {
              const current = index + 1 === visit.stage;
              return <View testID="visit-phase" key={index} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 12, padding: 10, backgroundColor: current ? palette.pale : palette.white }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: current ? palette.blue : palette.canvas, alignItems: 'center', justifyContent: 'center' }}><Label style={{ color: current ? palette.white : palette.muted, fontWeight: '700', fontSize: 14 }}>{index + 1}</Label></View>
                <Label style={{ flex: 1, fontWeight: current ? '700' : '400', color: current ? palette.blue : palette.muted }}>{name}{current ? ` · ${t('visitCurrentMarker')}` : ''}</Label>
              </View>;
            })}</View>
            <Label style={styles.small}>{copy('allStagesNote')}</Label>
            <Label style={styles.small}>{t('visitFixedSnapshot')}</Label>
          </Disclosure>
        </View>
        <WaitPanel language={language} textScale={scale} state={waitState} />
      </> : <View style={styles.card}>
        <Label>{t({ restricted: 'visitRestricted', error: 'visitError', empty: 'visitEmpty' }[status] ?? 'visitLoading')}</Label>
        {status === 'empty' && <Label style={styles.small}>{t('visitEmptyDisclaimer')}</Label>}
        {status === 'error' && <Action label={t('visitRetry')} onPress={() => controller.open(session, state.scenario)}>{t('visitRetry')}</Action>}
      </View>}
    </View>
    <NoticesPanel language={language} textScale={scale} state={notices} unreadCount={unreadCount} onOpen={() => setNoticesRead(true)} />
    {visit && <StudiesPanel session={session} {...{ Label, Action, styles, scale }} />}
    <Disclosure title={copy('demoTools')} {...{ Action, Label }}>
      <View testID="simulation-controls" style={styles.simulation}>
        <Label style={styles.small}>{t('visitSimulation')}</Label>
        {visit && <View style={styles.selector}>
          <Action size="compact" variant="ghost" label={t('visitPrevious')} disabled={visit.stage === 1} onPress={() => controller.stage(visit.stage - 1)}>{t('visitPrevious')}</Action>
          <Action size="compact" variant="ghost" label={t('visitAdvance')} disabled={visit.stage === 7} onPress={() => controller.stage(visit.stage + 1)}>{t('visitAdvance')}</Action>
          <Action size="compact" variant="ghost" label={t('visitReset')} onPress={() => controller.stage(5)}>{t('visitReset')}</Action>
        </View>}
        <Label style={styles.small}>{t('translationReview')}</Label>
        <View style={styles.selector}>
          {['normal', 'denied', 'empty', 'error', 'loading'].map(scenario => <Action size="compact" key={scenario} label={t(`visitScenario_${scenario}`)} selected={state.session === session && state.scenario === scenario} onPress={() => controller.open(session, scenario)}>{t(`visitScenario_${scenario}`)}</Action>)}
        </View>
      </View>
    </Disclosure>
  </View>;
}
