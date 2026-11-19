import test from 'node:test';
import assert from 'node:assert/strict';
import { overpassEndpoints, overpassQuery, restaurantCards } from '../src/data.js';

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
