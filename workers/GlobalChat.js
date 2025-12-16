export class GlobalChat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Map();
    this.state.blockConcurrencyWhile(async () => {
      this.messages = (await state.storage.get('messages')) || [];
    });
  }

  async fetch(request) {
    const upgrade = request.headers.get('Upgrade') || '';
    if (upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }
    const [client, server] = new WebSocketPair();
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(websocket) {
    websocket.accept();
    const id = crypto.randomUUID();
    this.sockets.set(id, websocket);
    websocket.addEventListener('message', (evt) => {
      try {
        const data = JSON.parse(evt.data);
        const msg = {
          id: crypto.randomUUID(),
          user_id: data.user_id || 'anon',
          text: data.text || '',
          created_at: Date.now()
        };
        this.messages.push(msg);
        // broadcast
        for (const [k, ws] of this.sockets.entries()) {
          try { ws.send(JSON.stringify({ type: 'message', message: msg })); } catch (e) {}
        }
      } catch (e) {}
    });
    websocket.addEventListener('close', () => {
      this.sockets.delete(id);
    });
  }
}
