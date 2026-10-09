// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

export interface LogoProps {
  readonly width: number;
}

// Artwork supplied by Alberto Arias (frontend lead); provenance and derivation documented in docs/PRPP-logo.md.
export function Logo({ width }: LogoProps): JSX.Element {
  return (
    <span
      role="img"
      aria-label="Puerto Rico Patient Portal"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width, maxWidth: '100%',
        color: 'inherit', textAlign: 'left', verticalAlign: 'middle' }}
    >
      <img src="/assets/prpp-coqui.png" alt="" width={651} height={547}
        style={{ display: 'block', width: 48, height: 'auto', flexShrink: 0 }} />
      <span style={{ font: '700 16px/1.2 system-ui, sans-serif', letterSpacing: 'normal' }}>
        Puerto Rico Patient Portal
      </span>
    </span>
  );
}
