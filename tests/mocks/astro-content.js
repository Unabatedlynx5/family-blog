/**
 * Mock for astro:content module used in tests
 */

export async function getCollection(name) {
  // Return empty collection for tests
  return [];
}

export function defineCollection(config) {
  return config;
}

export function z() {
  return {};
}
