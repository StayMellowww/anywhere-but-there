const yesNo = value => ['yes', 'no', 'only', 'limited'].includes(value);
const available = value => ['yes', 'only', 'limited'].includes(value);

const FEATURES = [
  ...[
    ['vegan', 'Need listed vegan options?'],
    ['vegetarian', 'Need listed vegetarian options?'],
    ['gluten_free', 'Need listed gluten-free options?'],
    ['lactose_free', 'Need listed lactose-free options?'],
    ['nut_free', 'Need listed nut-free options?'],
    ['halal', 'Need listed halal options?'],
    ['kosher', 'Need listed kosher options?'],
  ].map(([diet, question]) => ({ key: `diet:${diet}`, question, priority: 1, strictYes: true, known: t => yesNo(t[`diet:${diet}`]), match: t => available(t[`diet:${diet}`]) })),
  { key: 'price', question: 'Prefer places tagged as lower-priced ($ or $$)?', priority: 2, strictYes: true, known: t => priceBand(t) !== null, match: t => priceBand(t) <= 2 },
  { key: 'outdoor_seating', question: 'Want outdoor seating?', priority: 3, known: t => ['yes', 'no'].includes(t.outdoor_seating), match: t => t.outdoor_seating === 'yes' },
  { key: 'indoor_seating', question: 'Want a place with indoor seating?', priority: 3, known: t => ['yes', 'no'].includes(t.indoor_seating), match: t => t.indoor_seating === 'yes' },
  { key: 'wheelchair', noPreference: true, question: 'Need a place listed as wheelchair accessible?', priority: 2, strictYes: true, known: t => ['yes', 'no', 'limited'].includes(t.wheelchair), match: t => t.wheelchair === 'yes' },
  { key: 'reservation', question: 'Want a place that takes reservations?', priority: 4, known: t => ['yes', 'no', 'required', 'recommended'].includes(t.reservation), match: t => ['yes', 'required', 'recommended'].includes(t.reservation) },
  { key: 'breakfast', question: 'Looking for breakfast?', priority: 2, known: t => ['yes', 'no'].includes(t.breakfast), match: t => t.breakfast === 'yes' },
  { key: 'lunch', question: 'Looking for lunch?', priority: 2, known: t => ['yes', 'no'].includes(t.lunch), match: t => t.lunch === 'yes' },
  { key: 'dinner', question: 'Looking for dinner?', priority: 2, known: t => ['yes', 'no'].includes(t.dinner), match: t => t.dinner === 'yes' },
  { key: 'dog', question: 'Bringing a dog?', priority: 4, known: t => ['yes', 'no'].includes(t.dog), match: t => t.dog === 'yes' },
  { key: 'takeaway', question: 'Want to take the food home?', priority: 4, known: t => yesNo(t.takeaway), match: t => available(t.takeaway) },
  { key: 'delivery', question: 'Need delivery?', priority: 4, known: t => yesNo(t.delivery), match: t => available(t.delivery) },
  { key: 'drive_through', question: 'Need a drive-thru?', priority: 5, known: t => ['yes', 'no'].includes(t.drive_through), match: t => t.drive_through === 'yes' },
];

export function priceBand(tags) {
  const raw = [tags['price:range'], tags.price_range, tags.price_level].find(Boolean)?.trim().toLowerCase();
  if (!raw) return null;
  if (/^\${1,4}$/.test(raw)) return raw.length;
  if (/^[1-4]$/.test(raw)) return Number(raw);
  return null;
}

const CUISINE_GROUPS = {
  Asian: ['asian', 'chinese', 'japanese', 'sushi', 'thai', 'vietnamese', 'korean', 'indian', 'indonesian', 'ramen', 'noodle'],
  Mexican: ['mexican', 'tex-mex', 'taco'],
};
const cuisineValues = tags => (tags.cuisine || '').toLowerCase().replaceAll('_', ' ').split(/[;,]/).map(v => v.trim());

export function questionsFor(restaurants, answers = []) {
  const candidates = [...FEATURES];
  const distances = [1, 2, 5].map(miles => ({ key: `distance:${miles}`, question: `Keep it within ${miles} ${miles === 1 ? 'mile' : 'miles'}?`, priority: 3, known: () => true, match: (_tags, r) => r.distance <= miles }));
  const distanceQuestion = distances.map(feature => ({ feature, balance: Math.min(restaurants.filter(r => feature.match(r.tags, r)).length, restaurants.filter(r => !feature.match(r.tags, r)).length) })).sort((a, b) => b.balance - a.balance)[0];
  if (distanceQuestion?.balance > 0) candidates.push(distanceQuestion.feature);
  const cuisines = new Map();
  for (const r of restaurants) for (const raw of [r.tags.cuisine || '', ...(r.tags.amenity === 'cafe' ? ['cafe'] : [])].flatMap(value => value.split(/[;,]/))) {
    const cuisine = raw.trim().toLowerCase().replaceAll('_', ' ');
    if (cuisine) cuisines.set(cuisine, (cuisines.get(cuisine) || 0) + 1);
  }
  const commonCuisines = new Set(['burger', 'pizza', 'cafe', 'mexican', 'tex-mex', 'sushi', 'barbecue', 'chinese', 'italian', 'sandwich', 'american', 'chicken']);
  for (const [group, members] of Object.entries(CUISINE_GROUPS)) {
    const count = restaurants.filter(r => cuisineValues(r.tags).some(c => members.includes(c))).length;
    if (count && !answers.some(a => a.key === `group:${group}`)) candidates.push({ key: `group:${group}`, question: `In the mood for ${group}?`, priority: -1, strictYes: true, known: t => Boolean(t.cuisine), match: t => cuisineValues(t).some(c => members.includes(c)) });
  }
  for (const [cuisine, count] of cuisines) {
    if (CUISINE_GROUPS.Mexican.includes(cuisine) || cuisine === 'asian') continue;
    candidates.push({ key: `cuisine:${cuisine}`, question: `In the mood for ${cuisine}?`, priority: 0, cuisineCount: count, commonCuisine: commonCuisines.has(cuisine), strictYes: true, known: t => Boolean(t.cuisine) || (cuisine === 'cafe' && Boolean(t.amenity)), match: t => (cuisine === 'cafe' && t.amenity === 'cafe') || (t.cuisine || '').split(/[;,]/).some(v => v.trim().toLowerCase().replaceAll('_', ' ') === cuisine) });
  }
  return candidates.map(feature => {
    const known = restaurants.filter(r => feature.known(r.tags, r));
    const yes = known.filter(r => feature.match(r.tags, r)).length;
    return { ...feature, knownCount: known.length, balance: Math.min(yes, known.length - yes), yesCount: yes };
  }).filter(feature => feature.yesCount > 0 && ((feature.key.startsWith('cuisine:') || feature.key.startsWith('group:')) || ((feature.balance > 0 || (feature.strictYes && feature.knownCount < restaurants.length)) && feature.knownCount >= (feature.strictYes ? 1 : Math.max(2, Math.ceil(restaurants.length * 0.2))))))
    .sort((a, b) => a.priority - b.priority || (Number(b.commonCuisine || false) - Number(a.commonCuisine || false)) || (b.cuisineCount || 0) - (a.cuisineCount || 0) || b.balance - a.balance || a.key.localeCompare(b.key));
}

export function applyAnswer(restaurants, eliminated, question, wantsYes) {
  const active = restaurants.filter(r => !eliminated.has(r.id));
  if (!wantsYes && question.noPreference) return { eliminated: new Set(eliminated), dimmed: new Set() };
  const strict = wantsYes && question.strictYes;
  const mismatches = active.filter(r => strict ? !question.match(r.tags, r) : question.known(r.tags, r) && question.match(r.tags, r) !== wantsYes);
  return { eliminated: new Set([...eliminated, ...mismatches.map(r => r.id)]), dimmed: new Set() };
}

export function showdownFor(active) {
  if (active.length < 2) return null;
  const [first, second] = active;
  return { key: `showdown:${first.id}:${second.id}`, question: 'Which one wins this round?', first, second };
}
