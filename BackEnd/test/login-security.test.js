const test = require('node:test');
const assert = require('node:assert/strict');
const { getLockPolicy, getRemainingSeconds } = require('../src/utils/login-security');

test('aplica los niveles de bloqueo solamente en los umbrales definidos', () => {
  assert.deepEqual(getLockPolicy(1), { administrative: false, seconds: null });
  assert.deepEqual(getLockPolicy(2), { administrative: false, seconds: null });
  assert.deepEqual(getLockPolicy(3), { administrative: false, seconds: 60 });
  assert.deepEqual(getLockPolicy(4), { administrative: false, seconds: null });
  assert.deepEqual(getLockPolicy(5), { administrative: false, seconds: 600 });
  assert.deepEqual(getLockPolicy(6), { administrative: false, seconds: null });
  assert.deepEqual(getLockPolicy(7), { administrative: false, seconds: 3600 });
  assert.deepEqual(getLockPolicy(8), { administrative: false, seconds: null });
  assert.deepEqual(getLockPolicy(9), { administrative: true, seconds: null });
  assert.deepEqual(getLockPolicy(10), { administrative: true, seconds: null });
});

test('calcula segundos restantes sin devolver valores negativos', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');
  assert.equal(getRemainingSeconds('2026-09-21T12:00:59.100Z', now), 60);
  assert.equal(getRemainingSeconds('2026-09-21T11:59:00.000Z', now), 0);
  assert.equal(getRemainingSeconds(null, now), 0);
});
