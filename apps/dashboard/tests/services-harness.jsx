import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ServicesPanel from '../src/services/ServicesPanel.jsx';
function Harness(){
 const [props,setProps]=useState({state:'loading',language:'en',textScale:1.5});
 window.setServicesProps=setProps;
 return <ServicesPanel {...props} onRetry={()=>{window.retryCalls++;setProps(p=>({...p,state:'list'}));}} />;
}
window.retryCalls=0;
createRoot(document.getElementById('root')).render(<Harness/>);
