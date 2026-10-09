import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { createResultsController, filterResults, interpretationLabel, interpretationKey, statusLabel, statusKey, resultPresentation } from './results.mjs';

import { useLanguage, accessibilityLanguageProps } from './Language.jsx';
import { listReports, reportCopy } from './reports/index.mjs';
import Disclosure from './ui/Disclosure.jsx';

function ResultCard({ item, expanded, controller, Label, Action, styles, wide, scale }) {
  const { t, language } = useLanguage();
  const presentation = resultPresentation(item, language);
  const opener = useRef(null), closer = useRef(null), wasOpen = useRef(false);
  useEffect(() => {
    if (expanded) closer.current?.focus?.();
    else if (wasOpen.current) opener.current?.focus?.();
    wasOpen.current = expanded;
  }, [expanded]);
  const interpretation = interpretationLabel(item, language);
  const status = statusLabel(item, language);
  return <View testID="result-card" style={[styles.card, { boxShadow: 'none', flexBasis: wide ? '47%' : '100%', flexGrow: 1, minWidth: 0 }]}>
    <View style={styles.topline}>
      <Label style={{ fontWeight: '700', color: statusKey(item) === 'preliminary' ? '#784d00' : '#425570' }}>{status}</Label>
    </View>
    <Label accessibilityRole="header" style={{ fontSize: 21 * scale, lineHeight: 28 * scale, fontWeight: '700' }}>{presentation.title}</Label>
    <Label style={{ fontSize: (item.valueQuantity ? 30 : 21) * scale, lineHeight: (item.valueQuantity ? 44 : 30) * scale, fontWeight: '700' }}>{item.valueQuantity ? `${presentation.value} ${presentation.unit}` : presentation.value}</Label>
    <Label style={{ fontWeight: '700', color: interpretationKey(item) === 'high' ? '#784d00' : interpretationKey(item) === 'normal' ? '#176044' : '#425570' }}>{interpretation}</Label>
    <Label>{t('referenceRange', { range: item.referenceRange?.[0]?.text ?? t('unavailable') })}</Label>
    {!expanded ? <Action controlRef={opener} label={t('viewDetailLabel', { name: presentation.title })} onPress={() => controller.detail(item.id)}>{t('viewDetail')}</Action> : <View testID="result-detail" style={{ gap: 16, borderTopWidth: 1, borderColor: '#dce4ef', paddingTop: 16 }}>
      <Action variant="ghost" controlRef={closer} label={t('closeDetailLabel', { name: presentation.title })} onPress={() => controller.detail(null)}>{t('closeDetail')}</Action>
      {statusKey(item) === 'preliminary' && <View style={styles.restriction}><Label>{t('preliminaryExplanation')}</Label></View>}
      <Label>{presentation.note}</Label>
      <Label>{t('askTeam')}</Label>
      <Label>{t('study', { name: presentation.report })}</Label>
      <Label>{t('resultDate')}</Label>
    </View>}
  </View>;
}
export default function ResultsPanel({ session, reportScope, Label, Action, styles, wide, scale }) {
  const { t, language } = useLanguage();
  const [controller] = useState(() => createResultsController());
  const [query, setQuery] = useState('');
  const [downloadNotice, setDownloadNotice] = useState(null);
  useLayoutEffect(() => reportScope.mount(), [reportScope]);
  const heading = useRef(null);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.open(session); return () => controller.close(); }, [controller, session]);
  useEffect(() => {
    if (state.status === 'ready') {
      heading.current?.focus?.();
      // Keep the patient/context header visible when results become ready.
    }
  }, [state.status]);
  // Gate render before counts, titles, or details; fixture source is separately gated.
  if (session.permissions.estudios !== true || state.status === 'restricted') return <Label>{t('restrictedResults')}</Label>;
  if (state.status === 'error') return <View><Label>{t('resultsError')}</Label><Action label={t('retryResults')} onPress={() => controller.open(session)}>{t('retry')}</Action></View>;
  if (state.status !== 'ready') return <Label>{t('resultsLoading')}</Label>;
  const visible = filterResults(state.items, state.filter).filter(item => resultPresentation(item, language).title.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)));
  const filters = ['all', ...new Set(state.items.map(statusKey))];
  const context = reportScope.getContext();
  const reports = listReports(context, language, { source: () => state.items }).reports;
  const copy = reportCopy[language];
  const download = async report => {
    const generation = context.generation;
    setDownloadNotice({ generation, language, status: 'preparing' });
    const result = await reportScope.download(report.id, language, generation);
    // A late completion must not update a different context/language or unmounted view.
    if (reportScope.getContext().generation === generation) setDownloadNotice({ generation, language, status: result.status });
  };
  return <View testID="results-panel" style={{ gap: 20 }}>
    <Label ref={heading} tabIndex={-1} testID="section-heading" accessibilityRole="header" style={{ fontSize: 30 * scale, lineHeight: 38 * scale, fontWeight: '700' }}>{t('results')}</Label>
    <Label>{t('resultsSubtitle')}</Label>
    {downloadNotice?.generation === context.generation && downloadNotice.language === language && <Label accessibilityLiveRegion="polite">{t(`pdf_${downloadNotice.status}`)}</Label>}

    {!state.items.length ? <View style={styles.card}><Label>{t('noResults')}</Label><Label>{t('noResultsDisclaimer')}</Label></View> : <>
      <Label style={{ fontWeight: '700' }}>{t('searchByName')}</Label>
      <TextInput {...accessibilityLanguageProps(Platform.OS, language)} accessibilityLabel={t('searchResult')} value={query} onChangeText={text => { setQuery(text); controller.detail(null); }} placeholder={t('searchPlaceholder')} style={{ minHeight: 48, borderWidth: 1, borderColor: '#718198', borderRadius: 9, padding: 12, backgroundColor: '#fff', color: '#172b4d', fontSize: 16 * scale }} />
      <Label style={{ fontWeight: '700' }}>{t('filterStatus')}</Label>
      <View style={styles.selector}>{filters.map(filter => <Action size="compact" key={filter} label={t('filterLabel', { status: t(filter) })} selected={state.filter === filter} onPress={() => controller.filter(filter)}>{t(filter)}</Action>)}</View>
      <Label accessibilityLiveRegion="polite">{t('resultCount', { visible: visible.length, total: state.items.length })}</Label>
      {!visible.length ? <View style={styles.card}><Label>{t('noMatches')}</Label><Action label={t('clearFilter')} onPress={() => { setQuery(''); controller.filter('all'); }}>{t('viewAll')}</Action></View> : <View style={{ gap: 24 }}>{reports.map(report => {
        const items = visible.filter(item => report.items.some(row => row.id === item.id));
        if (!items.length) return null;
        return <View key={report.id} testID="report-group" style={[styles.featureCard, { padding: wide ? 24 : 12 }]}>
          <View testID={`report-${report.id}`} style={{ gap: 16 }}>
            <Label style={{ fontWeight: '700', color: '#063b9e' }}>{report.institution}</Label>
            <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 24 * scale, lineHeight: 32 * scale }}>{report.title}</Label>
            <Label>{t(report.id === 'b' ? 'reportImaging' : 'reportLaboratory')}</Label>
            <Label>{t('reportStates', { states: [...new Set(report.items.map(item => item.statusLabel))].join(' · ') })}</Label>
            {Platform.OS === 'web' ? <Action primary label={`${copy.download}: ${report.title}`} onPress={() => download(report)}>{copy.download}</Action> : <Label>{t('pdf_unsupported-platform')}</Label>}
            <Disclosure testID="report-information" title={language === 'es' ? 'Sobre este informe de ejemplo' : 'About this example report'}>
              <Label style={styles.small}>{report.grouping}</Label>
              <Label style={styles.small}>{t('reportWholePdf')}</Label>
              <Label style={styles.small}>{t('translationReview')}</Label>
            </Disclosure>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>{items.map(item => <ResultCard key={item.id} {...{ item, controller, Label, Action, styles, scale, wide }} expanded={state.detail === item.id} />)}</View>
          </View>
        </View>;
      })}</View>}
      <Label style={styles.small}>{t('statusDisclaimer')}</Label>
    </>}
  </View>;
}
