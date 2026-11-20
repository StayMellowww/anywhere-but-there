import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, priceBand, questionsFor, showdownFor } from '../src/traits.js';

test('unknown tags stay in play for ordinary questions', () => {
  const rows = [
    { id: 'a', tags: { amenity: 'restaurant', takeaway: 'yes' } },
    { id: 'b', tags: { amenity: 'fast_food', takeaway: 'no' } },
    { id: 'c', tags: { amenity: 'cafe' } },
    { id: 'd', tags: { amenity: 'restaurant' } },
    { id: 'e', tags: { amenity: 'restaurant' } },
  ];
  const question = questionsFor(rows).find(item => item.key === 'takeaway');
  assert.ok(question);
  const result = applyAnswer(rows, new Set(), question, true);
  assert.deepEqual([...result.eliminated], ['b']);
  assert.equal(result.eliminated.has('c'), false);
  assert.equal(result.eliminated.has('d'), false);
  const reverse = applyAnswer(rows, new Set(), question, false);
  assert.equal(reverse.eliminated.size, 1);
});

test('food questions lead, with distinct service questions after them', () => {
  const rows = [
    { id: 'a', tags: { cuisine: 'pizza', takeaway: 'yes', amenity: 'fast_food' } },
    { id: 'b', tags: { cuisine: 'pizza', takeaway: 'no', amenity: 'restaurant' } },
    { id: 'c', tags: { cuisine: 'sushi', takeaway: 'yes', amenity: 'fast_food' } },
    { id: 'd', tags: { cuisine: 'sushi', takeaway: 'no', amenity: 'restaurant' } },
  ];
  const keys = questionsFor(rows).map(item => item.key);
  assert.ok(keys[0].startsWith('cuisine:') || keys[0].startsWith('group:'));
  assert.ok(keys.includes('takeaway'));
  assert.equal(keys.includes('amenity'), false);
});

test('a required listed diet removes places with unknown diet tags', () => {
  const rows = [
    { id: 'a', tags: { 'diet:gluten_free': 'yes' } },
    { id: 'b', tags: { 'diet:gluten_free': 'no' } },
    { id: 'c', tags: {} },
    { id: 'd', tags: {} },
    { id: 'e', tags: {} },
  ];
  const question = questionsFor(rows).find(item => item.key === 'diet:gluten_free');
  assert.ok(question);
  assert.deepEqual([...applyAnswer(rows, new Set(), question, true).eliminated], ['b', 'c', 'd', 'e']);
});

test('price prompt only uses explicit price tier tags', () => {
  assert.equal(priceBand({ price_range: '$$' }), 2);
  assert.equal(priceBand({ price_level: '3' }), 3);
  assert.equal(priceBand({ amenity: 'fast_food' }), null);
});

test('distance, seating, and meal prompts appear when they divide the board', () => {
  const rows = [
    { id: 'a', distance: 0.5, tags: { indoor_seating: 'yes', breakfast: 'yes' } },
    { id: 'b', distance: 0.8, tags: { indoor_seating: 'yes', breakfast: 'yes' } },
    { id: 'c', distance: 4, tags: { indoor_seating: 'no', breakfast: 'no' } },
    { id: 'd', distance: 6, tags: { indoor_seating: 'no', breakfast: 'no' } },
  ];
  const keys = questionsFor(rows).map(item => item.key);
  assert.ok(keys.some(key => key.startsWith('distance:')));
  assert.ok(keys.includes('indoor_seating'));
  assert.ok(keys.includes('breakfast'));
});

test('remaining places can enter a head-to-head showdown', () => {
  const rows = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  assert.equal(showdownFor(rows).first.id, 'a');
  assert.equal(showdownFor(rows).second.id, 'b');
  assert.equal(showdownFor(rows.slice(0, 1)), null);
});


test('cafe answers include amenity tags and burger yes requires a listed match', () => {
  const rows = [
    { id: 'a', tags: { amenity: 'cafe' } }, { id: 'b', tags: { amenity: 'cafe' } },
    { id: 'c', tags: { cuisine: 'burger' } }, { id: 'd', tags: { cuisine: 'burger' } },
    { id: 'e', tags: { amenity: 'restaurant' } },
  ];
  const cafe = questionsFor(rows).find(q => q.key === 'cuisine:cafe');
  const afterCafe = applyAnswer(rows, new Set(), cafe, false);
  assert.deepEqual([...afterCafe.eliminated], ['a', 'b']);
  const burger = questionsFor(rows).find(q => q.key === 'cuisine:burger');
  assert.ok(applyAnswer(rows, afterCafe.eliminated, burger, true).eliminated.has('e'));
});

test('declining an accessibility requirement does not exclude accessible places', () => {
  const rows = [{ id: 'a', tags: { wheelchair: 'yes' } }, { id: 'b', tags: { wheelchair: 'no' } }];
  const question = questionsFor(rows).find(q => q.key === 'wheelchair');
  assert.equal(applyAnswer(rows, new Set(), question, false).eliminated.size, 0);
});


test('an answer can eliminate the last restaurant', () => {
  const rows = [{ id: 'last', tags: { cuisine: 'burger' } }];
  const question = { known: t => Boolean(t.cuisine), match: t => t.cuisine === 'burger' };
  assert.deepEqual([...applyAnswer(rows, new Set(), question, false).eliminated], ['last']);
});


test('single-restaurant cuisines are asked, with common cuisines before niche ones', () => {
  const rows = [
    { id: 'a', tags: { cuisine: 'fine_dining' } },
    { id: 'b', tags: { cuisine: 'tex-mex' } },
    { id: 'c', tags: { cuisine: 'sushi' } },
    { id: 'd', tags: { cuisine: 'barbecue' } },
    { id: 'e', tags: {} },
  ];
  const questions = questionsFor(rows);
  for (const cuisine of ['sushi', 'barbecue', 'fine dining']) assert.ok(questions.some(q => q.key === `cuisine:${cuisine}`));
  assert.ok(questions.findIndex(q => q.key === 'cuisine:sushi') < questions.findIndex(q => q.key === 'cuisine:fine dining'));
  assert.deepEqual([...applyAnswer(rows, new Set(), questions.find(q => q.key === 'cuisine:sushi'), false).eliminated], ['c']);
  assert.ok(questionsFor([{ id: 'one', tags: { cuisine: 'sushi' } }]).some(q => q.key === 'cuisine:sushi'));
});


test('Asian group filters to listed matches and allows specific follow-up', () => {
  const rows = [{ id: 'a', tags: { cuisine: 'chinese' } }, { id: 'b', tags: { cuisine: 'sushi' } }, { id: 'c', tags: { cuisine: 'pizza' } }];
  const group = questionsFor(rows).find(q => q.key === 'group:Asian');
  const result = applyAnswer(rows, new Set(), group, true);
  assert.deepEqual([...result.eliminated], ['c']);
  const next = questionsFor(rows.filter(r => !result.eliminated.has(r.id)), [{ key: group.key }]);
  assert.ok(next.some(q => q.key === 'cuisine:chinese'));
  assert.ok(next.some(q => q.key === 'cuisine:sushi'));
});


test('Mexican and Tex-Mex use one combined question', () => {
  const rows = [{ id: 'a', tags: { cuisine: 'mexican' } }, { id: 'b', tags: { cuisine: 'tex-mex' } }, { id: 'c', tags: { cuisine: 'sushi' } }];
  const questions = questionsFor(rows);
  const group = questions.find(q => q.key === 'group:Mexican');
  assert.ok(group);
  assert.deepEqual([...applyAnswer(rows, new Set(), group, false).eliminated], ['a', 'b']);
  assert.ok(!questions.some(q => ['cuisine:mexican', 'cuisine:tex-mex'].includes(q.key)));
});


test('Asian group covers generic Asian tags without repeating the question, while keeping specific cuisines', () => {
  const rows = [{ id: 'a', tags: { cuisine: 'asian' } }, { id: 'b', tags: { cuisine: 'chinese' } }, { id: 'c', tags: { cuisine: 'sushi' } }];
  const first = questionsFor(rows);
  const group = first.find(q => q.key === 'group:Asian');
  assert.ok(group);
  assert.ok(!first.some(q => q.key === 'cuisine:asian'));
  const yes = applyAnswer(rows, new Set(), group, true);
  assert.equal(yes.eliminated.size, 0);
  const next = questionsFor(rows, [{ key: 'group:Asian', answer: 'Yes' }]);
  assert.ok(!next.some(q => q.key === 'group:Asian' || q.key === 'cuisine:asian'));
  assert.ok(next.some(q => q.key === 'cuisine:chinese'));
  assert.ok(next.some(q => q.key === 'cuisine:sushi'));
  assert.equal(applyAnswer(rows, new Set(), group, false).eliminated.size, 3);
});
