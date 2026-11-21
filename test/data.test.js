import test from 'node:test';
import assert from 'node:assert/strict';
import { findRestaurants, overpassEndpoints, overpassQuery, restaurantCards } from '../src/data.js';

test('10 mile search radius is retained in the Overpass query', () => {
  assert.match(overpassQuery(40, -74, 10 * 1609.344), /around:16093,40\.000000,-74\.000000/);
});

test('North American searches use the regional service first', () => {
  assert.match(overpassEndpoints(40, -74)[0], /api-na/);
});

test('deals up to 100 places without collapsing separate branches of a chain', () => {
  const elements = Array.from({ length: 120 }, (_, id) => ({ type: 'node', id, lat: 40 + id * 0.002, lon: -74, tags: { name: 'Cafe', amenity: 'cafe' } }));
  assert.equal(restaurantCards(elements, 40, -74).length, 100);
});
test('Central American searches use a global endpoint', () => {
  assert.match(overpassEndpoints(13.697629, -89.191156)[0], /overpass\.kumi\.systems/);
});

test('an empty regional response falls back to global restaurant data', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    const elements = requests.length === 1 ? [] : [
      { type: 'node', id: 1, lat: 40, lon: -74, tags: { name: 'Cafe', amenity: 'cafe' } }
    ];
    return new Response(JSON.stringify({ elements }), { status: 200 });
  };
  try {
    const cards = await findRestaurants(40, -74, 3219);
    assert.equal(cards[0].name, 'Cafe');
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
