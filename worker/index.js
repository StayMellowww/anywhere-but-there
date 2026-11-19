const MAX_CLIENTS = 8;
const MAX_MESSAGE = 262144;
const MAX_ROOM_MS = 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z]{4})$/);
    if (!match) return env.ASSETS.fetch(request);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const origin = request.headers.get('Origin');
    if (origin !== url.origin) return new Response('Forbidden', { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
};

export class Room {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    if (role !== 'host' && role !== 'guest') return new Response('Invalid role', { status: 400 });
    const sockets = this.ctx.getWebSockets();
    const host = sockets.find(ws => ws.deserializeAttachment()?.role === 'host');
    if (role === 'host' && host) return new Response('Room in use', { status: 409 });
    if (role === 'guest' && !host) return new Response('Room not found', { status: 404 });
    if (sockets.length >= MAX_CLIENTS) return new Response('Room full', { status: 429 });
    const pair = new WebSocketPair();
    const server = pair[1];
    const id = crypto.randomUUID();
    server.serializeAttachment({ role, id, count: 0, windowStart: Date.now() });
    this.ctx.acceptWebSocket(server);
    if (role === 'host') await this.ctx.storage.setAlarm(Date.now() + MAX_ROOM_MS);
    server.send(JSON.stringify({ type: 'ready', role, id }));
    if (role === 'guest') host.send(JSON.stringify({ type: 'guest-joined', id }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws, raw) {
    const meta = ws.deserializeAttachment();
    if (!meta || typeof raw !== 'string' || raw.length > MAX_MESSAGE) { ws.close(1009, 'Message too large'); return; }
    const now = Date.now();
    if (now - meta.windowStart >= 10000) { meta.windowStart = now; meta.count = 0; }
    meta.count++; ws.serializeAttachment(meta);
    if (meta.count > 50) { ws.close(1008, 'Too many messages'); return; }
    let message; try { message = JSON.parse(raw); } catch { return; }
    const sockets = this.ctx.getWebSockets();
    if (meta.role === 'host' && message?.type === 'state') {
      const payload = JSON.stringify(message);
      for (const guest of sockets.filter(s => s.deserializeAttachment()?.role === 'guest')) guest.send(payload);
    } else if (meta.role === 'guest' && message?.type === 'vote' && typeof message.yes === 'boolean' && typeof message.key === 'string' && message.key.length <= 200) {
      const host = sockets.find(s => s.deserializeAttachment()?.role === 'host');
      if (host) host.send(JSON.stringify({ type: 'vote', id: meta.id, key: message.key, yes: message.yes }));
    }
  }
  async webSocketClose(ws, code) {
    const meta = ws.deserializeAttachment();
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'Closed'); } catch {}
    const others = this.ctx.getWebSockets().filter(s => s !== ws);
    if (meta?.role === 'host') {
      for (const guest of others) { try { guest.close(1000, 'Host left'); } catch {} }
      await this.ctx.storage.deleteAlarm();
    } else {
      const host = others.find(s => s.deserializeAttachment()?.role === 'host');
      if (host) host.send(JSON.stringify({ type: 'guest-left', id: meta?.id }));
    }
  }
  async webSocketError(ws) { try { ws.close(1011, 'Connection error'); } catch {} }
  async alarm() { for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'Room expired'); } catch {} } }
}
