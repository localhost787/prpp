import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLanguage } from '../Language.jsx';
import { Label } from '../ui/Action.jsx';
import { palette, surfaceStyles } from '../ui.mjs';
import { useLiveRefresh } from './useLiveRefresh.mjs';

// Integrated mode only: discharge plan (instrucciones), prescriptions (medicinas) and follow-up
// appointment (instrucciones) from the server. Server texts are shown as they come (Spanish).
export default function DischargeCard({ session, textScale = 1 }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useLiveRefresh(session, ({ types }) => { if (['CarePlan', 'MedicationRequest', 'Appointment'].some(x => types.has(x))) setTick(n => n + 1); });
  useEffect(() => {
    let current = true;
    session.live.discharge().then(data => current && setState({ status: 'ready', data }), () => current && setState({ status: 'error' }));
    return () => { current = false; };
  }, [session, tick]);
  const s = textScale;
  const heading = <Label accessibilityRole="header" style={{ fontWeight: '700', fontSize: 20 * s, lineHeight: 28 * s }}>{t('dischargeTitle')}</Label>;
  if (state.status !== 'ready') return <View testID="discharge-card" style={styles.card}>{heading}<Label accessibilityLiveRegion="polite">{t(state.status === 'error' ? 'dischargeError' : 'dischargeLoading')}</Label></View>;
  const { plan, prescriptions, appointments } = state.data;
  return <View testID="discharge-card" style={styles.card}>
    {heading}
    {plan.status === 'locked' ? <View style={styles.restricted}><Label>{t('dischargePrivate')}</Label></View>
      : !plan.data ? <Label>{t('dischargeEmpty')}</Label> : <View style={{ gap: 8 }}>
        {plan.data.diagnosis && <Label style={{ fontWeight: '700' }}>{plan.data.diagnosis}</Label>}
        {plan.data.steps.map((step, i) => <Label key={`s${i}`}>{`• ${step}`}</Label>)}
        {plan.data.alarms.length > 0 && <View style={styles.restricted}>
          <Label style={{ fontWeight: '700' }}>{t('dischargeAlarms')}</Label>
          {plan.data.alarms.map((alarm, i) => <Label key={`a${i}`}>{`• ${alarm}`}</Label>)}
        </View>}
      </View>}
    <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{t('dischargePrescriptions')}</Label>
    {prescriptions.status === 'locked' ? <View style={styles.restricted}><Label>{t('dischargePrescriptionsPrivate')}</Label></View>
      : prescriptions.data.map(rx => <View key={rx.id} style={styles.item}>
        <Label style={{ fontWeight: '700' }}>{rx.name}</Label>
        {rx.instructions && <Label>{rx.instructions}</Label>}
        {rx.note && <Label style={{ color: palette.muted }}>{rx.note}</Label>}
      </View>)}
    {appointments.status === 'ok' && appointments.data.length > 0 && <>
      <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{t('dischargeAppointments')}</Label>
      {appointments.data.map(a => <View key={a.id} style={styles.item}>
        <Label style={{ fontWeight: '700' }}>{a.description ?? a.serviceType ?? ''}</Label>
        <Label>{[a.start ? new Date(a.start).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico', dateStyle: 'medium', timeStyle: 'short' }) : null, a.clinician].filter(Boolean).join(' · ')}</Label>
      </View>)}
    </>}
  </View>;
}

const styles = {
  card: { ...surfaceStyles.card, padding: 16, gap: 12, minWidth: 0 },
  item: { borderTopColor: palette.border, borderTopWidth: 1, paddingTop: 10, gap: 3 },
  restricted: { backgroundColor: '#fff4ce', borderColor: '#52647a', borderWidth: 1, borderRadius: 10, padding: 14, gap: 4 },
};
