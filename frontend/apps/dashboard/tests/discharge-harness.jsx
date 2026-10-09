import React from 'react';
import { View } from 'react-native';
import DischargePanel from '../src/discharge/DischargePanel.jsx';
import { SYNTHETIC_DISCHARGE_FIXTURE } from '../src/discharge/discharge.mjs';

export default function DischargeHarness() {
  return <View style={{ width: 390, padding: 16 }}>
    <DischargePanel
      language="es"
      textScale={1.5}
      state={{ status: 'ready', visit: { status: 'finished', disposition: 'home' }, data: SYNTHETIC_DISCHARGE_FIXTURE }}
      permissions={{ medicines: true, instructions: true }}
    />
  </View>;
}
