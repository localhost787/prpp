import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import FamilyPanel from './FamilyPanel.jsx';
import {
  FAMILY_COPY,
  FAMILY_PERMISSION_FIXTURE,
  createFamilyMutationQueue,
} from './family.mjs';

const cloneFixture = () => FAMILY_PERMISSION_FIXTURE.map(caregiver => ({
  ...caregiver,
  permissions: { ...caregiver.permissions },
}));

const STATUS_COPY = Object.freeze({
  en: Object.freeze({
    saving: 'Saving this local example…',
    saved: 'This change was saved only in this local example.',
    error: 'We could not save. The previous local example was restored.',
  }),
  es: Object.freeze({
    saving: 'Guardando este ejemplo local…',
    saved: 'Este cambio se guardó solamente en este ejemplo local.',
    error: 'No se pudo guardar. Se restauró el ejemplo local anterior.',
  }),
});

export default function FamilySection({ language = 'en', textScale = 1, patient, save = async () => {} }) {
  const resolvedLanguage = Object.hasOwn(FAMILY_COPY, language) ? language : 'en';
  const [mutationQueue] = useState(() => createFamilyMutationQueue(cloneFixture(), save));
  const [caregivers, setCaregivers] = useState(() => mutationQueue.getCaregivers());
  const [saveStatus, setSaveStatus] = useState(null);
  const revision = useRef(0);

  useEffect(() => () => { revision.current += 1; }, []);

  const finish = (request, result) => {
    if (request !== revision.current) return;
    setCaregivers(result.caregivers);
    setSaveStatus(result.status === 'saved' ? 'saved' : 'error');
  };

  const toggleCategory = async ({ caregiverId, category, enabled }) => {
    const request = ++revision.current;
    setSaveStatus('saving');
    const result = await mutationQueue.change({ caregiverId, category, enabled });
    finish(request, result);
  };

  const turnOffAccess = async ({ caregiverId }) => {
    const request = ++revision.current;
    setSaveStatus('saving');
    const result = await mutationQueue.remove({ caregiverId, language: resolvedLanguage });
    finish(request, result);
  };

  return <View style={{ gap: 12, minWidth: 0 }}>
    <FamilyPanel
      language={resolvedLanguage}
      textScale={textScale}
      viewer={{ kind: 'patient' }}
      patient={patient}
      permissions={caregivers}
      state={{ status: 'ready' }}
      onToggleCategory={toggleCategory}
      onRemoveAccess={turnOffAccess}
    />
    {saveStatus && <View
      testID="family-save-status"
      accessibilityLiveRegion="polite"
      accessibilityState={saveStatus === 'saving' ? { busy: true } : undefined}
    >
      <FamilyStatusText language={resolvedLanguage} scale={textScale} status={saveStatus} />
    </View>}
  </View>;
}

function FamilyStatusText({ language, scale, status }) {
  const copy = STATUS_COPY[language];
  const text = copy[status] ?? copy.error;
  return <FamilyPanelStatusText language={language} scale={scale}>{text}</FamilyPanelStatusText>;
}

function FamilyPanelStatusText({ children, language, scale }) {
  return <Text
    accessibilityLanguage={language === 'es' ? 'es-PR' : 'en-US'}
    style={{ fontSize: 16 * scale, lineHeight: 24 * scale }}
  >{children}</Text>;
}
