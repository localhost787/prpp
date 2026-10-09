import test from 'node:test';
import assert from 'node:assert/strict';
const a11y = await import('../src/a11y.mjs').catch(() => ({}));
const visit = { stage: 5, level: 3, cubicle: 12, clinician: 'Ana Ramos', startedAt: '2026-10-09T08:12:00-04:00' };

test('AYO-73 builds the approved Spanish visit speech and speaks with es-PR', () => {
  assert.equal(typeof a11y.speakVisit, 'function');
  const spoken = [];
  class Utterance { constructor(text) { this.text = text; } }
  const speech = { cancelCalls: 0, cancel() { this.cancelCalls += 1; }, speak(item) { spoken.push(item); } };
  const result = a11y.speakVisit({ visit, permissions: { visita: true, estudios: true }, speech, Utterance });
  assert.equal(result, true);
  assert.equal(speech.cancelCalls, 1);
  assert.equal(spoken[0].lang, 'es-PR');
  assert.match(spoken[0].text, /Le están haciendo estudios/);
  assert.match(spoken[0].text, /Qué sigue: Esperar resultados de laboratorio y la radiografía/);
});

test('AYO-73 denies before reading visit data and cancels speech on context cleanup', () => {
  assert.equal(typeof a11y.speakVisit, 'function');
  let reads = 0;
  const options = { permissions: { visita: false }, speech: { speak() { throw new Error('must not speak'); } } };
  Object.defineProperty(options, 'visit', { get() { reads += 1; throw new Error('must not read'); } });
  assert.equal(a11y.speakVisit(options), false);
  assert.equal(reads, 0);
  let canceled = 0;
  a11y.cancelSpeech({ cancel() { canceled += 1; } });
  assert.equal(canceled, 1);
});

test('AYO-73 speech redacts studies when visit is allowed but studies are private', () => {
  const text = a11y.visitSpeechText({ visit, permissions: { visita: true, estudios: false } });
  assert.match(text, /Solo se muestra el estado permitido de la visita/);
  assert.doesNotMatch(text, /estudios|resultados|laboratorio|radiograf/i);
});
