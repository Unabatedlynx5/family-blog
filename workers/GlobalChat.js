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
    if (request.method === 'DELETE') {
      return this.cleanupMessages();
    }

    const upgrade = request.headers.get('Upgrade') || '';
    if (upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }
    const [client, server] = new WebSocketPair();
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async cleanupMessages() {
    let deletedCount = 0;
    this.messages = this.messages.filter(msg => {
      const shouldDelete = msg.user === 'Anonymous' || !msg.text || !msg.text.trim();
      if (shouldDelete) deletedCount++;
      return !shouldDelete;
    });

    await this.state.storage.put('messages', this.messages);

    // Broadcast updated history to all connected clients
    const historyMsg = JSON.stringify({ type: 'history', messages: this.messages });
    for (const ws of this.sockets.values()) {
      try { ws.send(historyMsg); } catch (e) {}
    }

    return new Response(JSON.stringify({ deleted: deletedCount, remaining: this.messages.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handleSession(websocket) {
    websocket.accept();
    
    // Send history on connect
    websocket.send(JSON.stringify({ type: 'history', messages: this.messages }));

    const id = crypto.randomUUID();
    this.sockets.set(id, websocket);
    websocket.addEventListener('message', async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        
        if (data.type !== 'message') {
            return;
        }

        const msg = {
          id: crypto.randomUUID(),
          user: data.user || 'Anonymous',
          user_id: data.userId || 'anon', // Map userId from client to user_id for storage/client
          text: data.text || '',
          created_at: Date.now()
        };
        this.messages.push(msg);
        
        // Persist messages (limit to last 100 for now to avoid huge storage costs/latency)
        if (this.messages.length > 100) {
            this.messages = this.messages.slice(-100);
        }
        await this.state.storage.put('messages', this.messages);

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
