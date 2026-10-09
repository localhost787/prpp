import React from 'react';
import { View } from 'react-native';
import FamilyPanel from '../src/family/FamilyPanel.jsx';
import { FAMILY_PERMISSION_FIXTURE } from '../src/family/family.mjs';

// Isolated harness only. It is not imported by App.jsx and does not start a server.
export default function FamilyHarness() {
  return <View style={{ width: 390, padding: 16 }}>
    <FamilyPanel
      language="en"
      textScale={1.5}
      viewer={{ kind: 'patient' }}
      patient={{ id: 'carmen', name: 'Doña Carmen' }}
      permissions={FAMILY_PERMISSION_FIXTURE}
      state={{ status: 'ready' }}
      onToggleCategory={() => {}}
      onRemoveAccess={() => {}}
    />
  </View>;
}
