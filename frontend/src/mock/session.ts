import { ClientStorage, MemoryStorage } from '@medplum/core';
import type { Patient, RelatedPerson } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';

export const accounts = ['carmen', 'lourdes'] as const;
export type Account = (typeof accounts)[number];
export type Role = 'self' | 'delegate';
export const accountNames: Record<Account, string> = { carmen: 'Carmen', lourdes: 'Lourdes' };
export const roles: Record<Account, readonly Role[]> = {
  carmen: ['self'], lourdes: ['delegate', 'self'],
};
export const categories = {
  visita: 'Estado en Emergencias', medicinas: 'Medicinas',
  instrucciones: 'Instrucciones del alta y cita', estudios: 'Estudios y resultados',
};
export type MockSession = {
  client: MockClient;
  patient: Patient;
  permissions: Record<keyof typeof categories, boolean>;
};

// Borrador API-01..04. Explicit fixtures, NOT AccessPolicy enforcement or a backend contract.
export async function createMockSession(account: string, role: string): Promise<MockSession> {
  if (!accounts.includes(account as Account) || !roles[account as Account].includes(role as Role)) {
    throw new Error('Contexto provisional no disponible');
  }
  const ownLourdes = account === 'lourdes' && role === 'self';
  const patient: Patient = {
    resourceType: 'Patient', id: ownLourdes ? 'lourdes' : 'carmen',
    name: [{ text: ownLourdes ? 'Lourdes' : 'Carmen Rivera Colón' }],
    meta: { tag: [{ system: 'urn:portal:origen', code: 'simulado' }] },
  };
  const profile: Patient | RelatedPerson = account === 'carmen' ? patient : {
    resourceType: 'RelatedPerson', id: account, name: [{ text: accountNames[account as Account] }],
    patient: { reference: 'Patient/carmen' },
  };
  // Each context gets a fresh repository/cache and SDK memory storage. No default clinical fixtures.
  const client = new MockClient({
    profile, storage: new ClientStorage(new MemoryStorage()), seedDefaultData: false,
  });
  await client.createResource(patient);
  return {
    client, patient: await client.readResource('Patient', patient.id as string),
    permissions: {
      visita: true, medicinas: true, instrucciones: true,
      estudios: !(account === 'lourdes' && role === 'delegate'),
    },
  };
}
