import { AppShell, MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { Logo } from './components/Logo';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Header as LandingHeader } from './pages/landing/Header';
import { LandingPage } from './pages/landing';
import { SignInPage } from './pages/SignInPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { SmartHealthLinksPage } from './pages/SmartHealthLinksPage';
import { MockApp } from './mock/MockApp';

import { readFileSync } from 'node:fs';

const fullName = 'Puerto Rico Patient Portal';
test('browser metadata names PRPP and uses the coqui PNG favicon', () => {
  const html = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
  expect(html.title).toBe(fullName);
  const icon = html.querySelector('link[rel="icon"]');
  expect(icon?.getAttribute('type')).toBe('image/png');
  expect(icon?.getAttribute('href')).toBe('/favicon.png');
  const png = readFileSync('public/favicon.png');
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(64);
  expect(png.readUInt32BE(20)).toBe(64);
});

test.each([
  ['sign in', <SignInPage />, 'Sign in to PRPP'],
  ['register', <RegisterPage />, 'Register with PRPP'],
  ['home', <HomePage />, 'Welcome to PRPP'],
  ['footer', <Footer />, /Puerto Rico Patient Portal/],
  ['landing', <LandingPage />, fullName],
  ['mock', <MockApp />, fullName],
] as const)('%s presents PRPP rather than upstream branding', async (_name, component, text) => {
  await renderSurface(component);
  for (const label of screen.getAllByText(text)) expect(label).toBeVisible();
  expect(document.body).not.toHaveTextContent(/Foo\s*Medical|All rights reserved/i);
});

test.each([['authenticated header', <Header />], ['landing header', <LandingHeader />]] as const)(
  '%s uses the shared PRPP wordmark', async (_name, component) => {
    await renderSurface(component);
    expect(screen.getByRole('img', { name: fullName })).toHaveTextContent(fullName);
  }
);

test('share link label uses PRPP', async () => {
  await renderSurface(<SmartHealthLinksPage />);
  expect(screen.getByLabelText('Label')).toHaveValue('PRPP patient share');
});

test('landing avoids institutional service promises', async () => {
  await renderSurface(<LandingPage />);
  expect(document.body).not.toHaveTextContent(/24\/7 Messaging|Clinically rigorous|No hidden fees|doctor’s office|doctor's office/);
});

// Real components, synthetic SDK session, no backend.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function renderSurface(children: ReactNode) {
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Forbidden network'));
  const client = new MockClient({ seedDefaultData: false });
  client.setProfile({ resourceType: 'Patient', id: 'identity-synthetic', name: [{ text: 'Synthetic Patient' }] });
  await act(async () => {
    render(<MemoryRouter><MantineProvider><MedplumProvider medplum={client}>
      <AppShell>{children}</AppShell>
    </MedplumProvider></MantineProvider></MemoryRouter>);
  });
  expect(network).not.toHaveBeenCalled();
}

test.each([['shared logo', <Logo width={240} />], ['mock logo', <MockApp />]] as const)(
  '%s pairs the approved coqui with readable accessible text', async (_name, component) => {
    await renderSurface(component);
    const logo = screen.getByRole('img', { name: fullName });
    expect(logo).toHaveTextContent(fullName);
    expect(logo.querySelector('img')).toHaveAttribute('src', '/assets/prpp-coqui.png');
    expect(logo.querySelector('img')).toHaveAttribute('alt', '');
  }
);
