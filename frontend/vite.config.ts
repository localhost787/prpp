// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react(), {
    name: 'provisional-mock-no-external-login',
    transformIndexHtml(html) {
      // Preserve upstream Google login in real mode; no third-party request in mock mode.
      return loadEnv(mode, process.cwd(), 'MEDPLUM_').MEDPLUM_USE_MOCK === 'true'
        ? html.replace('    <script src="https://accounts.google.com/gsi/client" async></script>\n', '')
        : html;
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 3001,
    strictPort: true,
  },
  preview: { host: '127.0.0.1', port: 3001, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test.setup.ts'],
    globals: true,
    testTimeout: 120000,
  },
}));
