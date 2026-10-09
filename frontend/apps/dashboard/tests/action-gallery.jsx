// Test-only harness: never imported by App or included in the Expo export.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {View} from 'react-native';
import {Action, Label} from '../src/ui/Action.jsx';
import {buttonVariants} from '../src/ui.mjs';
function Gallery() {
 const [presses,setPresses]=useState(0);
 return <View style={{padding:24,gap:20,backgroundColor:'#ffffff'}}>
  <Label>AYO-111 · control test harness (not a patient workflow)</Label>
  <Label testID="press-count">{String(presses)}</Label>
  {buttonVariants.map(variant=><View key={variant} style={{gap:12,flexDirection:'row',flexWrap:'wrap'}}>
   <Action variant={variant} label={variant} onPress={()=>setPresses(n=>n+1)}>{variant}</Action>
   <Action variant={variant} label={`${variant} selected`} selected onPress={()=>setPresses(n=>n+1)}>{variant}</Action>
   <Action variant={variant} label={`${variant} disabled`} disabled onPress={()=>setPresses(n=>n+1)}>{variant}</Action>
  </View>)}
 </View>;
}
createRoot(document.getElementById('root')).render(<Gallery/>);
