import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { searchRoundTrip, getBookingLinks, getLastQuota } from './ignav.js';
import { buildPayload, buildStatusPayload, sendMessage, sendError } from './discord.js';
import { readState, writeState } from './state.js';

async function run({ dryRun = false, testDiscord = false } = {}) {
  if (testDiscord) {
    await sendMessage({ content: '✈️ Bot de passagens — conexão com Discord OK!' });
    console.log('Mensagem de teste enviada.');
    return;
  }

  const state = await readState();
  const newState = { ...state };
  let searchErrors = 0;
  let alertsSent = 0;
  const bestPrices = {};

  for (const trip of CONFIG.trips) {
    const key = `${trip.out}_${trip.ret}`;
    console.log(`[${key}] buscando...`);

    let data;
    try {
      data = await searchRoundTrip(trip);
    } catch (err) {
      console.error(`[${key}] erro na busca:`, err.message);
      searchErrors++;
      continue;
    }

    const valid = (data.itineraries ?? []).filter(filterItinerary);
    console.log(`[${key}] ${valid.length} itinerário(s) válido(s) de ${data.itineraries?.length ?? 0}`);

    if (valid.length === 0) continue;

    const best = pickBest(valid);
    bestPrices[key] = best.price.amount;

    const prev = state[key];
    const change = prev ? Math.abs(best.price.amount - prev.alertedPrice) / prev.alertedPrice : 1;
    const shouldAlert = change >= CONFIG.dropAlert;

    if (!shouldAlert) {
      console.log(`[${key}] sem mudança suficiente (melhor: ${best.price.amount}, último alerta: ${prev.alertedPrice})`);
      continue;
    }

    const direction = prev && best.price.amount > prev.alertedPrice ? 'subida' : 'queda';
    console.log(`[${key}] alerta de ${direction}! preço: ${best.price.amount} — buscando links...`);

    let links = [];
    try {
      const linkData = await getBookingLinks(best.ignav_id);
      if (linkData.itinerary?.price?.verified) {
        const verified = linkData.itinerary.price.amount;
        if (verified > CONFIG.maxPriceBRL) {
          console.log(`[${key}] preço verificado (${verified}) acima do teto, descartando`);
          continue;
        }
        best.price.amount = verified;
      }
      links = extractLinks(linkData);
      console.log(`[${key}] ${links.length} link(s) obtido(s)`);
    } catch (err) {
      console.error(`[${key}] erro nos links (vai sem link):`, err.message);
    }

    const payload = buildPayload(trip, best, links, prev?.alertedPrice, getLastQuota());

    if (dryRun) {
      console.log('\n─────────────────────────────────────');
      console.log(JSON.stringify(payload, null, 2));
      console.log('─────────────────────────────────────\n');
      alertsSent++;
      continue;
    }

    try {
      await sendMessage(payload);
      newState[key] = { alertedPrice: best.price.amount, alertedAt: today() };
      await writeState(newState);
      alertsSent++;
      console.log(`[${key}] alerta enviado e estado salvo`);
    } catch (err) {
      console.error(`[${key}] erro ao enviar Discord:`, err.message);
    }
  }

  if (searchErrors === CONFIG.trips.length) {
    console.error('Todas as buscas falharam.');
    if (!dryRun) await sendError('todas as buscas falharam nesta rodada.').catch(() => {});
    process.exitCode = 1;
    return;
  }

  if (alertsSent === 0 && !dryRun) {
    const statusPayload = buildStatusPayload(CONFIG.trips, newState, bestPrices, getLastQuota());
    await sendMessage(statusPayload).catch(err =>
      console.error('erro ao enviar card de status:', err.message)
    );
    console.log('card de status enviado');
  }
}

function filterItinerary(it) {
  if (it.requires_self_transfer) return false;
  if (it.price.currency !== 'BRL' || it.price.amount > CONFIG.maxPriceBRL) return false;
  const segs = [...it.outbound.segments, ...it.inbound.segments];
  if (segs.some(s =>
    CONFIG.usAirports.includes(s.departure_airport) ||
    CONFIG.usAirports.includes(s.arrival_airport)
  )) return false;
  if (segs.some(s => s.departure_time_local.startsWith(CONFIG.blockedDate))) return false;
  if (!CONFIG.allowLandOnBlockedDate &&
    segs.some(s => s.arrival_time_local.startsWith(CONFIG.blockedDate))) return false;
  return true;
}

function pickBest(itineraries) {
  return [...itineraries].sort((a, b) => {
    if (a.price.amount !== b.price.amount) return a.price.amount - b.price.amount;
    const durA = a.outbound.duration_minutes + a.inbound.duration_minutes;
    const durB = b.outbound.duration_minutes + b.inbound.duration_minutes;
    return durA - durB;
  })[0];
}

function extractLinks(linkData) {
  const all = (linkData.booking_options ?? []).flatMap(opt => opt.links ?? []);
  return [
    ...all.filter(l => l.provider_type === 'airline'),
    ...all.filter(l => l.provider_type !== 'airline'),
  ].slice(0, 3);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Lambda handler
export const handler = async (event = {}) => {
  await run({
    dryRun:      event.dryRun      ?? false,
    testDiscord: event.testDiscord ?? false,
  });
};

// CLI local: node --env-file=.env index.js [--dry-run] [--test-discord]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await run({
    dryRun:      process.argv.includes('--dry-run'),
    testDiscord: process.argv.includes('--test-discord'),
  });
}
