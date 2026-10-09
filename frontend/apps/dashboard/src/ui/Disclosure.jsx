import React, { useId, useState } from 'react';
import { View } from 'react-native';
import { palette } from '../ui.mjs';
import { Action, Label } from './Action.jsx';

export default function Disclosure({ title, children, testID }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <View testID={testID} style={styles.root}>
    <Action
      variant="ghost"
      size="compact"
      label={title}
      expanded={open}
      controls={id}
      onPress={() => setOpen(value => !value)}
      style={styles.action}
      content={<Label style={styles.label}>{title}</Label>}
    />
    {open && <View nativeID={id} style={styles.content}>{children}</View>}
  </View>;
}

const styles = {
  root: { borderTopWidth: 1, borderColor: palette.borderSoft, paddingTop: 8, gap: 10, minWidth: 0 },
  action: { width: '100%', justifyContent: 'space-between', paddingHorizontal: 0 },
  label: { color: palette.muted, fontWeight: '600', flex: 1 },
  content: { gap: 12, minWidth: 0 },
};
