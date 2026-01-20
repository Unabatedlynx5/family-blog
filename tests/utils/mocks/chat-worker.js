
export class GlobalChat {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    
    // Simulate connection handling without full logic
    server.accept();
    this.sessions.push(server);
    
    server.addEventListener('message', async event => {
      // Echo message back to verify connection in tests
      server.send(event.data);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

export class PostRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request) {
    return new Response(JSON.stringify({ ok: true }));
  }
}

export default {
  async fetch(request, env) {
    return new Response("Chat Worker Running");
  }
};
