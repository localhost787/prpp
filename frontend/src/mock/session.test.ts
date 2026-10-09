import { MockClient } from '@medplum/mock';
import { afterEach, expect, test, vi } from 'vitest';
import { createMockSession } from './session';

test('Lourdes own health and delegated Carmen are separate sessions with explicit provisional permissions', async () => {
  const own = await createMockSession('lourdes', 'self');
  const delegated = await createMockSession('lourdes', 'delegate');
  expect(own.patient.id).toBe('lourdes');
  expect(delegated.patient.id).toBe('carmen');
  expect(own.client).not.toBe(delegated.client);
  expect(own.client.getProfile()).toMatchObject({ resourceType: 'RelatedPerson', id: 'lourdes' });
  expect(delegated).toMatchObject({ permissions: { visita: true, medicinas: true, instrucciones: true, estudios: false } });
  expect(own).toMatchObject({ permissions: { estudios: true } });
  await expect(delegated.client.readResource('Patient', 'lourdes')).rejects.toThrow();
  expect((await delegated.client.searchResources('Patient')).map(p => p.id)).toEqual(['carmen']);
});

test('Rafael has only delegated Carmen; unknown accounts and roles fail closed', async () => {
  const session = await createMockSession('rafael', 'delegate');
  expect(session.client.getProfile()).toMatchObject({ resourceType: 'RelatedPerson', id: 'rafael' });
  expect(session.patient.id).toBe('carmen');
  expect(session).toMatchObject({ permissions: { visita: true, medicinas: true, instrucciones: true, estudios: true } });
  await expect(createMockSession('rafael', 'self')).rejects.toThrow();
  await expect(createMockSession('unknown', 'self')).rejects.toThrow();
  await expect(createMockSession('carmen', 'delegate')).rejects.toThrow();
});

afterEach(() => vi.restoreAllMocks());

test('Carmen uses an isolated minimal MockClient without network or browser storage', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  const session = await createMockSession('carmen', 'self');
  expect(session.client).toBeInstanceOf(MockClient);
  expect(session.client.getProfile()).toMatchObject({ resourceType: 'Patient', id: 'carmen' });
  expect(session.patient.name?.[0].text).toBe('Carmen Rivera Colón');
  expect((await session.client.searchResources('Patient')).map(p => p.id)).toEqual(['carmen']);
  expect(await session.client.searchResources('Observation')).toHaveLength(0);
  expect(network).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
});
