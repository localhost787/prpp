import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { accounts, accountNames, createPortalStore, roles, sections } from './src/context.mjs';

import { DEFAULT_LANGUAGE } from './src/i18n.mjs';
import { Language, useLanguage, accessibilityLanguageProps } from './src/Language.jsx';
import ResultsPanel from './src/ResultsPanel.jsx';
import { createReportScope } from './src/reports/scope.mjs';
import VisitPanel from './src/VisitPanel.jsx';
import { createVisitController } from './src/visit.mjs';

const Scale = createContext(1);
const palette = { ink: '#172b4d', muted: '#425570', blue: '#063b9e', canvas: '#f2f5fa', white: '#ffffff', border: '#52647a', pale: '#eaf0fb', notice: '#fff4ce' };
function Label({ children, style, ...props }) {
  const scale = useContext(Scale);
  const { language } = useLanguage();
  return <Text {...accessibilityLanguageProps(Platform.OS, language)} {...props} style={[{ color: palette.ink, fontSize: 16 * scale, lineHeight: 24 * scale, flexShrink: 1 }, style]}>{children}</Text>;
}
function Action({ children, label, onPress, selected = false, disabled = false, primary = false, controlRef, style }) {
  const { t, language } = useLanguage();
  const [focused, setFocused] = useState(false);
  return <Pressable {...accessibilityLanguageProps(Platform.OS, language)} ref={controlRef} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, { backgroundColor: selected || primary ? palette.blue : pressed ? palette.pale : palette.white,
      borderColor: focused ? palette.ink : palette.border, borderWidth: 2,
      borderStyle: disabled ? 'dashed' : 'solid' }, style]}>
    <Label style={{ color: selected || primary ? palette.white : palette.ink, fontWeight: selected || primary ? '700' : '500' }}>
      {children}{selected ? t('active') : ''}
    </Label>
  </Pressable>;
}

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
    if (state.status === 'ready' && lastStatus.current === 'loading') accountRef.current?.focus?.();
    lastStatus.current = state.status;
  }, [state.status]);
  useEffect(() => () => store.close(), [store]);
  useEffect(() => { if (state.status === 'closed') visitController.close(true); }, [state.status, visitController]);
  const ready = state.status === 'ready';
  const details = state.section;
  const roleText = state.role === 'self' ? t('selfRole') : t('delegateRole');
  return <Scale.Provider value={scale}>
    <View style={styles.root}>
      <View style={styles.notice}>
        <Action label={t('languageLabel')} onPress={() => { reportScope.invalidate(); onLanguageChange(); }} style={{ alignSelf: 'flex-start' }}>{t('languageButton')}</Action>
        <Label style={{ fontWeight: '700' }}>{t('provisional')}</Label>
        <Label>{t('disconnected')}</Label>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View testID="dashboard-shell" style={[styles.shell, { flexDirection: desktop ? 'row' : 'column' }]}>
          <View style={[styles.sidebar, desktop ? { width: 224, borderRightWidth: 1 } : { width: '100%', borderBottomWidth: 1 }]}>
            <View style={styles.brand}>
              <Image {...accessibilityLanguageProps(Platform.OS, language)} source={require('./assets/prpp-coqui.png')} accessibilityLabel={t('coqui')} style={{ width: 56, height: 48 }} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Label style={{ fontWeight: '800', fontSize: 26 * scale, lineHeight: 32 * scale }}>PRPP</Label>
                <Label style={{ fontSize: 14 * scale, lineHeight: 20 * scale }}>Puerto Rico Patient Portal</Label>
              </View>
            </View>
            <Label style={styles.eyebrow}>{t('yourPortal')}</Label>
            <View accessibilityLabel={t('sections')} style={{ gap: 8, flexDirection: desktop ? 'column' : 'row', flexWrap: 'wrap' }}>
              {sections.map(section => <Action key={section} label={t('goTo', { section: t(section) })}
                selected={ready && state.section === section}
                disabled={!ready || (section === 'results' && state.session.permissions.estudios !== true)}
                onPress={() => store.navigate(section)} style={desktop ? { width: '100%' } : { flexGrow: 1, flexBasis: 130 * scale }}>
                {t(section)}
              </Action>)}
            </View>
            <View style={[styles.sidebarFoot, desktop && { marginTop: 'auto' }]}>
              <Label style={{ fontWeight: '700' }}>{t('deviceOnly')}</Label>
              <Label style={styles.small}>{t('expoWeb')}</Label>
              <Label style={styles.small}>{t('noClinical')}</Label>
            </View>
          </View>
          <View style={[styles.main, { padding: desktop ? 28 : 16 }]}>
            <View style={styles.topline}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Label style={styles.eyebrow}>{t('dashboard')}</Label>
                <Label accessibilityRole="header" style={{ fontSize: 30 * scale, lineHeight: 38 * scale, fontWeight: '700' }}>{t('tagline')}</Label>
              </View>
              <View style={styles.tools} accessibilityLabel={t('textSize')}>
                <Action label={t('smaller')} disabled={scale <= 1} onPress={() => setScale(s => Math.max(1, s - 0.25))}>A−</Action>
                <Action label={t('larger')} disabled={scale >= 1.5} onPress={() => setScale(s => Math.min(1.5, s + 0.25))}>A+</Action>
              </View>
            </View>
            {state.status === 'closed' ? <View style={styles.card}>
              <Label accessibilityRole="header" style={styles.cardHeading}>{t('exploreExample')}</Label>
              <Label>{t('entryDescription')}</Label>
              <Action controlRef={enterRef} label={t('enter')} primary onPress={store.enter}>{t('enter')}</Action>
              <Label style={styles.small}>{t('closeHint')}</Label>
            </View> : <>
              <View style={[styles.cardGrid, { flexDirection: desktop ? 'row' : 'column' }]}>
              <View testID="context-card" style={[styles.card, { flex: 1, minWidth: 0 }]}>
                <View style={[styles.topline, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Label style={styles.eyebrow}>{t('exampleContext')}</Label>
                    <Label>{t('accountOf')}{' '}<Label style={{ fontWeight: '700' }}>{accountNames[state.account]}</Label></Label>
                  </View>
                  <Action label={t('close')} onPress={store.close}>{t('close')}</Action>
                </View>
                <View style={styles.selector} accessibilityLabel={t('accountOf')}>
                  {accounts.map((account, index) => <Action key={account} controlRef={index === 0 ? accountRef : undefined}
                    label={t('accountLabel', { name: accountNames[account] })} selected={state.account === account}
                    onPress={() => store.selectAccount(account)}>{accountNames[account]}</Action>)}
                </View>
                <Label style={{ fontWeight: '700' }}>{t('role')}</Label>
                <View style={styles.selector} accessibilityLabel={t('role')}>
                  {roles[state.account].map(role => <Action key={role} label={t('roleLabel', { role: role === 'self' ? t('myHealth') : t('delegatedCarmen') })}
                    selected={state.role === role} onPress={() => store.selectRole(role)}>{role === 'self' ? t('myHealth') : t('delegatedCarmen')}</Action>)}
                </View>
                <View accessibilityLiveRegion="polite" style={styles.identity}>
                  {ready ? <>
                    <Label style={styles.eyebrow}>{t('informationOf')}</Label>
                    <Label testID="patient-name" style={{ fontWeight: '700', fontSize: 24 * scale, lineHeight: 32 * scale }}>{state.session.patient.name[0].text}</Label>
                    <Label>{t('activeRole', { role: roleText })}</Label>
                    <Label style={styles.small}>{t('syntheticReference', { id: state.session.patient.id })}</Label>
                  </> : <Label>{state.status === 'error' ? t('contextError') : t('contextLoading')}</Label>}
                </View>
              </View>
              {ready && state.section === 'visit' && <View testID="section-card" style={[styles.featureCard, { flex: 1, minWidth: 0 }]}><VisitPanel session={state.session} controller={visitController} {...{ Label, Action, styles, scale }} /></View>}
              {ready && !['results', 'visit'].includes(state.section) && <View testID="section-card" key={`${state.account}:${state.role}:${state.section}`} style={[styles.featureCard, { flex: 1, minWidth: 0 }]}>
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
                      <Label>{restricted ? t('restrictedShortcut') : section === 'results' ? t('resultsShortcut') : t('pendingShortcut')}</Label>
                      <Action label={t('openSection', { section: t(section) })} disabled={restricted} onPress={() => store.navigate(section)} style={{ marginTop: 'auto' }}>{t('openSection', { section: t(section) })}</Action>
                    </View>;
                  })}
                </View>
              </View>}
            </>}
            <View style={styles.footer}>
              <Label style={styles.small}>{t('footer')}</Label>
              <Label style={styles.small}>{t('permissionWarning')}</Label>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  </Scale.Provider>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas, minHeight: '100%' },
  notice: { position: Platform.OS === 'web' ? 'sticky' : 'relative', top: 0, zIndex: 10, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: palette.notice, borderBottomWidth: 1, borderColor: palette.border, gap: 2 },
  shell: { width: '100%', flex: 1, minWidth: 0 },
  sidebar: { padding: 20, backgroundColor: palette.white, borderColor: palette.border, gap: 20 },
  brand: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  eyebrow: { fontWeight: '700', color: palette.muted, letterSpacing: 1 },
  sidebarFoot: { gap: 3, paddingTop: 28 },
  main: { flex: 1, minWidth: 0, gap: 24 },
  topline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 48, minWidth: 48, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', flexShrink: 1 },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardGrid: { gap: 20, alignItems: 'stretch' },
  card: { padding: 20, borderRadius: 14, borderWidth: 1, borderColor: '#dce4ef', backgroundColor: palette.white, gap: 16, boxShadow: '0 3px 12px #172b4d0d' },
  cardHeading: { fontWeight: '700' },
  identity: { borderTopWidth: 1, borderColor: palette.border, paddingTop: 16, gap: 3 },
  restriction: { padding: 16, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.notice },
  featureCard: { padding: 24, borderRadius: 14, borderWidth: 1, borderColor: '#dce4ef', borderTopColor: palette.blue, borderTopWidth: 4, backgroundColor: palette.white, gap: 16, boxShadow: '0 3px 12px #172b4d0d' },
  pending: { alignSelf: 'flex-start', backgroundColor: palette.pale, borderRadius: 8, padding: 10 },
  small: { color: palette.muted },
  footer: { paddingTop: 8, gap: 3 },
});
