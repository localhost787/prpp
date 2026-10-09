import test from 'node:test';
import assert from 'node:assert/strict';

const notices = await import('../src/notices/notices.mjs').catch(() => ({}));

test('AYO-69 sorts authorized rows newest-first and formats existing sent times in Puerto Rico', () => {
  assert.equal(typeof notices.createNoticesModel, 'function', 'missing notices model');
  const communications = [
    { id: 'older', sent: '2026-10-09T12:12:00Z', text: 'Synthetic arrival notice' },
    { id: 'no-time', sent: null, text: 'Synthetic notice without time' },
    { id: 'newer', sent: '2026-10-09T13:05:00Z', text: 'Synthetic cubicle notice' },
  ];
  const model = notices.createNoticesModel({ language: 'en', state: 'ready', permission: true, communications });
  assert.equal(model.status, 'ready');
  assert.deepEqual(model.items.map(item => item.id), ['newer', 'older', 'no-time']);
  assert.equal(model.items[0].time, '9:05 AM');
  assert.equal(model.items[1].time, '8:12 AM');
  assert.equal(model.items[2].time, null);
  assert.deepEqual(model.items.map(item => item.text), ['Synthetic cubicle notice', 'Synthetic arrival notice', 'Synthetic notice without time']);
});

test('AYO-69 restriction fails before reading rows and never invents a neutral notice', () => {
  let reads = 0;
  const input = { language: 'es', state: 'ready', permission: false };
  Object.defineProperty(input, 'communications', { get() { reads += 1; throw new Error('must not read'); } });
  const model = notices.createNoticesModel(input);
  assert.equal(reads, 0);
  assert.equal(model.status, 'restricted');
  assert.deepEqual(model.items, []);
  assert.doesNotMatch(JSON.stringify(model), /resultado nuevo|neutral/i);
});

test('AYO-69 unread count resets locally on open and context changes discard late rows', async () => {
  assert.equal(typeof notices.createNoticesController, 'function', 'missing notices controller');
  let release;
  const controller = notices.createNoticesController(() => new Promise(resolve => { release = resolve; }));
  const pending = controller.load('account-1/carmen/patient/session-1', { language: 'en', permission: true });
  assert.equal(controller.getSnapshot().status, 'loading');

  controller.changeContext('account-2/carmen/delegate/session-2');
  assert.equal(controller.getSnapshot().unreadCount, 0);
  assert.deepEqual(controller.getSnapshot().items, []);

  release([{ id: 'late', sent: '2026-10-09T13:05:00Z', text: 'Late old-context notice' }]);
  await pending;
  assert.deepEqual(controller.getSnapshot().items, []);

  const immediate = notices.createNoticesController(async () => notices.SYNTHETIC_NOTICE_FIXTURE);
  await immediate.load('account-1/carmen/patient/session-3', { language: 'en', permission: true });
  assert.equal(immediate.getSnapshot().unreadCount, 3);
  immediate.markOpen();
  assert.equal(immediate.getSnapshot().unreadCount, 0);
});

test('AYO-69 malformed sent values stay unknown and sort after dated rows', () => {
  const model = notices.createNoticesModel({
    state: 'ready',
    permission: true,
    communications: [
      { id: 'bad-date', sent: 'not-a-date', text: 'Synthetic unknown-time notice' },
      { id: 'dated', sent: '2026-10-09T13:05:00Z', text: 'Synthetic dated notice' },
    ],
  });
  assert.deepEqual(model.items.map(item => item.id), ['dated', 'bad-date']);
  assert.equal(model.items[1].sent, null);
  assert.equal(model.items[1].time, null);
});
