// Realtime for the screens: when the server reports a change for this patient (only categories that
// auth/me allows), call onChange so the screen RE-READS from the server. No-op for mock sessions.
import { useEffect, useRef } from 'react';
import { subscribePatient } from './realtime.mjs';

export function useLiveRefresh(session, onChange) {
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    const live = session?.live;
    if (!live) return undefined;
    let sub = null;
    try {
      sub = subscribePatient(live.client, live.access, live.patientId, { onChange: info => callback.current?.(info) });
    } catch {
      // No WebSocket available: the screen still works, just without live updates.
    }
    return () => sub?.unsubscribe();
  }, [session]);
}
