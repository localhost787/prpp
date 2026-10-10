import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { accounts, accountNames, createDemoStore, roles, sections } from './src/context.mjs';

import { DEFAULT_LANGUAGE } from './src/i18n.mjs';
import { Language, useLanguage, accessibilityLanguageProps } from './src/Language.jsx';
import ResultsPanel from './src/ResultsPanel.jsx';
import { createReportScope } from './src/reports/scope.mjs';
import VisitPanel from './src/VisitPanel.jsx';
import CareSection from './src/care/CareSection.jsx';
import ServicesPanel from './src/services/ServicesPanel.jsx';
import FamilyPanel from './src/family/FamilyPanel.jsx';
import FamilySection from './src/family/FamilySection.jsx';
import { createVisitController } from './src/visit.mjs';

import { Action, Label, Scale } from './src/ui/Action.jsx';
import { palette, surfaceStyles } from './src/ui.mjs';
import { uiCopy } from './src/ui-copy.mjs';
import { ClipboardList, FileText, Grid2x2, HeartPulse, MapPin, UsersRound } from 'lucide-react-native';

const SECTION_ICONS = Object.freeze({
  visit: ClipboardList,
  results: FileText,
  care: HeartPulse,
  family: UsersRound,
  more: Grid2x2,
});

const DEMO_VIEW_NAMES = Object.freeze({ carmen: 'Carmen', lourdes: 'Lourdes' });

function Brand({ scale = 1, inverse = false }) {
  const { t } = useLanguage();
  return <View style={styles.brand}>
    <View style={[styles.logoSurface, inverse && { padding: 8 }]}>
      <Image source={require('./assets/prpp-coqui.png')} accessibilityLabel={t('coqui')} style={{ width: 45, height: 43 }} resizeMode="contain" />
    </View>
    <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
      <Label style={{ color: inverse ? palette.white : palette.ink, fontWeight: '800', fontSize: 27 * scale, lineHeight: 31 * scale, letterSpacing: -0.7 }}>PRPP</Label>
      <Label style={{ color: inverse ? '#E3EBFF' : palette.muted, fontSize: 12 * scale, lineHeight: 17 * scale }}>Puerto Rico Patient Portal</Label>
    </View>
  </View>;
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
  const copy = (key, values) => uiCopy(language, key, values);
  const [store] = useState(() => createDemoStore());
  const [reportScope] = useState(() => createReportScope(store));
  const [visitController] = useState(() => createVisitController());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [scale, setScale] = useState(1);
  const [demoControls, setDemoControls] = useState(false);
  const demoControlsId = useId();
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;

  const scrollRef = useRef(null);


  useEffect(() => () => store.close(), [store]);

  const navigate = section => {
    store.navigate(section);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  };
  const ready = state.status === 'ready';
  const entering = false;
  const ownerFamily = ready && state.section === 'family' && state.account === 'carmen' && state.role === 'self' && state.session.patient.id === 'carmen';
  const delegateFamily = ready && state.section === 'family' && state.account === 'lourdes' && state.role === 'delegate' && state.session.patient.id === 'carmen';
  const roleText = state.role === 'self' ? t('selfRole') : t('delegateRole');

  const navigation = <View accessibilityRole="navigation" accessibilityLabel={t('sections')} style={{ flexDirection: desktop ? 'column' : 'row', flexWrap: 'wrap', gap: desktop ? 8 : 4 }}>
    {sections.map(section => {
      const selected = ready && state.section === section;
      const disabled = !ready || (section === 'results' && state.session.permissions.estudios !== true);
      const color = disabled ? palette.disabledText : selected ? (desktop ? palette.white : palette.blue) : palette.muted;
      const SectionIcon = SECTION_ICONS[section];
      return <Action size="compact" variant="ghost" key={section} label={t('goTo', { section: t(section) })}
        selected={selected} showMarker={false} disabled={disabled} onPress={() => navigate(section)}
        style={desktop ? [styles.navAction, selected && styles.navActionSelected] : { flex: 1, flexBasis: width < 380 || scale > 1 ? '28%' : '17%', paddingHorizontal: 3, paddingVertical: 10 }}
        content={<View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 12 : 5, minWidth: 0, flex: 1 }}>
          <View testID={`nav-icon-${section}`} accessible={false}><SectionIcon size={20} color={color} strokeWidth={1.8} /></View>
          <Label style={{ color, fontSize: (desktop ? 16 : 12) * scale, lineHeight: (desktop ? 22 : 17) * scale, fontWeight: selected ? '700' : '600', textAlign: desktop ? 'left' : 'center' }}>{t(section)}</Label>
        </View>} />;
    })}
  </View>;

  return <Scale.Provider value={scale}>
    <View style={styles.root}>
      <View testID="demo-notice" style={styles.notice}>
        <View style={styles.noticeDot} />
        <Label style={{ color: palette.muted, fontSize: 12 * scale, lineHeight: 18 * scale }}>{copy('demo')}</Label>
      </View>
      <View testID="dashboard-shell" style={[styles.shell, { flexDirection: desktop && !entering ? 'row' : 'column' }]}>
        {!entering && desktop && <View testID="sidebar-rail" style={styles.sidebarRail}><View style={styles.sidebar}>
          <Brand scale={scale} />
          <Label style={[styles.eyebrow, { marginTop: 28 }]}>{copy('navigation')}</Label>
          {navigation}
          <View style={styles.sidebarFooter}><View style={styles.redRule} /><Label testID="portal-tagline" {...accessibilityLanguageProps(Platform.OS, language)} style={styles.small}>{copy('portalTagline')}</Label></View>
        </View></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.topbar, { paddingHorizontal: desktop ? 32 : 16 }]}>
            {!desktop || entering ? <View style={{ maxWidth: 270, flexGrow: 1 }}><Brand scale={Math.min(scale, 1.15)} /></View> : <Label style={styles.eyebrow}>{copy('patientPortal')}</Label>}
            <View style={styles.tools}>
              {desktop && <Action size="compact" variant="ghost" label={copy('demoControls')} expanded={demoControls} controls={demoControlsId} onPress={() => setDemoControls(value => !value)}>{copy('demoControls')}</Action>}
              <Action size="compact" variant="ghost" label={t('languageLabel')} onPress={() => { reportScope.invalidate(); onLanguageChange(); }}>{t('languageButton')}</Action>
              <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={t('textSize')}>
                <Action size="compact" variant="ghost" label={t('smaller')} disabled={scale <= 1} onPress={() => setScale(value => Math.max(1, value - 0.25))}>A−</Action>
                <Action size="compact" variant="ghost" label={t('larger')} disabled={scale >= 1.5} onPress={() => setScale(value => Math.min(1.5, value + 0.25))}>A+</Action>
              </View>
            </View>
          </View>
          {desktop && demoControls && <View testID="demo-controls" nativeID={demoControlsId} style={{ padding: 16, backgroundColor: palette.pale, gap: 12, borderBottomWidth: 1, borderColor: palette.borderSoft }}>
            <Label style={styles.small}>{copy('demoControlsBody')}</Label>
            <View style={styles.tools}>
              {accounts.map(account => <Action key={account} size="compact" label={copy('demoView', { name: DEMO_VIEW_NAMES[account] })} selected={state.account === account} showMarker={false} onPress={() => { visitController.close(true); store.enter(account, roles[account][0]); scrollRef.current?.scrollTo?.({ y: 0, animated: false }); }}>{copy('demoView', { name: DEMO_VIEW_NAMES[account] })}</Action>)}
            </View>
          </View>}
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={[styles.main, { padding: desktop ? 32 : 16, gap: desktop ? 24 : 16, maxWidth: entering ? 1160 : 1360 }]}>
              {<>
                <View testID="context-card" style={[styles.context, !desktop && { padding: 16, gap: 10 }]}>
                  <View style={styles.patientIdentity}>
                    {desktop && <View style={styles.patientAvatar}><Label style={{ color: palette.blue, fontWeight: '700' }}>{ready ? state.session.patient.name[0].text.slice(0, 1) : ''}</Label></View>}
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Label style={styles.micro}>{copy('patient')}</Label>
                      {ready ? <Label testID="patient-name" style={{ fontWeight: '700', fontSize: 20 * scale, lineHeight: 27 * scale }}>{state.session.patient.name[0].text}</Label> : <Label accessibilityLiveRegion="polite">{t(state.status === 'error' ? 'contextError' : 'contextLoading')}</Label>}
                    </View>
                  </View>
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: '100%', gap: 4 }}>
                    <Label style={styles.small}>{copy('account')}{': '}<Label style={{ fontWeight: '700', fontSize: 14 * scale }}>{accountNames[state.account]}{state.account === 'lourdes' ? ` · ${copy('daughter')}` : ''}</Label></Label>
                    {ready && <Label style={styles.small}>{copy('role')}{': '}{roleText}</Label>}
                  </View>

                </View>
                {!desktop && <View style={styles.mobileNav}>{navigation}</View>}
                {ready && state.section === 'visit' && <View testID="section-card" style={{ minWidth: 0 }}><VisitPanel session={state.session} controller={visitController} {...{ Label, Action, styles, scale }} wide={desktop && scale === 1} /></View>}
                {ready && state.section === 'care' && <CareSection key={`${state.account}:${state.role}:${state.session.patient.id}:${JSON.stringify(state.session.permissions)}`} session={state.session} store={store} textScale={scale} />}
                {ownerFamily && <View testID="section-card" style={{ gap: 20 }}>
                  <Label testID="section-heading" accessibilityRole="header" style={styles.sectionHeading}>{t('family')}</Label>
                  <View style={styles.familyNotice}><Label style={{ color: palette.muted }}>{copy('familyNotice')}</Label></View>
                  <FamilySection key={`${state.account}:${state.role}:${state.session.patient.id}`} initialCaregivers={store.getFamilyAccess()} save={payload => store.saveFamilyPermissions(payload, state.session)} language={language} textScale={scale} patient={{ id: state.session.patient.id, name: state.session.patient.name?.[0]?.text }} />
                </View>}
                {delegateFamily && <View testID="section-card" style={{ gap: 20 }}>
                  <Label testID="section-heading" accessibilityRole="header" style={styles.sectionHeading}>{t('family')}</Label>
                  <FamilyPanel language={language} textScale={scale} viewer={{ kind: 'delegate', caregiverId: state.account }} patient={{ id: state.session.patient.id, name: state.session.patient.name?.[0]?.text }} permissions={store.getFamilyAccess()} state={{ status: 'ready' }} />
                </View>}
                {ready && state.section === 'more' && <MoreSection key={`${state.account}:${state.role}`} language={language} scale={scale} />}
                {ready && !ownerFamily && !delegateFamily && !['results', 'visit', 'care', 'more'].includes(state.section) && <View testID="section-card" style={styles.card}>
                  <Label testID="section-heading" accessibilityRole="header" style={styles.sectionHeading}>{t(state.section)}</Label>
                  <Label accessibilityRole="header" style={styles.cardHeading}>{t(`${state.section}Title`)}</Label>
                  <Label>{t(`${state.section}Description`)}</Label>
                  <Label style={styles.small}>{t(`${state.section}Detail`)}</Label>
                  {state.session.permissions.estudios !== true && <View style={styles.restriction}><Label>{t('restrictedResults')}</Label></View>}
                </View>}
                {ready && state.section === 'results' && <ResultsPanel key={`${state.account}:${state.role}`} session={state.session} reportScope={reportScope} {...{ Label, Action, styles, scale }} wide={desktop && scale === 1} />}
                {ready && state.section === 'visit' && <ShortcutCards {...{ desktop, scale, state, navigate, t, copy }} />}
              </>}
              {!desktop && <View style={{ gap: 12 }}>
                <Action size="compact" variant="ghost" label={copy('demoControls')} expanded={demoControls} controls={demoControlsId} onPress={() => setDemoControls(value => !value)}>{copy('demoControls')}</Action>
                {demoControls && <View testID="demo-controls" nativeID={demoControlsId} style={{ padding: 16, backgroundColor: palette.pale, borderRadius: 12, gap: 12 }}>
                  <Label style={styles.small}>{copy('demoControlsBody')}</Label>
                  <View style={styles.tools}>{accounts.map(account => <Action key={account} size="compact" label={copy('demoView', { name: DEMO_VIEW_NAMES[account] })} selected={state.account === account} showMarker={false} onPress={() => { visitController.close(true); store.enter(account, roles[account][0]); scrollRef.current?.scrollTo?.({ y: 0, animated: false }); }}>{copy('demoView', { name: DEMO_VIEW_NAMES[account] })}</Action>)}</View>
                </View>}
              </View>}
              <DemoDisclosure title={copy('demoDetails')} body={copy('demoBody')} warning={t('permissionWarning')} />
              {!desktop && <Label testID="portal-tagline" {...accessibilityLanguageProps(Platform.OS, language)} style={styles.small}>{copy('portalTagline')}</Label>}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  </Scale.Provider>;
}

function DemoDisclosure({ title, body, warning }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <View style={styles.disclosure}>
    <Action variant="ghost" size="compact" label={title} expanded={open} controls={id} onPress={() => setOpen(value => !value)} style={{ paddingHorizontal: 0 }}>{title}</Action>
    {open && <View nativeID={id} style={{ gap: 5 }}><Label style={styles.small}>{body}</Label><Label style={styles.small}>{warning}</Label></View>}
  </View>;
}

function ShortcutCards({ desktop, state, navigate, t, copy }) {
  return <View style={{ gap: 14 }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 19, lineHeight: 27 }}>{copy('shortcuts')}</Label>
    <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 14 }}>
      {['results', 'care', 'family'].map(section => {
        const restricted = section === 'results' && state.session.permissions.estudios !== true;
        const SectionIcon = SECTION_ICONS[section];
        return <View testID="shortcut-card" key={section} style={[styles.card, { flex: 1 }]}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><SectionIcon size={20} color={palette.blue} strokeWidth={1.8} /><Label style={{ fontWeight: '700' }}>{t(section)}</Label></View>
          <Label style={styles.small}>{restricted ? t('restrictedShortcut') : copy(`${section}Shortcut`)}</Label>
          <Action variant="ghost" size="compact" label={t('openSection', { section: t(section) })} disabled={restricted} onPress={() => navigate(section)} style={{ marginTop: 'auto', paddingHorizontal: 0 }}>{t('openSection', { section: t(section) })}</Action>
        </View>;
      })}
    </View>
  </View>;
}

function MoreSection({ language, scale }) {
  const { t } = useLanguage();
  const [showServices, setShowServices] = useState(false);
  return <View testID="section-card" style={{ gap: 20 }}>
    {!showServices && <Label testID="section-heading" accessibilityRole="header" style={{ fontSize: 28 * scale, lineHeight: 36 * scale, fontWeight: '700' }}>{uiCopy(language, 'servicesHelp')}</Label>}
    {showServices ? <><Action label={t('backMore')} onPress={() => setShowServices(false)}>{t('backMore')}</Action><ServicesPanel language={language} textScale={scale} /></> : <View style={[styles.card, { gap: 16 }]}><MapPin size={26} color={palette.blue} strokeWidth={1.8} /><Label>{t('servicesIntro')}</Label><Action primary label={t('openServices')} onPress={() => setShowServices(true)}>{t('openServices')}</Action></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas, minHeight: '100%' },
  notice: { paddingVertical: 6, paddingHorizontal: 16, backgroundColor: palette.white, borderBottomWidth: 1, borderColor: palette.borderSoft, flexDirection: 'row', gap: 8, justifyContent: 'center' },
  noticeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.brandRed, marginTop: 6 },
  shell: { flex: 1, minWidth: 0, width: '100%' },
  sidebarRail: { width: 244, flexShrink: 0, alignSelf: 'stretch', borderRightWidth: 1, borderColor: palette.borderSoft, backgroundColor: palette.white },
  sidebar: { padding: 22, gap: 16, ...Platform.select({ web: { position: 'sticky', top: 0, minHeight: '100vh', maxHeight: '100vh', overflowY: 'auto' }, default: { flex: 1 } }) },
  sidebarFooter: { marginTop: 'auto', paddingTop: 40, paddingBottom: 64, gap: 12 },
  redRule: { width: 26, height: 3, borderRadius: 3, backgroundColor: palette.brandRed },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  logoSurface: { borderRadius: 16, backgroundColor: palette.white },
  topbar: { paddingVertical: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, backgroundColor: palette.white, borderBottomWidth: 1, borderColor: palette.borderSoft },
  main: { width: '100%', alignSelf: 'center', gap: 24, minWidth: 0, paddingBottom: 36 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, maxWidth: '100%' },
  eyebrow: { color: palette.muted, fontSize: 11, lineHeight: 18, fontWeight: '700', letterSpacing: 1.2 },
  entry: { ...surfaceStyles.card, marginTop: 12, overflow: 'hidden' },
  welcome: { backgroundColor: palette.blue, justifyContent: 'center', gap: 24 },
  pinkRule: { width: 32, height: 4, borderRadius: 4, backgroundColor: '#FF7489' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.pale, alignItems: 'center', justifyContent: 'center' },
  accountAction: { width: '100%', padding: 17, borderColor: palette.borderSoft, borderRadius: 16 },
  context: { ...surfaceStyles.card, padding: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 },
  patientIdentity: { flexDirection: 'row', gap: 14, alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 360, minWidth: 0 },
  patientAvatar: { width: 48, height: 48, borderRadius: 15, backgroundColor: palette.pale, alignItems: 'center', justifyContent: 'center' },
  mobileNav: { ...surfaceStyles.card, padding: 6, borderRadius: 16 },
  navAction: { width: '100%', justifyContent: 'flex-start', paddingHorizontal: 16, minHeight: 54 },
  navActionSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  card: { ...surfaceStyles.card, padding: 22, gap: 12, minWidth: 0 },
  cardHeading: { fontWeight: '700' },
  featureCard: { ...surfaceStyles.feature, padding: 22, gap: 16, minWidth: 0 },
  sectionHeading: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  topline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  micro: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  restriction: { backgroundColor: palette.white, borderWidth: 1, borderColor: palette.borderSoft, padding: 14, borderRadius: 12, gap: 6 },
  simulation: { padding: 16, backgroundColor: palette.canvas, borderRadius: 12, gap: 12 },
  familyNotice: { backgroundColor: palette.pale, padding: 16, borderRadius: 14 },
  disclosure: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: palette.borderSoft, gap: 8 },
});
