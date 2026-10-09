import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const services = await import('../src/services/services.mjs').catch(() => ({}));
const { CARE_DICTIONARIES } = await import('../src/care/care.mjs');
test('general directory identifies example origin and care heading identifies people', () => {
 assert.match(services.SERVICES_DICTIONARIES.en.directoryNotice, /General fictional directory/);
 assert.match(services.SERVICES_DICTIONARIES.es.directoryNotice, /Directorio general ficticio/);
 assert.match(services.SERVICES_DICTIONARIES.en.distance, /example origin/);
 assert.match(services.SERVICES_DICTIONARIES.es.distance, /origen de ejemplo/);
 assert.equal(CARE_DICTIONARIES.en.teamTitle, 'Who is caring for you');
 assert.equal(CARE_DICTIONARIES.es.teamTitle, 'Quién le atiende');
});

test('synthetic directory preserves only documented service facts', () => {
  assert.ok(Array.isArray(services.SYNTHETIC_SERVICES), 'missing isolated services fixture');
  assert.equal(services.SYNTHETIC_SERVICES.length, 4);

  const distances = services.SYNTHETIC_SERVICES.map(service => service.distanceKm);
  assert.deepEqual(distances, [3.2, 14.8, null, 2.1]);

  for (const service of services.SYNTHETIC_SERVICES) {
    assert.equal(service.estimatedWait, null);
    assert.equal(service.acceptsPlan, null);
  }
});

test('loading, error, and confirmed empty remain distinct states in both languages', () => {
  assert.equal(typeof services.createServicesModel, 'function', 'missing services state model');

  const cases = [
    ['en', 'loading', 'Loading services…'],
    ['en', 'error', 'We could not load services.'],
    ['en', 'empty', 'No services loaded'],
    ['es', 'loading', 'Cargando servicios…'],
    ['es', 'error', 'No pudimos cargar los servicios.'],
    ['es', 'empty', 'No hay servicios cargados'],
  ];

  for (const [language, state, expectedMessage] of cases) {
    const model = services.createServicesModel({ language, state, services: [] });
    assert.equal(model.language, language);
    assert.equal(model.state, state);
    assert.equal(model.message, expectedMessage);
    assert.deepEqual(model.items, []);
  }
});

test('list localizes names while preserving unknown fields and documented distances', () => {
  const english = services.createServicesModel({ language: 'en', state: 'list' });
  const spanish = services.createServicesModel({ language: 'es', state: 'list' });

  assert.equal(english.items.length, 4);
  assert.equal(spanish.items.length, 4);
  assert.equal(english.items[0].name, 'Demo Hospital Emergency Department');
  assert.equal(spanish.items[0].name, 'Emergencias del Hospital Demo');
  assert.equal(spanish.items[3].name, 'Dra. Ana Colón, médico primario');
  assert.equal(english.items[2].distanceKm, null);
  assert.equal(english.items[2].estimatedWait, null);
  assert.equal(english.items[2].acceptsPlan, null);
  assert.equal(english.copy.notDocumented, 'Not documented');
  assert.equal(spanish.copy.notDocumented, 'No documentado');
});

test('panel contract exposes isolated states, retry, shared tokens, and no location integration', async () => {
  const source = await readFile(new URL('../src/services/ServicesPanel.jsx', import.meta.url), 'utf8');

  assert.match(source, /function ServicesPanel\(\{[\s\S]*language[\s\S]*textScale[\s\S]*state[\s\S]*services[\s\S]*onRetry/);
  assert.match(source, /createServicesModel/);
  assert.match(source, /\.\.\.surfaceStyles\.card/);
  assert.match(source, /<Action/);
  assert.doesNotMatch(source, /<Pressable/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /onPress=\{onRetry\}/);
  assert.doesNotMatch(source, /geolocation|MapView|useSearchResources|searchResources/);
});
