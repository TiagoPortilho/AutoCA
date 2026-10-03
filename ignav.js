import { CONFIG } from './config.js';

const BASE = 'https://ignav.com/api';

// Headers conhecidos de quota — atualizado a cada chamada bem-sucedida
let lastQuota = null;

export function getLastQuota() { return lastQuota; }

function parseQuota(headers) {
  const remaining = headers.get('x-ratelimit-remaining')
    ?? headers.get('x-quota-remaining')
    ?? headers.get('x-credits-remaining')
    ?? headers.get('x-requests-remaining')
    ?? headers.get('ratelimit-remaining');
  if (remaining === null) return;
  const limit = headers.get('x-ratelimit-limit')
    ?? headers.get('x-quota-limit')
    ?? headers.get('x-credits-limit');
  lastQuota = { remaining: +remaining, ...(limit ? { limit: +limit } : {}) };
}

async function post(path, body, { timeout = 30_000, maxRetries = 1 } = {}, attempt = 0) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.IGNAV_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });

  if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
    await new Promise(r => setTimeout(r, 5000));
    return post(path, body, { timeout, maxRetries }, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`Ignav ${res.status}: ${text}`), { status: res.status });
  }

  parseQuota(res.headers);
  return res.json();
}

export function searchRoundTrip(trip) {
  return post('/fares/round-trip', {
    origin: CONFIG.origin,
    destination: CONFIG.destination,
    departure_date: trip.out,
    return_date: trip.ret,
    adults: CONFIG.adults,
    market: CONFIG.market,
    airlines_include: CONFIG.airlines,
    max_stops: CONFIG.maxStops,
    max_price: CONFIG.maxPriceBRL,
    allow_self_transfer: false,
  });
}

export function getBookingLinks(ignavId) {
  return post(
    '/fares/booking-links',
    { ignav_id: ignavId },
    { timeout: 60_000, maxRetries: 2 },
  );
}
