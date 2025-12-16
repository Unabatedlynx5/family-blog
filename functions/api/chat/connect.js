export async function get(context) {
  // Proxy request to the Durable Object instance
  const id = 'GLOBAL_CHAT';
  const objectId = context.env.GLOBAL_CHAT.idFromName(id);
  const obj = context.env.GLOBAL_CHAT.get(objectId);
  return obj.fetch(context.request);
}
