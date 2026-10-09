import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLanguage } from '../Language.jsx';
import { Action, Label } from '../ui/Action.jsx';
import { palette, surfaceStyles } from '../ui.mjs';
import { CATEGORIES } from './permissions.mjs';
import { toggleCategory } from './sharing.mjs';

// Integrated mode only. Own record ("Mi salud"): who sees what, with switches that call the server Bot
// (compartir-familia). Family member: what auth/me grants for the patient being viewed (read-only).
export default function FamilyPanel({ session, textScale = 1 }) {
  const { t } = useLanguage();
  const heading = <Label testID="section-heading" accessibilityRole="header" style={{ fontSize: 26 * textScale, lineHeight: 34 * textScale, fontWeight: '700' }}>{t('family')}</Label>;
  if (session.role !== 'self') {
    return <View testID="family-panel" style={styles.card}>
      {heading}
      <Label>{t('familyDelegateIntro', { name: session.patient.name[0].text })}</Label>
      {CATEGORIES.map(c => <Label key={c}>{`${t(`category_${c}`)}: ${t(session.permissions[c] === true ? 'familyAllowed' : 'familyLocked')}`}</Label>)}
    </View>;
  }
  return <OwnFamily session={session} heading={heading} />;
}

function OwnFamily({ session, heading }) {
  const { t } = useLanguage();
  const [state, setState] = useState({ status: 'loading', people: [] });
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    let current = true;
    session.live.family().then(r => current && setState(r.status === 'ok' ? { status: 'ready', people: r.data } : { status: 'error', people: [] }));
    return () => { current = false; };
  }, [session]);
  const toggle = async (person, category) => {
    const on = !person.categories.includes(category);
    setSaving(person.id); setSaveError(false);
    const result = await session.live.share(person.id, toggleCategory(person.categories, category, on));
    setSaving(null);
    if (result.status !== 'ok') { setSaveError(true); return; }
    const categories = CATEGORIES.filter(c => result.data.compartir.includes(c));
    setState(s => ({ ...s, people: s.people.map(p => (p.id === person.id ? { ...p, categories } : p)) }));
  };
  return <View testID="family-panel" style={styles.card}>
    {heading}
    {state.status !== 'ready' ? <Label accessibilityLiveRegion="polite">{t(state.status === 'error' ? 'familyError' : 'familyLoading')}</Label>
      : !state.people.length ? <Label>{t('familyEmpty')}</Label>
        : state.people.map(person => <View key={person.id} style={styles.item}>
          <Label style={{ fontWeight: '700' }}>{t('familyShares', { name: person.name ?? '', relationship: person.relationship ?? '' })}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map(c => {
              const on = person.categories.includes(c);
              const label = t('familyToggle', { category: t(`category_${c}`), state: t(on ? 'familyOn' : 'familyOff') });
              return <Action key={c} size="compact" variant="ghost" selected={on} disabled={saving !== null} label={label} onPress={() => toggle(person, c)}>{t(`category_${c}`)}</Action>;
            })}
          </View>
          {saving === person.id && <Label accessibilityLiveRegion="polite">{t('familySaving')}</Label>}
        </View>)}
    {saveError && <View style={styles.restricted}><Label accessibilityLiveRegion="polite">{t('familySaveError')}</Label></View>}
  </View>;
}

const styles = {
  card: { ...surfaceStyles.feature, padding: 16, gap: 12, flex: 1, minWidth: 0 },
  item: { borderTopColor: palette.border, borderTopWidth: 1, paddingTop: 12, gap: 8 },
  restricted: { backgroundColor: '#fff4ce', borderColor: '#52647a', borderWidth: 1, borderRadius: 10, padding: 14 },
};
