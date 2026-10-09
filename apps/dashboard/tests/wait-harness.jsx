import React from 'react';
import { View } from 'react-native';
import WaitPanel from '../src/wait/WaitPanel.jsx';
import { WAIT_FIXTURES, createWaitModel } from '../src/wait/wait.mjs';

export default function WaitHarness() {
  const state = createWaitModel({ language: 'en', state: 'ready', ...WAIT_FIXTURES.afterTriage });
  return <View style={{ width: 390, padding: 16 }}>
    <WaitPanel language="en" textScale={1.5} state={state} />
  </View>;
}
