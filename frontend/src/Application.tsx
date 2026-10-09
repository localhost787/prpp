import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import { lazy, Suspense, useState } from 'react';
import { App } from './App';

const MockApp = lazy(() => import('./mock/MockApp').then(module => ({ default: module.MockApp })));

export function Application() {
  return import.meta.env.MEDPLUM_USE_MOCK === 'true'
    ? <Suspense fallback={<p lang="es">Cargando ejemplo provisional…</p>}><MockApp /></Suspense>
    : <RealApplication />;
}

function RealApplication() {
  // Original Foo Medical client/options; never constructed on the mock path.
  const [medplum] = useState(() => new MedplumClient({
    onUnauthenticated: () => (window.location.href = '/'),
    baseUrl: import.meta.env.MEDPLUM_BASE_URL,
  }));
  return <MedplumProvider medplum={medplum}><App /></MedplumProvider>;
}
