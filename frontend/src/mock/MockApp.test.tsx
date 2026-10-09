import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as sessions from './session';
import { afterEach, expect, test, vi } from 'vitest';
import { MockApp } from './MockApp';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('patient shell has five honest sections and resets navigation with context', async () => {
  render(<MockApp />);
  await screen.findByRole('heading', { name: 'Carmen Rivera Colón' });
  const navigation = screen.getByRole('navigation', { name: 'Secciones del portal' });
  expect([...navigation.querySelectorAll('button')].map(button => button.textContent)).toEqual(
    ['Mi visita', 'Resultados', 'Mi cuidado', 'Familia', 'Más']);
  for (const name of ['Mi visita', 'Resultados', 'Mi cuidado', 'Familia', 'Más']) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('heading', { name })).toBeVisible();
    expect(screen.getByText('Esta sección todavía no está implementada en este prototipo')).toBeVisible();
  }
  expect(screen.queryByText(/Permisos del ejemplo/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Cuenta de'), { target: { value: 'rafael' } });
  expect(await screen.findByRole('heading', { name: 'Mi visita' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Más' })).toBeNull();
});

test('simulated exit removes context and requires explicit reentry, ignoring pending data', async () => {
  const original = sessions.createMockSession;
  let release!: (value: sessions.MockSession) => void;
  vi.spyOn(sessions, 'createMockSession').mockImplementation(original)
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  render(<MockApp />);
  fireEvent.click(screen.getByRole('button', { name: 'Salir del ejemplo' }));
  expect(screen.queryByLabelText('Cuenta de')).toBeNull();
  const enter = screen.getByRole('button', { name: 'Volver a entrar al ejemplo' });
  expect(enter).toHaveFocus();
  const discarded = await original('carmen', 'self');
  const clear = vi.spyOn(discarded.client, 'clear');
  await act(async () => release(discarded));
  expect(clear).toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Carmen Rivera Colón' })).toBeNull();
  fireEvent.click(enter);
  expect(await screen.findByRole('heading', { name: 'Mi visita' })).toBeVisible();
  expect(screen.getByLabelText('Cuenta de')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salir del ejemplo' }));
  expect(screen.queryByRole('navigation')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Volver a entrar al ejemplo' }));
  expect(await screen.findByRole('heading', { name: 'Mi visita' })).toBeVisible();
});

test('letter size increases and decreases reversibly with bounded controls', async () => {
  render(<MockApp />);
  await screen.findByRole('heading', { name: 'Mi visita' });
  const main = screen.getByRole('main');
  const original = main.style.fontSize;
  const increase = screen.getByRole('button', { name: 'Aumentar letra' });
  const decrease = screen.getByRole('button', { name: 'Reducir letra' });
  expect(decrease).toBeDisabled();
  fireEvent.click(increase);
  expect(main.style.fontSize).not.toBe(original);
  fireEvent.click(decrease);
  expect(main.style.fontSize).toBe(original);
  for (let i = 0; i < 8; i++) fireEvent.click(increase);
  expect(increase).toBeDisabled();
});

test('late response from a discarded patient never replaces the active context', async () => {
  const original = sessions.createMockSession;
  let release!: (value: sessions.MockSession) => void;
  const late = new Promise<sessions.MockSession>(resolve => { release = resolve; });
  vi.spyOn(sessions, 'createMockSession').mockImplementation(original).mockImplementationOnce(() => late);
  render(<MockApp />);
  fireEvent.change(screen.getByLabelText('Cuenta de'), { target: { value: 'lourdes' } });
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'self' } });
  expect(await screen.findByRole('heading', { name: 'Lourdes' })).toBeVisible();
  await act(async () => release(await original('carmen', 'self')));
  expect(screen.getByRole('heading', { name: 'Lourdes' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Carmen Rivera Colón' })).toBeNull();
});

test('startup shows provisional Carmen without password; account and role switches clear old context', async () => {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Forbidden network'));
  render(<MockApp />);
  expect(await screen.findByRole('heading', { name: 'Carmen Rivera Colón' })).toBeVisible();
  expect(screen.getByText(/Modo provisional/)).toBeVisible();
  expect(document.querySelector('input[type=password]')).toBeNull();
  expect(screen.getAllByRole('option', { name: /^(Carmen|Lourdes|Rafael)$/ })).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Cuenta de'), { target: { value: 'lourdes' } });
  expect(screen.queryByRole('heading', { name: 'Carmen Rivera Colón' })).toBeNull();
  expect(await screen.findByRole('button', { name: 'Resultados' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'self' } });
  expect(screen.queryByRole('heading', { name: 'Carmen Rivera Colón' })).toBeNull();
  expect(await screen.findByRole('heading', { name: 'Lourdes' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Resultados' })).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Cuenta de'), { target: { value: 'rafael' } });
  expect(screen.queryByRole('heading', { name: 'Lourdes' })).toBeNull();
  expect(await screen.findByRole('heading', { name: 'Carmen Rivera Colón' })).toBeVisible();
  expect(screen.getByLabelText('Rol').querySelectorAll('option')).toHaveLength(1);
  await waitFor(() => expect(network).not.toHaveBeenCalled());
});
