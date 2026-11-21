import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../worker/index.js';

function socket(role, id) {
  return { attachment: { role, id, count: 0, windowStart: Date.now() }, sent: [], closed: null,
    deserializeAttachment() { return this.attachment; }, serializeAttachment(value) { this.attachment = value; },
    send(value) { this.sent.push(JSON.parse(value)); }, close(code) { this.closed = code; } };
}
function setup() {
  const host = socket('host', 'h'); const guest = socket('guest', 'g');
  const ctx = { getWebSockets: () => [host, guest], storage: { deleteAlarm: async () => {} } };
  return { host, guest, room: new Room(ctx) };
}
test('room forwards host state to guests and identifies guest votes', async () => {
  const { host, guest, room } = setup();
  await room.webSocketMessage(host, JSON.stringify({ type: 'state', restaurants: [] }));
  assert.equal(guest.sent[0].type, 'state');
  await room.webSocketMessage(guest, JSON.stringify({ type: 'vote', key: 'pizza', yes: true, id: 'spoofed' }));
  assert.deepEqual(host.sent[0], { type: 'vote', id: 'g', key: 'pizza', yes: true });
  await room.webSocketMessage(guest, JSON.stringify({ type: 'state', restaurants: [] }));
  assert.equal(host.sent.length, 1);
});
test('room closes excessive messages and guests when host leaves', async () => {
  const { host, guest, room } = setup();
  await room.webSocketMessage(guest, 'x'.repeat(262145));
  assert.equal(guest.closed, 1009);
  await room.webSocketClose(host, 1000);
  assert.equal(guest.closed, 1000);
});
test('place search validates coordinates and keeps the API key upstream', async () => {
  const app = (await import('../worker/index.js')).default;
  const env = { GEOAPIFY_API_KEY: 'test-secret' };
  assert.equal((await app.fetch(new Request('https://example.com/api/places?lat=91&lon=0&radius=1000'), env)).status, 400);
  const originalFetch = globalThis.fetch;
  let upstream;
  globalThis.fetch = async url => {
    upstream = new URL(url);
    return Response.json({ features: [] });
  };
  try {
    const response = await app.fetch(new Request('https://example.com/api/places?lat=13.69&lon=-89.19&radius=3219'), env);
    assert.equal(response.status, 200);
    assert.equal(upstream.searchParams.get('apiKey'), 'test-secret');
    assert.equal(upstream.searchParams.get('filter'), 'circle:-89.19,13.69,3219');
    assert.equal((await response.text()).includes('test-secret'), false);
  } finally { globalThis.fetch = originalFetch; }
});
