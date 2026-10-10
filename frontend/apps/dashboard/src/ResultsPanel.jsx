import React, { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { FileText, FlaskConical, ScanLine } from 'lucide-react-native';
import { createResultsController, filterResults, interpretationLabel, interpretationKey, statusLabel, statusKey, resultPresentation } from './results.mjs';
import { useLanguage, accessibilityLanguageProps } from './Language.jsx';
import { listReports, reportCopy } from './reports/index.mjs';
import { palette } from './ui.mjs';
import { uiCopy } from './ui-copy.mjs';
import Disclosure from './ui/Disclosure.jsx';

function ResultCard({ item, expanded, controller, Label, Action, styles, scale }) {
  const { t, language } = useLanguage();
  const presentation = resultPresentation(item, language);
  const opener = useRef(null), closer = useRef(null), wasOpen = useRef(false);
  useEffect(() => {
    if (expanded) closer.current?.focus?.();
    else if (wasOpen.current) opener.current?.focus?.();
    wasOpen.current = expanded;
  }, [expanded]);
  const interpretation = interpretationLabel(item, language);
  const imaging = item.valueString !== undefined && !item.valueQuantity;
  return <View testID="result-card" style={{ borderTopWidth: 1, borderColor: palette.borderSoft, paddingVertical: 20, gap: 12, minWidth: 0 }}>
    <View style={styles.topline}>
      <Label accessibilityRole="header" {...(Platform.OS === 'web' ? { 'aria-level': 3 } : {})} style={{ fontSize: 20 * scale, lineHeight: 28 * scale, fontWeight: '700' }}>{presentation.title}</Label>
      <Label style={{ color: statusKey(item) === 'preliminary' ? palette.warning : palette.muted, fontWeight: '600' }}>{statusLabel(item, language)}</Label>
    </View>
    <Label style={{ fontSize: (item.valueQuantity ? 30 : 21) * scale, lineHeight: (item.valueQuantity ? 44 : 30) * scale, fontWeight: '700' }}>{item.valueQuantity ? `${presentation.value} ${presentation.unit}` : presentation.value}</Label>
    {(!imaging || interpretationKey(item) !== 'noInterpretation') && <Label style={{ fontWeight: '700', color: interpretationKey(item) === 'high' ? palette.warning : interpretationKey(item) === 'normal' ? palette.success : palette.muted }}>{interpretation}</Label>}
    {!imaging && <Label style={{ color: palette.muted }}>{t('referenceRange', { range: item.referenceRange?.[0]?.text ?? t('unavailable') })}</Label>}
    {!expanded ? <Action controlRef={opener} label={t('viewDetailLabel', { name: presentation.title })} onPress={() => controller.detail(item.id)}>{t('viewDetail')}</Action> : <View testID="result-detail" style={{ gap: 14, padding: 16, backgroundColor: palette.canvas, borderRadius: 12 }}>
      <Action variant="ghost" controlRef={closer} label={t('closeDetailLabel', { name: presentation.title })} onPress={() => controller.detail(null)}>{t('closeDetail')}</Action>
      {statusKey(item) === 'preliminary' && <View style={styles.restriction}><Label>{t('preliminaryExplanation')}</Label></View>}
      <Label>{presentation.note}</Label>
      <Label>{t('askTeam')}</Label>
      <Label style={{ color: palette.muted }}>{t('study', { name: presentation.report })}</Label>
      <Label style={{ color: palette.muted }}>{t('resultDate')}</Label>
    </View>}
  </View>;
}

function ReportGroup({ report, items, expanded, toggle, download, state, controller, Label, Action, styles, scale, wide }) {
  const { t, language } = useLanguage();
  const copy = (key, values) => uiCopy(language, key, values);
  const opener = useRef(null), closer = useRef(null), wasOpen = useRef(false);
  const id = useId();
  useEffect(() => {
    if (expanded) closer.current?.focus?.();
    else if (wasOpen.current) opener.current?.focus?.();
    wasOpen.current = expanded;
  }, [expanded]);
  const Icon = report.id === 'b' ? ScanLine : FlaskConical;
  const states = [...new Set(report.items.map(item => item.statusLabel))].join(' · ');
  const preliminary = report.items.some(item => item.status === 'preliminary');
  const availableWithoutStatus = report.items.length > 0 && report.items.every(item => item.status === 'unknown') && report.items.some(item => item.value !== null && item.value !== undefined && item.value !== '');
  return <View testID="report-group" style={[styles.featureCard, { padding: wide ? 24 : 16, gap: 0 }]}>
    <View testID={`report-${report.id}`} style={{ gap: wide ? 18 : 12 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
        {wide && <View accessible={false} aria-hidden style={{ backgroundColor: palette.pale, padding: 12, borderRadius: 14 }}><Icon size={24} color={palette.blue} /></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Label accessibilityRole="header" {...(Platform.OS === 'web' ? { 'aria-level': 2 } : {})} style={{ fontWeight: '700', fontSize: (wide ? 22 : 20) * scale, lineHeight: 28 * scale }}>{report.title}</Label>
          <Label style={{ color: palette.muted }}>{report.institution}</Label>
          <View style={{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: preliminary ? '#FFF4CE' : palette.canvas, maxWidth: '100%' }}>
            <Label style={{ color: preliminary ? palette.warning : palette.muted, fontWeight: '600', fontSize: 14 * scale, lineHeight: 21 * scale }}>{availableWithoutStatus ? copy('resultsAvailable') : states}</Label>
          </View>
          {availableWithoutStatus && <Label style={{ color: palette.muted, fontSize: 14 * scale, lineHeight: 21 * scale }}>{t('unknown')}</Label>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {expanded ? <Action controlRef={closer} expanded controls={id} label={copy('closeReportLabel', { name: report.title })} onPress={toggle}>{copy('closeReport')}</Action> : <Action primary controlRef={opener} expanded={false} controls={id} label={copy('viewReportLabel', { name: report.title })} onPress={toggle}>{copy('viewReport')}</Action>}
      </View>
      {report.story && <Label style={{ color: palette.muted, fontSize: 14 * scale, lineHeight: 21 * scale }}>{report.story}</Label>}
      {expanded && <View nativeID={id} style={{ gap: 12 }}>
        <Label style={{ color: palette.muted }}>{t('resultDate')}</Label>
        <View>{items.map(item => <ResultCard key={item.id} {...{ item, controller, Label, Action, styles, scale }} expanded={state.detail === item.id} />)}</View>
        <View style={{ borderTopWidth: 1, borderColor: palette.borderSoft, paddingTop: 18, gap: 12 }}>
          {Platform.OS === 'web' ? <Action label={`${reportCopy[language].download}: ${report.title}`} onPress={() => download(report)}>{reportCopy[language].download}</Action> : <Label>{t('pdf_unsupported-platform')}</Label>}
          <Disclosure testID="report-information" title={copy('aboutReport')}>
            <Label style={styles.small}>{report.grouping}</Label>
            <Label style={styles.small}>{t('reportWholePdf')}</Label>
            <Label style={styles.small}>{t('translationReview')}</Label>
          </Disclosure>
        </View>
      </View>}
    </View>
  </View>;
}

export default function ResultsPanel({ session, reportScope, Label, Action, styles, wide, scale }) {
  const { t, language } = useLanguage();
  const copy = (key, values) => uiCopy(language, key, values);
  const [controller] = useState(() => createResultsController());
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const [openedReports, setOpenedReports] = useState([]);
  const [downloadNotice, setDownloadNotice] = useState(null);
  useLayoutEffect(() => reportScope.mount(), [reportScope]);
  const heading = useRef(null);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.open(session); return () => controller.close(); }, [controller, session]);
  useEffect(() => { if (state.status === 'ready') heading.current?.focus?.(); }, [state.status]);
  if (session.permissions.estudios !== true || state.status === 'restricted') return <Label>{t('restrictedResults')}</Label>;
  if (state.status === 'error') return <View><Label>{t('resultsError')}</Label><Action label={t('retryResults')} onPress={() => controller.open(session)}>{t('retry')}</Action></View>;
  if (state.status !== 'ready') return <Label>{t('resultsLoading')}</Label>;
  const visible = filterResults(state.items, state.filter).filter(item => resultPresentation(item, language).title.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)));
  const filters = ['all', ...new Set(state.items.map(statusKey))];
  const context = reportScope.getContext();
  const reports = listReports(context, language, { source: () => state.items }).reports;
  const download = async report => {
    const generation = context.generation;
    setDownloadNotice({ generation, language, status: 'preparing' });
    const result = await reportScope.download(report.id, language, generation);
    if (reportScope.getContext().generation === generation) setDownloadNotice({ generation, language, status: result.status });
  };
  const resetReports = () => { setOpenedReports([]); controller.detail(null); };
  return <View testID="results-panel" style={{ gap: wide ? 22 : 16 }}>
    <View style={{ backgroundColor: palette.blue, borderRadius: 20, padding: wide ? 28 : 16, gap: 12 }}>
      {wide && <View accessible={false} aria-hidden><FileText size={28} color={palette.white} /></View>}
      <Label ref={heading} tabIndex={-1} testID="section-heading" accessibilityRole="header" {...(Platform.OS === 'web' ? { 'aria-level': 1 } : {})} style={{ color: palette.white, fontSize: (wide ? 30 : 26) * scale, lineHeight: (wide ? 38 : 32) * scale, fontWeight: '700' }}>{t('results')}</Label>
      <Label style={{ color: palette.white, fontSize: (wide ? 18 : 16) * scale, lineHeight: 24 * scale }}>{copy('resultsIntro')}</Label>
    </View>
    {downloadNotice?.generation === context.generation && downloadNotice.language === language && <Label accessibilityLiveRegion="polite">{t(`pdf_${downloadNotice.status}`)}</Label>}
    {!state.items.length ? <View style={styles.card}><Label>{t('noResults')}</Label><Label>{t('noResultsDisclaimer')}</Label></View> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <Action variant="ghost" size="compact" label={copy('searchFilters')} expanded={searchOpen} controls={searchId} onPress={() => setSearchOpen(value => !value)}>{copy('searchFilters')}</Action>
        <Label style={{ color: palette.muted, fontSize: 14 * scale, lineHeight: 21 * scale }} accessibilityLiveRegion="polite">{t('resultCount', { visible: visible.length, total: state.items.length })}</Label>
      </View>
      {searchOpen && <View nativeID={searchId} testID="result-filters" style={{ gap: 12 }}>
        <Label style={{ fontWeight: '600' }}>{t('searchByName')}</Label>
        <TextInput {...accessibilityLanguageProps(Platform.OS, language)} accessibilityLabel={t('searchResult')} value={query} onChangeText={text => { setQuery(text); resetReports(); }} placeholder={t('searchPlaceholder')} style={{ minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 12, backgroundColor: palette.white, color: palette.ink, fontSize: 16 * scale }} />
        <View accessibilityLabel={t('filterStatus')} style={styles.selector}>{filters.map(filter => <Action size="compact" key={filter} label={t('filterLabel', { status: t(filter) })} selected={state.filter === filter} onPress={() => { resetReports(); controller.filter(filter); }}>{t(filter)}</Action>)}</View>
      </View>}
      {!visible.length ? <View style={styles.card}><Label>{t('noMatches')}</Label><Action label={t('clearFilter')} onPress={() => { setQuery(''); resetReports(); controller.filter('all'); }}>{t('viewAll')}</Action></View> : <View style={{ gap: 16 }}>{reports.map(report => {
        const items = visible.filter(item => report.items.some(row => row.id === item.id));
        if (!items.length) return null;
        return <ReportGroup key={report.id} {...{ report, items, download, state, controller, Label, Action, styles, scale, wide }} expanded={openedReports.includes(report.id)} toggle={() => { controller.detail(null); setOpenedReports(previous => previous.includes(report.id) ? previous.filter(id => id !== report.id) : [...previous, report.id]); }} />;
      })}</View>}
      <Label style={{ color: palette.muted }}>{t('statusDisclaimer')}</Label>
    </>}
  </View>;
}
