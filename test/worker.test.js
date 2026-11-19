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
