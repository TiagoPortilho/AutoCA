# Plano do bot de passagens GRU → Vancouver

Oct 2, 2026 · @Tiago

## Objetivo

O bot vigia passagens Air Canada GRU → Vancouver e avisa no Discord quando aparece uma oferta dentro do teto ou quando o preço cai, já com o link de compra. Roda sozinho numa VM, sem você precisar ficar abrindo o Decolar. Só 1 passageiro paga em dinheiro; os outros 2 vão por pontos e ficam fora do bot.

## Requisitos

**Dia 15/fev eu preciso estar no Brasil**, e **bagagem despachada é obrigatória** (a conferência é manual, veja Limitações). O bot só alerta quando a oferta cumpre todos os critérios abaixo.

| Critério | Regra |
| --- | --- |
| Rota | GRU → YVR, ida e volta |
| Passageiros | 1 adulto pagando em dinheiro (os outros 2 vão por pontos, fora do bot) |
| Companhia | Só Air Canada |
| Datas | 2 combinações: **16/fev → 2/mar (prioridade)** e 1/fev → 14/fev (secundária) |
| Dia 15/fev | Obrigatório estar no Brasil: a viagem não atravessa esse dia e nenhum voo parte nele |
| Preço | Até R$ 7.000 para o adulto, com taxas |
| Escalas | Até 2 paradas, nunca em aeroporto dos EUA |
| Bagagem | **Obrigatória:** 1 despachada incluída, conferida na mão antes de comprar |

Referência: o voo do print (Air Canada, 16/fev → 2/mar) custa R$ 16.934 no total, cerca de R$ 5.645 por pessoa, e passaria no teto.

## Fontes de dados

A API escolhida é a [Ignav](https://ignav.com/docs/one-way), filtrando só Air Canada: ela entrega preço, paradas e aeroportos de cada trecho e gera o link de compra de cada voo. No teste, o Air Canada veio só com mala de mão, sem dado de mala despachada, então a bagagem é conferida na mão pelo link. A Amadeus Self-Service saiu do ar, e a SerpApi também não filtra bagagem.

| Fonte | O que entrega | Ponto fraco | Veredito |
| --- | --- | --- | --- |
| Ignav | Preço, paradas e aeroportos de cada trecho, filtro por companhia e link de compra de cada voo; 1.000 requisições grátis, depois US$ 2 por 1.000 ([preços](https://ignav.com/pricing)) | Não mostrou mala despachada do Air Canada no teste; serviço pequeno | Escolhida |
| SerpApi (Google Flights) | Preço, escalas e aeroportos de conexão | Não filtra bagagem despachada de forma confiável | Plano B, com conferência manual de bagagem |
| Amadeus Self-Service | Bagagem por oferta | Portal desligado em 17/jul/2026 ([PhocusWire](https://www.phocuswire.com/amadeus-shut-down-self-service-apis-portal-developers)) | Descartada |
| Decolar (scraping) | O mesmo que você vê no site | O site proíbe acesso automatizado | Descartado |

## Lógica do bot

A cada rodada o bot busca cada par de datas para 1 adulto, só com Air Canada e até 2 paradas na própria busca, aplica três filtros em sequência e, para o que passa, pede o link de compra e avisa no Discord.

&#91;embedded content: fluxo do bot · 3 filtros e 1 alerta\]

O bot guarda o último preço visto de cada combinação de datas, e é com ele que compara na rodada seguinte. A queda mínima que reativa o alerta é configurável, por exemplo 5%.

## Notificação no Discord

O aviso sai por webhook do Discord, que é só um POST para uma URL: não precisa criar bot nem hospedar nada. O webhook já foi criado; a URL é um segredo, então fica só em variável de ambiente na VM, nunca no código nem neste doc.

Cada alerta traz:

- datas de ida e volta, companhia e número dos voos
- preço em reais e paradas
- link de compra do voo, gerado pela Ignav (companhia primeiro, depois agências)
- lembrete para conferir a mala despachada antes de comprar

## Cota, custo e onde roda

A varredura roda 1 vez por dia e cada combinação de datas custa 1 busca, mais 1 consulta de link para cada voo que gerar alerta. São 2 buscas por dia, e de hoje até 16/fev dá menos de 300 buscas, além de poucos links: as 1.000 requisições grátis da Ignav (uma vez só) cobrem isso com folga.

O bot roda como **função Lambda** agendada pelo EventBridge (1 vez por dia). O free tier do Lambda é permanente (1M requests + 400k GB-s/mês), diferente do EC2 que é grátis só por 12 meses; para 1 execução diária o custo é zero para sempre. O `state.json` fica num bucket S3 (GET no início da rodada, PUT atômico no final) — custo irrisório. Lambda Layer não serve para estado: é para dependências estáticas e não persiste entre invocações.

- cron dispara a varredura 1 vez por dia, em horário fixo
- chave da Ignav e URL do webhook ficam em variáveis de ambiente na VM
- o histórico de preços fica num arquivo local na VM

## Limitações e riscos

O maior risco é a bagagem: a Ignav não informou mala despachada do Air Canada no teste, então ela é conferida na mão antes de comprar.

- **Pontos:** o bot só acompanha o preço em reais do passageiro pago em dinheiro; os outros 2 por pontos ficam fora, e o valor em pontos só aparece no Decolar.
- **Preço vs Decolar:** a Ignav pode mostrar valores e voos diferentes do Decolar (no teste, a volta do print não apareceu), e a tarifa pode mudar até a compra.
- **Link de compra:** pode vir vazio ou sem preço confirmado; nesse caso o alerta sai sem link e com um aviso.
- **Escalas nos EUA:** o filtro usa uma lista de aeroportos americanos; com só Air Canada o risco cai, mas a lista continua valendo.
- **Dependência:** a Ignav é um serviço pequeno; se sair do ar, o plano B é a SerpApi, sem filtro de bagagem.

## Decisões em aberto

Frequência (1 vez por dia), datas (2 combinações com 16/fev→2/mar como prioridade), companhia (Air Canada), API (Ignav) e infra na AWS já estão definidas. Falta fechar dois pontos antes de qualquer código:

- [x] ~~Confirmar se a volta de 14/fev, que deve pousar no Brasil em 15/fev de manhã, serve~~ → **serve**: `allowLandOnBlockedDate: true`.
- [x] ~~Decidir se o bot descarta volta com espera longa~~ → **não descarta**: escala longa não é critério de exclusão; o link vai no alerta e o usuário decide.
- [ ] Criar a VM t2.micro no EC2 (free tier da AWS)

## Especificação técnica

Esta parte é o contrato para implementar o bot em JavaScript (Node 20 ou mais novo, sem bibliotecas externas, usando o fetch nativo).

### Configuração

A chave da Ignav e a URL do webhook vêm de variáveis de ambiente e nunca entram no código, no repositório ou neste documento.

| Variável | Para quê |
| --- | --- |
| IGNAV\_API\_KEY | Chave da Ignav, enviada no header X-Api-Key |
| DISCORD\_WEBHOOK\_URL | URL do webhook do canal de alertas |
| STATE\_BUCKET | Nome do bucket S3 onde fica o `state.json` |

Todo o resto fica num arquivo de configuração:

```js
export const CONFIG = {
  origin: 'GRU',
  destination: 'YVR',
  adults: 1,
  market: 'BR',
  airlines: ['AC'],
  maxStops: 2,
  maxPriceBRL: 7000,
  trips: [
    { out: '2027-02-16', ret: '2027-03-02', priority: true },  // prioridade
    { out: '2027-02-01', ret: '2027-02-14' },
  ],
  blockedDate: '2027-02-15',
  allowLandOnBlockedDate: true, // decisão em aberto: volta que pousa no Brasil em 15/fev de manhã
  dropAlert: 0.05, // queda mínima (5%) para alertar de novo a mesma combinação
  usAirports: ['JFK','EWR','LGA','ORD','MDW','ATL','MIA','FLL','IAD','DCA','BOS','DFW','DAL','LAX','SFO','SEA','DEN','IAH','HOU','MCO','PHL','CLT','DTW','MSP','PHX','LAS','SLC','PDX','SAN','TPA','BWI','STL','MCI','CLE','PIT','CVG','RDU','AUS','SJC','OAK','HNL','ANC','MSY'],
};
```

### Chamadas à Ignav

Todas as chamadas são POST em JSON com o header `X-Api-Key` e `Content-Type: application/json`.

**1. Busca ida e volta** (1 chamada por combinação de datas): `POST https://ignav.com/api/fares/round-trip`

```json
{
  "origin": "GRU",
  "destination": "YVR",
  "departure_date": "2027-02-16",
  "return_date": "2027-03-02",
  "adults": 1,
  "market": "BR",
  "airlines_include": ["AC"],
  "max_stops": 2,
  "max_price": 7000,
  "allow_self_transfer": false
}
```

Os filtros são os mesmos da busca só-ida, então vale conferir na doc do round-trip se algum nome mudou. A resposta traz `itineraries[]`, e cada itinerário tem:

| Campo | O que é |
| --- | --- |
| price.amount, price.currency | Preço total em reais (market BR), para os adultos pedidos |
| outbound, inbound | Cada trecho tem carrier, duration\_minutes e segments\[\] |
| segments\[\] | marketing\_carrier\_code, flight\_number, departure\_airport, departure\_time\_local, arrival\_airport, arrival\_time\_local |
| bags | Só carry\_on para o Air Canada; o campo checked não vem |
| requires\_self\_transfer | true quando são bilhetes separados |
| ignav\_id | Id para pedir o link de compra |

**2. Link de compra** (1 chamada só para o voo que vai gerar alerta): `POST https://ignav.com/api/fares/booking-links`

```json
{ "ignav_id": "<ignav_id do itinerário>" }
```

A resposta traz `itinerary` e, ao lado dele, `booking_options[]`. Cada opção tem `legs` (`["outbound"]`, `["inbound"]` ou os dois) e `links[]`, e cada link tem:

| Campo | O que é |
| --- | --- |
| provider\_name | Nome do vendedor (ex.: Air Canada, uma agência) |
| provider\_type | `airline` ou `third_party` |
| fare\_name | Nome da tarifa, quando vem |
| price | Preço do vendedor, quando vem |
| url | Link de compra; pode vir sem `https://`, então o bot acrescenta |

Regras de uso: `booking_options` pode vir vazio; o `ignav_id` tem que vir de uma busca recente; a doc da Ignav manda conferir preço e bagagem no vendedor antes de comprar ([doc de links](https://ignav.com/docs/booking-links)).

### Fluxo de cada rodada

1. Para cada viagem em `CONFIG.trips`, fazer a busca ida e volta. Se der erro, registrar no log e seguir para a próxima viagem.
2. Descartar o itinerário que:
   - tenha `requires_self_transfer: true`
   - tenha `price.currency` diferente de BRL, ou `price.amount` acima de `maxPriceBRL`
   - passe por qualquer aeroporto de `usAirports` (checar `departure_airport` e `arrival_airport` de todos os segmentos, na ida e na volta)
   - tenha algum segmento que parte em `blockedDate` (`departure_time_local` começando com essa data); se `allowLandOnBlockedDate` for false, descartar também quem pousa nessa data
3. Ficar com o mais barato de cada viagem (desempate: menor duração total).
4. Comparar com o estado: alertar se a viagem ainda não tem alerta anterior, ou se o preço caiu `dropAlert` ou mais em relação ao último preço alertado.
5. Para cada viagem que vai alertar, chamar o endpoint de links, ordenar os links com `airline` antes de `third_party`, pegar até 3 por opção e acrescentar `https://` quando faltar. Se o `itinerary.price` da resposta vier `verified`, usar esse preço no alerta e conferir de novo contra o teto.
6. Postar no Discord e só depois gravar o preço alertado no estado.
7. Viagem sem nenhum itinerário válido não gera mensagem: silêncio é o normal.

### Estado

O arquivo `state.json` guarda o último preço alertado de cada viagem e fica num bucket S3. No início da rodada o bot faz GET; no final faz PUT (sobrescreve). Se o objeto não existir ainda, começa com `{}`. A escrita no Lambda é atômica por natureza (uma invocação por vez).

```json
{
  "2027-02-16_2027-03-02": { "alertedPrice": 5127, "alertedAt": "2026-10-03" }
}
```

### Mensagem no Discord

A mensagem sai em português, por webhook (`POST` na URL com `{ "content": texto }`). Os links ficam entre `<` e `>` para o Discord não gerar pré-visualizações enormes. O `(+1)` aparece quando a data local de chegada é diferente da de saída. O limite do Discord é 2.000 caracteres, então, se passar, cortar os links extras.

```text
✈️ Air Canada GRU → YVR | 16/fev → 2/mar
Ida: AC91 + AC105 · 21:30 → 11:55 (+1) · parada em YYZ
Volta: AC306 + AC96 · 12:35 → 09:00 (+1) · parada em YUL
💰 R$ 5.xxx para 1 adulto · antes: R$ 5.xxx (-5%)
🔗 Air Canada: <https://...>
🔗 Agência: <https://...>
⚠️ Confere a mala despachada antes de comprar.
```

Se o link de compra vier vazio, a mensagem sai sem a linha de link e com o aviso "sem link de compra, abre a busca na Air Canada ou no Decolar".

### Arquivos e execução

- `index.js`: orquestra a rodada
- `config.js`: o `CONFIG` acima
- `ignav.js`: busca e links, com retry
- `discord.js`: formata e envia a mensagem
- `state.js`: lê e grava o `state.json`
- `.env.example` sem valores reais, `.gitignore` com `.env` e `state.json`, e `package.json` com `"type": "module"`

O bot roda como função Lambda (Node 20), disparada 1 vez por dia por uma regra do EventBridge Scheduler. O horário é UTC; para 9h de Brasília (BRT = UTC-3):

```text
cron(0 12 * * ? *)
```

As variáveis de ambiente (`IGNAV_API_KEY`, `DISCORD_WEBHOOK_URL`, `STATE_BUCKET`) ficam nas env vars da função Lambda, não em `.env`. O `--dry-run` e `--test-discord` funcionam passando o argumento via event payload na invocação manual.

### Erros e segurança

- Cada chamada tem timeout de 30 segundos e 1 retry após 5 segundos em erro de rede, 429 ou 5xx; outros erros 4xx não são repetidos.
- Falha na consulta de link não bloqueia o alerta.
- Se todas as buscas da rodada falharem, o bot manda 1 mensagem curta no Discord avisando do erro.
- A chave da Ignav e a URL do webhook nunca aparecem em log, mensagem ou commit, e o `.env` fica com permissão 600.

### Como testar

- `node index.js --dry-run` faz as buscas e os links, imprime a mensagem no console, não posta no Discord e não grava o estado.
- `node index.js --test-discord` manda uma mensagem de teste para o webhook.

O bot está pronto quando:

1. o `--dry-run` mostra pelo menos um alerta com link de compra
2. uma rodada real posta no Discord
3. uma segunda rodada igual não repete a mensagem
4. subindo à mão o `alertedPrice` no `state.json`, o alerta de queda dispara
