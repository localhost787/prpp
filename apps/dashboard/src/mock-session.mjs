// Provisional LOCAL MOCK only. It is not authentication, AccessPolicy enforcement,
// a backend contract, or a source of real clinical data.
import { ClientStorage, MemoryStorage } from '@medplum/core';
import { MockClient } from '@medplum/mock';

export const accounts = ['carmen', 'lourdes', 'rafael'];
export const accountNames = { carmen: 'Carmen', lourdes: 'Lourdes', rafael: 'Rafael' };
export const roles = {
  carmen: ['self'],
  lourdes: ['delegate', 'self'],
  rafael: ['delegate'],
};
export const categories = {
  visita: 'Estado en Emergencias',
  medicinas: 'Medicinas',
  instrucciones: 'Instrucciones del alta y cita',
  estudios: 'Estudios y resultados',
};

export async function createMockSession(account, role) {
  if (!accounts.includes(account) || !roles[account]?.includes(role)) {
    throw new Error('Contexto provisional no disponible');
  }

  const ownContext = role === 'self';
  const patient = {
    resourceType: 'Patient',
    id: ownContext && account === 'lourdes' ? 'lourdes' : 'carmen',
    name: [{ text: ownContext && account === 'lourdes' ? 'Lourdes' : 'Carmen Rivera Colón' }],
    meta: { tag: [{ system: 'urn:portal:origen', code: 'simulado' }] },
  };
  const profile = ownContext ? patient : {
    resourceType: 'RelatedPerson',
    id: account,
    name: [{ text: accountNames[account] }],
    patient: { reference: 'Patient/carmen' },
  };
  const client = new MockClient({
    profile,
    storage: new ClientStorage(new MemoryStorage()),
    seedDefaultData: false,
  });
  await client.createResource(patient);

  return {
    client,
    patient: await client.readResource('Patient', patient.id),
    permissions: {
      visita: true,
      medicinas: true,
      instrucciones: true,
      estudios: !(account === 'lourdes' && role === 'delegate'),
    },
  };
}
