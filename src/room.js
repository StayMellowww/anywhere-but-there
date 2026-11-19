const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeRoomCode(randomValues = crypto.getRandomValues(new Uint8Array(4))) {
  return [...randomValues].map(value => LETTERS[value % LETTERS.length]).join('');
}

export function roomPeerId(code) {
  return `anywhere-but-there-${code.toLowerCase()}`;
}

export function readInviteCode(search) {
  const code = new URLSearchParams(search).get('room')?.toUpperCase() || '';
  return /^[A-Z]{4}$/.test(code) ? code : '';
}

export function inviteUrl(currentUrl, code) {
  const url = new URL(currentUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export function groupAnswer(answers) {
  const values = Object.values(answers);
  return values.filter(Boolean).length > values.length / 2;
}
