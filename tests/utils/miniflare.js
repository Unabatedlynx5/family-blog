
import { Miniflare, Log, LogLevel } from 'miniflare';
import fs from 'node:fs';
import path from 'node:path';

// Load the shared database instance
export async function createTestEnv() {
  const mf = new Miniflare({
    // Enable verbose logging for debugging
    log: new Log(LogLevel.WARN),
    
    workers: [
      {
        name: 'family-blog',
        modules: true,
        // We define the script inline to include the DO classes directly 
        // to simplify the "Integration" setup where the API code expects these to be bound DO Namespaces.
        script: `
          export class GlobalChat {
            constructor(state, env) {
              this.state = state;
              this.env = env;
            }
            async fetch(request) {
               const upgrade = request.headers.get('Upgrade');
               if (upgrade === 'websocket') {
                 // Return 200 to avoid RangeError in test env, but signal success
                 return new Response('WebSocket Upgraded', { status: 200 }); 
               }
               return new Response('Chat DO');
            }
          }

          export class PostRoom {
             async fetch() { return new Response('PostRoom'); }
          }
        
          export default {
            async fetch(request, env, ctx) {
              return new Response("This is the main worker mock entry");
            }
          }
        `,
        // Bindings available to the main worker
        d1Databases: {
          DB: 'db-shared' 
        },
        r2Buckets: ['MEDIA'],
        durableObjects: {
            // Bind usage to local classes
            GLOBAL_CHAT: 'GlobalChat',
            POST_ROOM: 'PostRoom'
        },
        secrets: {
           JWT_SECRET: 'test-jwt-secret',
           ADMIN_API_KEY: 'test-admin-key'
        }
      }
    ],
    
    // Disable persistence to prevent SQLITE_BUSY locks during parallel tests
    d1Persist: false,
    r2Persist: false
  });

  return mf;
}

export async function getTestEnv(mf) {
  try {
    return await mf.getBindings();
  } catch(e) {
    console.warn("mf.getBindings() failed, trying worker specific:", e.message);
    const worker = await mf.getWorker('family-blog');
    return await worker.getBindings();
  }
}
