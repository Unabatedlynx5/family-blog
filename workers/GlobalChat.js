export class GlobalChat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // this.sockets = new Map(); // Not needed with Hibernation API
    // No need to load messages from storage anymore
  }

  async fetch(request) {
    if (request.method === 'DELETE') {
      // return this.cleanupMessages();
      return new Response('Not implemented', { status: 501 });
    }

    const upgrade = request.headers.get('Upgrade') || '';
    if (upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }
    
    const pair = new WebSocketPair();
    const [client, server] = pair;
    
    // Use Hibernation API
    this.state.acceptWebSocket(server);
    
    // History is now fetched from D1 via API, so we don't send it here.
    
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      
      if (data.type !== 'message') {
          return;
      }

      const msg = {
        id: crypto.randomUUID(),
        user: data.user || 'Anonymous',
        user_id: data.userId || 'anon',
        user_email: data.email || null,
        text: data.text || '',
        created_at: Date.now()
      };
      
      // Insert into D1
      try {
        await this.env.DB.prepare(
          'INSERT INTO chat_messages (id, user_id, user_name, user_email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(msg.id, msg.user_id, msg.user, msg.user_email, msg.text, msg.created_at)
        .run();
      } catch (err) {
        console.error('Failed to save message to D1:', err);
      }

      // Broadcast
      const broadcastMsg = JSON.stringify({ type: 'message', message: msg });
      for (const client of this.state.getWebSockets()) {
        try { client.send(broadcastMsg); } catch (e) {}
      }
    } catch (e) {}
  }

  async webSocketClose(ws, code, reason, wasClean) {
    // No cleanup needed
  }
  
  async webSocketError(ws, error) {
    // No cleanup needed
  }
}
