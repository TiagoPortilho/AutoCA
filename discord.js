const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const COLOR_AC     = 0xE8112D; // vermelho Air Canada
const COLOR_STATUS = 0x5865F2; // roxo Discord — card de status neutro

function fmtDate(iso) {
  const [, m, d] = iso.split('-');
  return `${+d}/${MONTHS[+m - 1]}`;
}

function fmtTime(dt) {
  return dt.slice(11, 16);
}

function fmtBRL(n) {
  return 'R$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtLeg(leg) {
  const segs = leg.segments;
  const flights = segs.map(s => `${s.marketing_carrier_code}${s.flight_number}`).join(' + ');
  const dep = fmtTime(segs[0].departure_time_local);
  const arr = fmtTime(segs.at(-1).arrival_time_local);
  const dayDiff = (
    new Date(segs.at(-1).arrival_time_local.slice(0, 10)) -
    new Date(segs[0].departure_time_local.slice(0, 10))
  ) / 86_400_000;
  const plus = dayDiff > 0 ? ` (+${dayDiff})` : '';
  const stops = segs.slice(0, -1).map(s => s.arrival_airport);
  const stopStr = stops.length ? `parada em ${stops.join(', ')}` : 'direto';
  return `${flights} · ${dep} → ${arr}${plus} · ${stopStr}`;
}

function quotaFooter(quota) {
  if (!quota) return '';
  const used = quota.limit != null ? `${quota.remaining}/${quota.limit}` : `${quota.remaining}`;
  return ` · Ignav: ${used} req. restantes`;
}

// Card de alerta de preço (subida ou queda)
export function buildPayload(trip, itinerary, links, prevPrice, quota) {
  const price = itinerary.price.amount;

  let precoValue = `**${fmtBRL(price)}** · 1 adulto`;
  if (prevPrice != null) {
    const pct = Math.round((price - prevPrice) / prevPrice * 100);
    const arrow = pct > 0 ? '↑' : '↓';
    precoValue += `\n${arrow} ${Math.abs(pct)}% (era ${fmtBRL(prevPrice)})`;
  }

  const airlineLink = links.find(l => l.provider_type === 'airline');
  const agencyLink  = links.find(l => l.provider_type !== 'airline');

  function linkUrl(link) {
    return link.url.startsWith('http') ? link.url : `https://${link.url}`;
  }

  const embed = {
    ...(airlineLink ? { url: linkUrl(airlineLink) } : {}),
    ...(agencyLink  ? { author: { name: `Agência disponível — ${agencyLink.provider_name}`, url: linkUrl(agencyLink) } } : {}),
    title: 'GRU → YVR · Air Canada',
    description: `**${fmtDate(trip.out)} → ${fmtDate(trip.ret)}**`,
    color: COLOR_AC,
    fields: [
      { name: 'Ida',   value: fmtLeg(itinerary.outbound), inline: false },
      { name: 'Volta', value: fmtLeg(itinerary.inbound),  inline: false },
      { name: 'Preço', value: precoValue,                  inline: false },
    ],
    footer: { text: `Confere a mala despachada antes de comprar.${quotaFooter(quota)}` },
  };

  const noLink = links.length === 0
    ? '\n_Sem link — abre a busca na Air Canada ou no Decolar._'
    : '';

  return {
    content: `@everyone${noLink}`,
    allowed_mentions: { parse: ['everyone'] },
    embeds: [embed],
  };
}

// Card de status — rodada sem mudanças
export function buildStatusPayload(trips, state, bestPrices, quota) {
  const fields = trips.map(trip => {
    const key = `${trip.out}_${trip.ret}`;
    const prev = state[key];
    const best = bestPrices[key];
    const label = `${fmtDate(trip.out)} → ${fmtDate(trip.ret)}`;
    let value = best != null ? fmtBRL(best) : '—';
    if (prev) value += ` · último alerta ${prev.alertedAt}`;
    return { name: label, value, inline: true };
  });

  return {
    embeds: [{
      title: 'AutoCA — sem mudanças',
      description: 'Verificação concluída. Nenhum preço mudou o suficiente para alertar.',
      color: COLOR_STATUS,
      fields,
      footer: { text: `Próxima verificação: amanhã.${quotaFooter(quota)}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

export async function sendMessage(payload) {
  const body = typeof payload === 'string' ? { content: payload } : payload;
  const res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('payload rejeitado (embed):', JSON.stringify(body.embeds?.[0]));
    console.error('payload rejeitado (content len):', body.content?.length ?? 0);
    throw new Error(`Discord ${res.status}: ${text}`);
  }
}

export async function sendError(msg) {
  return sendMessage({ content: `⚠️ Bot de passagens: ${msg}` });
}
