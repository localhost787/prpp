import React from 'react';
import { View } from 'react-native';
import NoticesPanel from '../src/notices/NoticesPanel.jsx';
import { SYNTHETIC_NOTICE_FIXTURE, createNoticesModel } from '../src/notices/notices.mjs';

export default function NoticesHarness() {
  const state = createNoticesModel({ language: 'en', state: 'ready', permission: true, communications: SYNTHETIC_NOTICE_FIXTURE });
  return <View style={{ width: 390, padding: 16 }}>
    <NoticesPanel language="en" textScale={1.5} state={state} unreadCount={3} onOpen={() => {}} />
  </View>;
}
