import test from 'node:test';
import assert from 'node:assert/strict';
import { groupAnswer, inviteUrl, makeRoomCode, readInviteCode, roomPeerId } from '../src/room.js';

test('room code is four readable letters and maps to a stable peer ID', () => {
  const code = makeRoomCode(new Uint8Array([0, 1, 2, 3]));
  assert.equal(code, 'ABCD');
  assert.equal(roomPeerId(code), 'anywhere-but-there-abcd');
});

test('group answer requires a strict yes majority', () => {
  assert.equal(groupAnswer({ host: true, guest: false }), false);
  assert.equal(groupAnswer({ host: true, one: true, two: false }), true);
});

test('invite link fills a valid room code and discards unrelated query state', () => {
  const link = inviteUrl('https://example.com/play?old=1#top', 'ABCD');
  assert.equal(link, 'https://example.com/play?room=ABCD');
  assert.equal(readInviteCode(new URL(link).search), 'ABCD');
  assert.equal(readInviteCode('?room=A1CD'), '');
});
