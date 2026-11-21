const GLOBAL_OVERPASS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function overpassEndpoints(lat, lon) {
  if (lat >= 25 && lat <= 84 && lon >= -169 && lon <= -50) return ['https://ovp.dresel.systems/api-na/interpreter', ...GLOBAL_OVERPASS];
  if (lat >= 34 && lat <= 72 && lon >= -12 && lon <= 45) return ['https://ovp.dresel.systems/api/interpreter', ...GLOBAL_OVERPASS];
  return GLOBAL_OVERPASS;
}

export function overpassQuery(lat, lon, radiusMeters) {
  const radius = Math.min(16094, Math.max(500, Math.round(radiusMeters)));
  const point = `around:${radius},${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  return `[out:json][timeout:18];(nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"](${point}););out center tags;`;
}

async function requestJson(url, options, timeoutMs, service) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${service} failed (HTTP ${response.status}). Try again shortly.`);
    return await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error(`${service} timed out. Try again or choose a smaller radius.`);
    if (error instanceof TypeError) throw new Error(`${service} could not connect. Check your connection and try again.`);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export async function findPlace(query, signal) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', ...(/^\d{5}(?:-\d{4})?$/.test(query) ? { countrycodes: 'us' } : {}) });
  const [place] = await requestJson(url, { signal, headers: { Accept: 'application/json' } }, 10000, 'Location search');
  if (!place) throw new Error('No location found. Try a city and state or a ZIP code.');
  return { lat: Number(place.lat), lon: Number(place.lon), label: place.display_name.split(',').slice(0, 2).join(',') };
}

export async function findRestaurants(lat, lon, radiusMeters, signal) {
  let foundEmpty = false;
  let lastError;
  for (const endpoint of overpassEndpoints(lat, lon)) {
    try {
      const json = await requestJson(endpoint, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: overpassQuery(lat, lon, radiusMeters) }),
      }, 18000, 'Restaurant search');
      if (!Array.isArray(json.elements)) throw new Error('Restaurant search returned an invalid response. Try again.');
      const cards = restaurantCards(json.elements, lat, lon);
      if (cards.length) return cards;
      foundEmpty = true;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  if (foundEmpty) return [];
  throw new Error('Restaurant search is unavailable. Try again.');
}

export function restaurantCards(elements, lat, lon) {
  const results = elements.map(element => {
    const tags = element.tags || {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (!tags.name || latitude == null || longitude == null) return null;
    const distance = haversine(lat, lon, latitude, longitude);
    return { id: `${element.type}/${element.id}`, name: tags.name, tags, lat: latitude, lon: longitude, distance };
  }).filter(Boolean);
  const seen = new Set();
  return results.sort((a, b) => a.distance - b.distance).filter(item => {
    const key = `${item.name.toLowerCase()}|${item.lat.toFixed(3)}|${item.lon.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 100);
}

function haversine(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
