import test from 'node:test';
import assert from 'node:assert/strict';

const wait = await import('../src/wait/wait.mjs').catch(() => ({}));

test('AYO-85 presents only explicit wait fields for the two authorized synthetic stages', () => {
  assert.equal(typeof wait.createWaitModel, 'function', 'missing wait model');
  const triage = wait.createWaitModel({ language: 'es', state: 'ready', ...wait.WAIT_FIXTURES.afterTriage });
  assert.equal(triage.status, 'ready');
  assert.equal(triage.card.triageLevel, 3);
  assert.equal(triage.card.peopleAhead, 6);
  assert.equal(triage.card.estimatedWait, '45–60 min');
  assert.equal(triage.card.heading, '¿Por qué espero?');
  assert.doesNotMatch(JSON.stringify(triage), /\bESI\b/);

  const samples = wait.createWaitModel({ language: 'en', state: 'ready', ...wait.WAIT_FIXTURES.afterSamples });
  assert.equal(samples.status, 'ready');
  assert.equal(samples.card.peopleAhead, 3);
  assert.equal(samples.card.estimatedWait, '20–30 min');
});

test('AYO-85 missing people-ahead is empty/not-applicable and never retains a previous card', () => {
  const model = wait.createWaitModel({
    language: 'en',
    state: 'ready',
    stage: 'cubicle',
    task: { triageLevel: 3, estimatedWait: '45–60 min' },
  });
  assert.equal(model.status, 'empty');
  assert.equal(model.card, null);
});

test('AYO-85 controller clears on context change and ignores a late wait response', async () => {
  assert.equal(typeof wait.createWaitController, 'function', 'missing wait controller');
  let release;
  const controller = wait.createWaitController(() => new Promise(resolve => { release = resolve; }));
  const pending = controller.open('session-1/carmen', { language: 'en' });
  assert.equal(controller.getSnapshot().status, 'loading');

  controller.changeContext('session-2/lourdes');
  assert.equal(controller.getSnapshot().status, 'empty');
  assert.equal(controller.getSnapshot().card, null);

  release(wait.WAIT_FIXTURES.afterTriage);
  await pending;
  assert.equal(controller.getSnapshot().status, 'empty');
  assert.equal(controller.getSnapshot().card, null);
});

test('AYO-85 loading, technical error, and explicit empty remain distinct without a card', () => {
  for (const state of ['loading', 'error', 'empty']) {
    const model = wait.createWaitModel({ language: 'en', state, ...wait.WAIT_FIXTURES.afterTriage });
    assert.equal(model.status, state);
    assert.equal(model.card, null);
  }
});
