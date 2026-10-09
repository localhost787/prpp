import { MedplumClient } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Application } from './Application';

let realClient: MedplumClient;
vi.mock('./App', () => ({ App: () => {
  realClient = useMedplum();
  return <div>Original Foo Medical</div>;
} }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test('process true selects mock without fetching', async () => {
  vi.stubEnv('MEDPLUM_USE_MOCK', 'true');
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'));
  render(<Application />);
  expect(await screen.findByRole('heading', { name: 'Carmen Rivera Colón' })).toBeVisible();
  expect(screen.queryByText('Original Foo Medical')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test.each(['false', '', 'TRUE'])('%s preserves original real Medplum client', async value => {
  vi.stubEnv('MEDPLUM_USE_MOCK', value);
  vi.stubEnv('MEDPLUM_BASE_URL', 'http://127.0.0.1:8103/');
  render(<Application />);
  expect(await screen.findByText('Original Foo Medical')).toBeVisible();
  expect(realClient.constructor).toBe(MedplumClient);
  expect(realClient.getBaseUrl()).toBe('http://127.0.0.1:8103/');
  expect(screen.queryByLabelText('Cuenta de')).toBeNull();
});
