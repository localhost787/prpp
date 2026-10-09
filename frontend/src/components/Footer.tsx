// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Container, Divider, SimpleGrid, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import classes from './Footer.module.css';

export function Footer(): JSX.Element {
  return (
    <footer className={classes.footer}>
      <div className={classes.inner}>
        <Container p="xl">
          <Stack gap="xl">
            <SimpleGrid cols={4}>
              <Anchor href="https://www.medplum.com/docs/tutorials/api-basics/create-fhir-data">Getting started</Anchor>
              <Anchor href="https://www.medplum.com/docs/tutorials">Playing with Medplum</Anchor>
              <Anchor href="https://github.com/localhost787/prpp">Open Source</Anchor>
              <Anchor href="https://www.medplum.com/docs">Documentation</Anchor>
            </SimpleGrid>
            <Divider />
            <Text c="dimmed" size="sm">
              Puerto Rico Patient Portal · Provisional application. Not a medical provider.
            </Text>
          </Stack>
        </Container>
      </div>
    </footer>
  );
}
