import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { accounts, accountNames, createPortalStore, roles, sections } from './src/context.mjs';

import { DEFAULT_LANGUAGE } from './src/i18n.mjs';
import { Language, useLanguage, accessibilityLanguageProps } from './src/Language.jsx';
import ResultsPanel from './src/ResultsPanel.jsx';
import { createReportScope } from './src/reports/scope.mjs';
import VisitPanel from './src/VisitPanel.jsx';
import CareSection from './src/care/CareSection.jsx';
import ServicesPanel from './src/services/ServicesPanel.jsx';
import { createVisitController } from './src/visit.mjs';

import { Action, Label, Scale } from './src/ui/Action.jsx';
import { palette, surfaceStyles } from './src/ui.mjs';

export default function App() {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = language;
  }, [language]);
  return <Language.Provider value={language}><Portal onLanguageChange={() => setLanguage(value => value === 'en' ? 'es' : 'en')} /></Language.Provider>;
}
function Portal({ onLanguageChange }) {
  const { t, language } = useLanguage();
  const [store] = useState(() => createPortalStore());
  const [reportScope] = useState(() => createReportScope(store));
  const [visitController] = useState(() => createVisitController());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [scale, setScale] = useState(1);
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const enterRef = useRef(null);
  const accountRef = useRef(null);
  const lastStatus = useRef(state.status);
  useEffect(() => {
    if (state.status === 'closed' && lastStatus.current !== 'closed') enterRef.current?.focus?.();
    if (state.status === 'choosing' || (state.status === 'ready' && lastStatus.current === 'loading')) accountRef.current?.focus?.();
    lastStatus.current = state.status;
  }, [state.status]);
  useEffect(() => () => store.close(), [store]);
  useEffect(() => { if (state.status === 'closed') visitController.close(true); }, [state.status, visitController]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const back = () => store.close();
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [store]);
  const chooseAccount = account => {
    if (Platform.OS === 'web' && state.status === 'closed') window.history.pushState(null, '', window.location.href);
    store.selectAccount(account);
  };
  const ready = state.status === 'ready';
  const entering = state.status === 'closed' || state.status === 'choosing';
  const details = state.section;
  const roleText = state.role === 'self' ? t('selfRole') : t('delegateRole');
  return <Scale.Provider value={scale}>
    <View style={styles.root}>
      <View testID="demo-notice" style={styles.notice}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Label style={{ fontWeight: '700', fontSize: 14 * scale, lineHeight: 20 * scale }}>{t('demoNotice')}</Label>
          <Label style={{ fontSize: 13 * scale, lineHeight: 18 * scale }}>{t('disconnected')}</Label>
        </View>
        <Action size="compact" variant="ghost" label={t('languageLabel')} onPress={() => { reportScope.invalidate(); onLanguageChange(); }}>{t('languageButton')}</Action>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View testID="dashboard-shell" style={[styles.shell, { flexDirection: desktop && !entering ? 'row' : 'column' }]}>
          {!entering && <View style={[styles.sidebar, desktop ? { width: 224, borderRightWidth: 1 } : { width: '100%', borderBottomWidth: 1 }]}>
            <View style={styles.brand}>
              <Image {...accessibilityLanguageProps(Platform.OS, language)} source={require('./assets/prpp-coqui.png')} accessibilityLabel={t('coqui')} style={{ width: 56, height: 48 }} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Label style={{ fontWeight: '800', fontSize: 26 * scale, lineHeight: 32 * scale }}>PRPP</Label>
                <Label style={{ fontSize: 14 * scale, lineHeight: 20 * scale }}>Puerto Rico Patient Portal</Label>
              </View>
            </View>

            <View accessibilityLabel={t('sections')} style={{ gap: 6, flexDirection: desktop ? 'column' : 'row', flexWrap: 'wrap' }}>
              {sections.map(section => <Action size="compact" variant="ghost" key={section} label={t('goTo', { section: t(section) })}
                selected={ready && state.section === section}
                disabled={!ready || (section === 'results' && state.session.permissions.estudios !== true)}
                onPress={() => store.navigate(section)} style={desktop ? { width: '100%' } : { flexGrow: 1, flexBasis: 112 * scale }}>
                {t(section)}
              </Action>)}
            </View>

          </View>}
          <View style={[styles.main, { padding: desktop ? 28 : 12 }, entering && { width: '100%', maxWidth: 720, alignSelf: 'center', justifyContent: 'center', paddingVertical: desktop ? 48 : 24 }]}>
            <View style={styles.topline}>
              <View style={{ flex: 1, minWidth: 180 }}>

                <Label accessibilityRole="header" style={{ fontSize: (desktop ? 30 : 24) * scale, lineHeight: (desktop ? 38 : 30) * scale, fontWeight: '700' }}>{t('tagline')}</Label>
              </View>
              <View style={styles.tools} accessibilityLabel={t('textSize')}>
                <Action size="compact" label={t('smaller')} disabled={scale <= 1} onPress={() => setScale(s => Math.max(1, s - 0.25))}>A−</Action>
                <Action size="compact" label={t('larger')} disabled={scale >= 1.5} onPress={() => setScale(s => Math.min(1.5, s + 0.25))}>A+</Action>
              </View>
            </View>
            {entering ? <View testID="account-chooser" style={[styles.card, { padding: desktop ? 32 : 18, gap: 20, borderTopWidth: 4, borderTopColor: palette.blue }]}>
              <View style={styles.brand}>
                <Image source={require('./assets/prpp-coqui.png')} accessibilityLabel={t('coqui')} style={{ width: 64, height: 56 }} resizeMode="contain" />
                <View style={{ flex: 1 }}><Label style={{ fontWeight: '800', fontSize: 28 * scale, lineHeight: 36 * scale, color: palette.blue }}>PRPP</Label><Label>Puerto Rico Patient Portal</Label></View>
              </View>
              <View style={{ gap: 8 }}><Label accessibilityRole="header" style={{ fontSize: 28 * scale, lineHeight: 36 * scale, fontWeight: '700' }}>{t(state.account ? 'chooseContext' : 'chooseAccount')}</Label>
              <Label style={styles.small}>{t(state.account ? 'contextIntro' : 'entryIntro')}</Label></View>
              {state.account ? <>
                <Label style={{ fontWeight: '700' }}>{t('accountOf')} {accountNames[state.account]}</Label>
                {roles[state.account].map((role, index) => <Action key={role} controlRef={index === 0 ? accountRef : undefined} style={{ width: '100%', justifyContent: 'flex-start' }} label={t('roleLabel', { role: t(role === 'self' ? 'myHealth' : 'delegatedCarmen') })} onPress={() => store.enter(state.account, role)}>{t(role === 'self' ? 'myHealth' : 'delegatedCarmen')}</Action>)}
                <Action variant="ghost" label={t('backAccounts')} onPress={store.close}>{t('backAccounts')}</Action>
              </> : accounts.map((account, index) => <Action key={account} controlRef={index === 0 ? enterRef : undefined} label={t('accountLabel', { name: accountNames[account] })} onPress={() => chooseAccount(account)} style={{ width: '100%', paddingVertical: 16, borderColor: palette.border }} content={<>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: palette.pale, alignItems: 'center', justifyContent: 'center' }}><Label style={{ fontWeight: '800', color: palette.blue }}>{accountNames[account].slice(0, 1)}</Label></View>
                <View style={{ flex: 1, gap: 3 }}><Label style={{ fontWeight: '700' }}>{accountNames[account]}</Label><Label style={styles.small}>{t(`account_${account}`)}</Label></View>
              </>} />)}
              <Label style={styles.small}>{t('localEntry')}</Label>
            </View> : <>
              <View testID="context-card" style={[styles.card, { padding: 14, gap: 8 }]}>
                <View style={styles.topline}>
                  <View style={{ flex: 1, minWidth: 150, gap: 3 }}>
                    <Label style={styles.small}>{t('accountOf')} <Label style={{ fontWeight: '700' }}>{accountNames[state.account]}</Label></Label>
                    {ready ? <><Label style={styles.eyebrow}>{t('informationOf')}</Label><Label testID="patient-name" style={{ fontWeight: '700', fontSize: 20 * scale, lineHeight: 28 * scale }}>{state.session.patient.name[0].text}</Label><Label style={styles.small}>{t('activeRole', { role: roleText })}</Label></> : <Label accessibilityLiveRegion="polite">{t(state.status === 'error' ? 'contextError' : 'contextLoading')}</Label>}
                  </View>
                  <View style={styles.tools}>
                    {roles[state.account].length > 1 && <Action size="compact" label={t('changeContext')} onPress={() => store.selectAccount(state.account)}>{t('changeContext')}</Action>}
                    <Action controlRef={accountRef} size="compact" label={t('changeAccount')} onPress={store.close}>{t('changeAccount')}</Action>
                    <Action size="compact" variant="ghost" label={t('close')} onPress={store.close}>{t('close')}</Action>
                  </View>
                </View>
              </View>
              <View style={styles.cardGrid}>
              {ready && state.section === 'visit' && <View testID="section-card" style={[styles.featureCard, { flex: 1, minWidth: 0 }]}><VisitPanel session={state.session} controller={visitController} {...{ Label, Action, styles, scale }} /></View>}
              {ready && state.section === 'care' && <CareSection key={`${state.account}:${state.role}:${state.session.patient.id}:${JSON.stringify(state.session.permissions)}`} session={state.session} store={store} textScale={scale} />}
              {ready && state.section === 'more' && <MoreSection key={`${state.account}:${state.role}`} language={language} scale={scale} />}
              {ready && !['results', 'visit', 'care', 'more'].includes(state.section) && <View testID="section-card" key={`${state.account}:${state.role}:${state.section}`} style={[styles.featureCard, { flex: 1, minWidth: 0 }]}>
                <Label style={styles.eyebrow}>{t(`${details}Eyebrow`)}</Label>
                <Label testID="section-heading" accessibilityRole="header" style={{ fontSize: 26 * scale, lineHeight: 34 * scale, fontWeight: '700' }}>{t(state.section)}</Label>
                <Label accessibilityRole="header" style={styles.cardHeading}>{t(`${details}Title`)}</Label>
                <Label>{t(`${details}Description`)}</Label>
                <View style={styles.pending}><Label style={{ fontWeight: '700', color: palette.blue }}>{t('pending')}</Label></View>
                <Label style={styles.small}>{t('notClinicalAbsence')}</Label>
                <Label style={styles.small}>{t(`${details}Detail`)}</Label>
                {state.session.permissions.estudios !== true && <View style={styles.restriction}>
                  <Label>{t('restrictedResults')}</Label>
                </View>}
              </View>}
              </View>
              {ready && state.section === 'results' && <ResultsPanel key={`${state.account}:${state.role}`} session={state.session} reportScope={reportScope} {...{ Label, Action, styles, scale }} wide={desktop && scale === 1} />}
              {ready && state.section !== 'results' && <View style={{ gap: 16 }}>
                <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{t('explorePortal')}</Label>
                <View style={[styles.cardGrid, { flexDirection: desktop ? 'row' : 'column' }]}>
                  {['results', 'care', 'family'].map(section => {
                    const restricted = section === 'results' && state.session.permissions.estudios !== true;
                    return <View testID="shortcut-card" key={section} style={[styles.card, { flex: 1, minWidth: 0 }]}>
                      <Label accessibilityRole="header" style={styles.cardHeading}>{t(section)}</Label>
                      <Label>{restricted ? t('restrictedShortcut') : section === 'results' ? t('resultsShortcut') : section === 'care' ? t('careShortcut') : t('pendingShortcut')}</Label>
                      <Action label={t('openSection', { section: t(section) })} disabled={restricted} onPress={() => store.navigate(section)} style={{ marginTop: 'auto' }}>{t('openSection', { section: t(section) })}</Action>
                    </View>;
                  })}
                </View>
              </View>}
            </>}
            <View style={styles.footer}>
              <Label style={styles.small}>PRPP{' · '}<Label style={styles.small}>{t('expoWeb')}</Label></Label>
              <Label style={styles.small}>{t('permissionWarning')}</Label>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  </Scale.Provider>;
}
function MoreSection({ language, scale }) {
  const { t } = useLanguage();
  const [showServices, setShowServices] = useState(false);
  return <View testID="section-card" style={[styles.featureCard, { flex: 1, minWidth: 0 }]}>
    <Label testID="section-heading" accessibilityRole="header" style={styles.cardHeading}>{t('more')}</Label>
    {showServices ? <>
      <Action label={t('backMore')} onPress={() => setShowServices(false)}>{t('backMore')}</Action>
      <ServicesPanel language={language} textScale={scale} />
    </> : <>
      <Label>{t('servicesIntro')}</Label>
      <Action label={t('openServices')} onPress={() => setShowServices(true)}>{t('openServices')}</Action>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas, minHeight: '100%' },
  notice: { position: Platform.OS === 'web' ? 'sticky' : 'relative', top: 0, zIndex: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: palette.notice, borderBottomWidth: 1, borderColor: palette.borderSoft, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  shell: { width: '100%', flex: 1, minWidth: 0 },
  sidebar: { padding: 12, backgroundColor: palette.white, borderColor: palette.borderSoft, gap: 12 },
  brand: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  eyebrow: { fontWeight: '700', color: palette.muted, letterSpacing: 0.6 },
  main: { flex: 1, minWidth: 0, gap: 16 },
  topline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '100%', flexShrink: 1 },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardGrid: { gap: 16, alignItems: 'stretch' },
  card: { ...surfaceStyles.card, padding: 16, gap: 12 },
  cardHeading: { fontWeight: '700' },
  identity: { borderTopWidth: 1, borderColor: palette.borderSoft, paddingTop: 12, gap: 3 },
  restriction: { padding: 12, borderRadius: 10, borderLeftWidth: 3, borderColor: palette.warning, backgroundColor: palette.notice, gap: 4 },
  featureCard: { ...surfaceStyles.feature, padding: 16, gap: 12 },
  simulation: { padding: 12, borderRadius: 10, backgroundColor: palette.canvas, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, gap: 12 },
  pending: { alignSelf: 'flex-start', backgroundColor: palette.pale, borderRadius: 8, padding: 8 },
  small: { color: palette.muted },
  footer: { paddingTop: 8, gap: 3 },
});
