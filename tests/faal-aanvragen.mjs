/* =========================================================================
   Faaltest van de aanvraag-Worker.

   Niet: werkt het. Wel: kan ik het stukmaken. Dit is het enige adres van het
   hele bouwwerk dat voor iedereen open staat — wie het vindt kan het
   aanroepen, en dat gebeurt vroeg of laat.
   ========================================================================= */
import worker from '../worker/aanvragen.js';

const env = {
  AIRTABLE_TOKEN: 'pat_test',
  AIRTABLE_BASE: 'appLUKMbBBkJUagFs',
  AIRTABLE_TABEL: 'tblhvOATDAfvBmabA',
  TOEGESTANE_ORIGIN: 'https://schaaplogistics.nl'
};
const SITE = 'https://schaaplogistics.nl';

let calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null });
  if (String(url).includes('content.airtable.com')) {
    return new Response(JSON.stringify({ id: 'att1' }), { status: 200 });
  }
  return new Response(JSON.stringify({ records: [{ id: 'recTEST0000000001' }] }), { status: 200 });
};

let teller = 0;
const post = (body, extra = {}) => new Request('https://w.dev/', {
  method: 'POST',
  headers: {
    Origin: extra.origin === undefined ? SITE : extra.origin,
    'Content-Type': 'application/json',
    'CF-Connecting-IP': extra.ip || ('10.9.0.' + (++teller)),
    ...(extra.headers || {})
  },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

const basis = (overschrijf = {}) => ({
  velden: {
    Dienst: 'Spoedtransport',
    Bedrijf: 'Testbedrijf BV', Contactpersoon: 'Jan Tester',
    Telefoon: '0612345678', 'E-mail': 'test@voorbeeld.nl',
    ...overschrijf
  },
  voorwaarden: true,
  voorwaardenVersie: '2026-09-08'
});

const doe = async (body, extra) => {
  calls = [];
  const res = await worker.fetch(post(body, extra), env);
  let data = null;
  try { data = await res.clone().json(); } catch { /* geen json */ }
  return { res, data, calls: calls.slice() };
};

const velden = () => (calls.find((c) => c.url.includes('api.airtable.com')) || {})
  .body?.records?.[0]?.fields || {};

console.log('\n=== de aanvraag-Worker onder vuur ===');

console.log('\nherkomst en methode');
{
  let r = await doe(basis(), { origin: 'https://kwaadaardig.nl' });
  keur('een vreemde site krijgt 403', r.res.status === 403, r.res.status);
  keur('en geen enkele CORS-toestemming',
    r.res.headers.get('Access-Control-Allow-Origin') === 'null',
    r.res.headers.get('Access-Control-Allow-Origin'));
  keur('er is niets naar Airtable gegaan', r.calls.length === 0);

  r = await doe(basis(), { origin: '' });
  keur('zonder Origin ook 403', r.res.status === 403, r.res.status);

  /* Een site die begint met de goede naam maar het niet is. */
  r = await doe(basis(), { origin: 'https://schaaplogistics.nl.kwaad.nl' });
  keur('een adres dat er alleen op lijkt komt er niet in', r.res.status === 403, r.res.status);

  r = await doe(basis(), { origin: 'https://schaaplogistics.nl:8443' });
  keur('een andere poort telt als een ander adres', r.res.status === 403, r.res.status);

  const g = await worker.fetch(new Request('https://w.dev/', {
    method: 'GET', headers: { Origin: SITE } }), env);
  keur('GET wordt geweigerd', g.status === 405, g.status);

  const p = await worker.fetch(new Request('https://w.dev/', {
    method: 'PUT', headers: { Origin: SITE }, body: '{}' }), env);
  keur('PUT ook', p.status === 405, p.status);
}

console.log('\nrommel in plaats van een aanvraag');
{
  let r = await doe('dit is geen json');
  keur('kapotte JSON geeft 400 en geen 500', r.res.status === 400, r.res.status);

  r = await doe('null');
  keur('de letterlijke null valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe('[]');
  keur('een lijst in plaats van een object valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe('"tekst"');
  keur('een losse tekst valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe({ velden: 'geen object', voorwaarden: true, voorwaardenVersie: '2026-09-08' });
  keur('velden als tekst valt niet om', r.res.status === 400, r.res.status);

  r = await doe({ velden: null, voorwaarden: true, voorwaardenVersie: '2026-09-08' });
  keur('velden als null valt niet om', r.res.status === 400, r.res.status);

  r = await doe({ velden: [], voorwaarden: true, voorwaardenVersie: '2026-09-08' });
  keur('velden als lijst valt niet om', r.res.status === 400, r.res.status);
}

console.log('\nde voorwaarden');
{
  let r = await doe({ ...basis(), voorwaarden: false });
  keur('zonder akkoord geen aanvraag', r.res.status === 400, r.res.status);
  keur('en niets in Airtable', r.calls.length === 0);

  r = await doe({ ...basis(), voorwaarden: 'ja' });
  keur('de tekst "ja" telt niet als akkoord', r.res.status === 400, r.res.status);

  r = await doe({ ...basis(), voorwaarden: 1 });
  keur('het getal 1 ook niet', r.res.status === 400, r.res.status);

  r = await doe({ ...basis(), voorwaardenVersie: '2020-01-01' });
  keur('een oude versie wordt geweigerd', r.res.status === 400, r.res.status);

  r = await doe({ ...basis(), voorwaardenVersie: undefined });
  keur('geen versie wordt geweigerd', r.res.status === 400, r.res.status);

  r = await doe(basis());
  keur('met een geldig akkoord gaat hij door', r.res.status === 200, r.res.status);
  const v = velden();
  keur('en het moment komt van de server, niet van de aanvrager',
    /^Versie 2026-09-08, geaccepteerd op \d{4}-\d{2}-\d{2}T/
      .test(v['Voorwaarden geaccepteerd'] || ''), v['Voorwaarden geaccepteerd']);
}

console.log('\nwat er wel en niet doorgaat naar Airtable');
{
  let r = await doe({ ...basis({ 'Stiekem veld': 'x', Winst: 9999, Aanvraag: 'overschreven' }) });
  const v = velden();
  keur('een veld dat niet op de lijst staat gaat niet mee', !('Stiekem veld' in v));
  keur('en een veld uit een andere tabel ook niet', !('Winst' in v));
  keur('het primaire veld wordt door de server bepaald',
    v['Aanvraag'] !== 'overschreven', v['Aanvraag']);

  /* Het veld Status stuurt de site zelf mee. Dat betekent dat iedereen het
     kan meesturen — ook een waarde die zegt dat de aanvraag al afgehandeld
     is, en dan zie je hem nooit in het portaal. */
  r = await doe({ ...basis(), velden: { ...basis().velden, Status: 'Omgezet naar opdracht' } });
  const s = velden()['Status'];
  keur('een aanvrager kan de status niet zelf op afgehandeld zetten',
    s === 'Nieuw' || s === undefined, 'Status = ' + s);

  r = await doe({ ...basis(), velden: { ...basis().velden, Bron: 'Telefonisch' } });
  keur('en de bron ook niet',
    ['Website', undefined].includes(velden()['Bron']), 'Bron = ' + velden()['Bron']);
}

console.log('\nlengte en type van de waarden');
{
  const lang = 'A'.repeat(200000);
  let r = await doe({ ...basis(), velden: { ...basis().velden, Opmerkingen: lang } });
  const v = velden();
  keur('een opmerking van 200.000 tekens wordt afgekapt of geweigerd',
    r.res.status >= 400 || String(v['Opmerkingen'] || '').length <= 5000,
    'status ' + r.res.status + ', lengte ' + String(v['Opmerkingen'] || '').length);

  r = await doe({ ...basis(), velden: { ...basis().velden, Bedrijf: 'B'.repeat(50000) } });
  keur('een bedrijfsnaam van 50.000 tekens ook',
    r.res.status >= 400 || String(velden()['Bedrijf'] || '').length <= 500,
    'lengte ' + String(velden()['Bedrijf'] || '').length);

  r = await doe({ ...basis(), velden: { ...basis().velden, Opmerkingen: { kwaad: true } } });
  keur('een object in een tekstveld wordt niet doorgegeven als object',
    r.res.status >= 400 || typeof velden()['Opmerkingen'] !== 'object',
    JSON.stringify(velden()['Opmerkingen']));

  r = await doe({ ...basis(), velden: { ...basis().velden, 'Aantal colli': [1, 2, 3] } });
  keur('een lijst in een getalveld ook niet',
    r.res.status >= 400 || !Array.isArray(velden()['Aantal colli']),
    JSON.stringify(velden()['Aantal colli']));

  /* Weggelaten is het goede antwoord: het veld hoort dan gewoon leeg te
     blijven, niet op nul te staan alsof de klant dat heeft ingevuld. */
  r = await doe({ ...basis(), velden: { ...basis().velden, 'Geschatte afstand km': -5000 } });
  keur('een negatieve afstand komt er niet in',
    !('Geschatte afstand km' in velden()), velden()['Geschatte afstand km']);

  r = await doe({ ...basis(), velden: { ...basis().velden, 'Prijsindicatie excl btw': -100000 } });
  keur('een negatieve prijsindicatie ook niet',
    !('Prijsindicatie excl btw' in velden()), velden()['Prijsindicatie excl btw']);

  r = await doe({ ...basis(), velden: { ...basis().velden, 'Geschatte afstand km': 1e308 } });
  keur('en een onmogelijk grote afstand ook niet',
    !('Geschatte afstand km' in velden()), velden()['Geschatte afstand km']);

  r = await doe({ ...basis(), velden: { ...basis().velden, 'Geschatte afstand km': 'honderd' } });
  keur('een afstand in letters ook niet',
    !('Geschatte afstand km' in velden()), velden()['Geschatte afstand km']);

  r = await doe({ ...basis(), velden: { ...basis().velden, 'Geschatte afstand km': 109 } });
  keur('maar een gewone afstand gaat er gewoon in',
    velden()['Geschatte afstand km'] === 109, velden()['Geschatte afstand km']);
}

console.log('\nde foto’s');
{
  const plaatje = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  let r = await doe({ ...basis(), fotos: Array.from({ length: 50 },
    (x, i) => ({ naam: 'f' + i + '.jpg', data: plaatje })) });
  const uploads = r.calls.filter((c) => c.url.includes('uploadAttachment'));
  keur('vijftig foto’s worden er hoogstens vijf', uploads.length <= 5, uploads.length);

  r = await doe({ ...basis(), fotos: [{ naam: '../../../etc/passwd', data: plaatje }] });
  const naam = (r.calls.find((c) => c.url.includes('uploadAttachment')) || {}).body?.filename;
  keur('een bestandsnaam met een pad erin gaat niet zo naar Airtable',
    !/[\/\\]/.test(String(naam || '')) && !String(naam || '').includes('..'), naam);

  r = await doe({ ...basis(), fotos: [{ naam: 'A'.repeat(5000) + '.jpg', data: plaatje }] });
  const lange = (r.calls.find((c) => c.url.includes('uploadAttachment')) || {}).body?.filename;
  keur('een bestandsnaam van 5000 tekens wordt afgekapt',
    String(lange || '').length <= 200, String(lange || '').length);

  r = await doe({ ...basis(), fotos: [{ naam: 'x.jpg', data: 'javascript:alert(1)' }] });
  keur('iets dat geen afbeelding is wordt overgeslagen',
    r.calls.filter((c) => c.url.includes('uploadAttachment')).length === 0);

  r = await doe({ ...basis(), fotos: [{ naam: 'x.svg', data: 'data:image/svg+xml;base64,' + 'A'.repeat(400) }] });
  const svg = r.calls.filter((c) => c.url.includes('uploadAttachment'));
  keur('een svg wordt niet als foto aangenomen', svg.length === 0,
    'er ging er ' + svg.length + ' doorheen');

  r = await doe({ ...basis(), fotos: 'geen lijst' });
  keur('foto’s als tekst valt niet om', r.res.status === 200, r.res.status);

  r = await doe({ ...basis(), fotos: [null, undefined, 42] });
  keur('rommel in de fotolijst valt niet om', r.res.status === 200, r.res.status);
}

console.log('\nde rem en de honeypot');
{
  let laatste;
  for (let i = 0; i < 8; i++) { laatste = await doe(basis(), { ip: '10.9.9.9' }); }
  keur('de zesde aanvraag van hetzelfde adres wordt geremd',
    laatste.res.status === 429, laatste.res.status);

  const ander = await doe(basis(), { ip: '10.9.9.10' });
  keur('een ander adres heeft er geen last van', ander.res.status === 200, ander.res.status);

  const bot = await doe({ ...basis(), controle: 'ingevuld door een bot' });
  keur('de honeypot meldt succes', bot.res.status === 200);
  keur('maar schrijft niets weg', bot.calls.length === 0);
}

console.log('\nde omvang van het verzoek');
{
  const groot = await doe(basis(), { headers: { 'Content-Length': String(60 * 1024 * 1024) } });
  keur('een verzoek dat zegt 60 MB te zijn wordt geweigerd',
    groot.res.status === 413, groot.res.status);

  /* Zonder Content-Length komt de controle niet aan bod. Dat is precies wat
     een aanvaller doet. */
  const zonder = new Request('https://w.dev/', {
    method: 'POST',
    headers: { Origin: SITE, 'CF-Connecting-IP': '10.9.5.5' },
    body: JSON.stringify({ ...basis(), velden: { ...basis().velden,
      Opmerkingen: 'X'.repeat(2 * 1024 * 1024) } })
  });
  calls = [];
  const res = await worker.fetch(zonder, env);
  const doorgekomen = String(velden()['Opmerkingen'] || '').length;
  keur('een lading van 2 MB zonder Content-Length wordt niet zomaar doorgeschreven',
    res.status >= 400 || doorgekomen <= 5000,
    'status ' + res.status + ', ' + doorgekomen + ' tekens doorgekomen');
}

console.log('\nals Airtable dwarsligt');
{
  globalThis.fetch = async () => new Response('INVALID_MULTIPLE_CHOICE_OPTIONS', { status: 422 });
  const r = await doe(basis());
  keur('een weigering van Airtable wordt netjes doorgegeven',
    r.res.status === 502, r.res.status);
  keur('en de sleutel staat niet in de foutmelding',
    !JSON.stringify(r.data || {}).includes(env.AIRTABLE_TOKEN));

  globalThis.fetch = async () => { throw new Error('netwerk weg'); };
  const n = await doe(basis());
  keur('een netwerkfout levert geen 500 op',
    n.res.status === 502, n.res.status);
}

console.log(fouten ? `\n${fouten} fout(en)\n` : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
