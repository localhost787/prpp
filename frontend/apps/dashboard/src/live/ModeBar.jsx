import React, { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useLanguage } from '../Language.jsx';
import { Action, Label } from '../ui/Action.jsx';
import { palette } from '../ui.mjs';

// Explicit mode choice on the entry screen. Rendered only when the build is configured for live.
export default function ModeBar({ portal, onChoose }) {
  const { t } = useLanguage();
  const mode = useSyncExternalStore(portal.subscribe, portal.getSnapshot, portal.getSnapshot);
  if (!mode.configured) return null;
  const integrated = mode.mode === 'integrado';
  return <View testID="mode-bar" style={{ gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.border }}>
    <Label style={{ fontWeight: '700' }}>{t('modeCurrent', { mode: t(integrated ? 'modeIntegrated' : 'modeDemo') })}</Label>
    {integrated && mode.availability === 'checking' && <Label accessibilityLiveRegion="polite">{t('modeChecking')}</Label>}
    {integrated && mode.availability === 'unavailable' && <View style={{ gap: 8 }}>
      <Label accessibilityLiveRegion="polite">{t('modeUnavailable')}</Label>
      <Action size="compact" label={t('modeRetry')} onPress={() => portal.check()}>{t('modeRetry')}</Action>
    </View>}
    <Action size="compact" variant="ghost" label={t(integrated ? 'useDemoMode' : 'useIntegratedMode')} onPress={() => onChoose(integrated ? 'demostracion' : 'integrado')}>{t(integrated ? 'useDemoMode' : 'useIntegratedMode')}</Action>
  </View>;
}
