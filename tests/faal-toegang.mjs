/* =========================================================================
   De deur van het portaal: de rem op raden, en het logboek erachter.

   Twee dingen die pas nut hebben als ze samen werken. De rem houdt iemand
   tegen die codes zit te proberen; het logboek laat jou zien dát het gebeurde.
   Zonder rem is het logboek een verslag van een inbraak, zonder logboek merk
   je een poging nooit.

   Wat hier NIET wordt getoetst en ook niet te toetsen is: of jouw eigen
   PORTAAL_CODE lang en willekeurig genoeg is. Die staat als secret in
   Cloudflare en hoort daar; geen enkele proef hier kan er iets over zeggen.
   Is die code te raden, dan doet de rest van dit bestand er niet toe.
   ========================================================================= */
const worker = (await import('../worker-portaal/portaal.js')).default;

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

const CODE = 'geheim-hoofdsleutel-1234';
const env = {
  AIRTABLE_TOKEN: 'tok-geheim-niet-lekken', AIRTABLE_BASE: 'appX',
  AIRTABLE_RITTEN: 'tblR', AIRTABLE_OPDRACHTEN: 'tblO', AIRTABLE_AANVRAGEN: 'tblA',
  AIRTABLE_KLANTEN: 'tblK', AIRTABLE_FACTUREN: 'tblF', AIRTABLE_CHAUFFEURS: 'tblC',
  AIRTABLE_DAGSTATEN: 'tblD', AIRTABLE_PUSH: 'tblP', AIRTABLE_TOEGANGSLOG: 'tblLOG',
  TOEGESTANE_ORIGIN: 'https://schaaplogistics.nl', PORTAAL_CODE: CODE
};

let log = [];
let airtableCalls = [];

/* De cache van Cloudflare nagebootst. Node heeft hem niet, en juist die is
   het hele punt van deze wijziging: de rem hoort over meerdere exemplaren van
   de Worker heen te tellen. */
const kast = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const rij = kast.get(String(req.url));
      if (!rij) { return undefined; }
      if (Date.now() > rij.tot) { kast.delete(String(req.url)); return undefined; }
      return new Response(rij.lijf, { status: 200 });
    },
    async put(req, res) {
      const lijf = await res.text();
      const cc = res.headers.get('Cache-Control') || '';
      const sec = Number((/max-age=(\d+)/.exec(cc) || [])[1] || 60);
      kast.set(String(req.url), { lijf, tot: Date.now() + sec * 1000 });
    }
  }
};

globalThis.fetch = async (url, opties = {}) => {
  const u = String(url);
  const m = opties.method || 'GET';
  airtableCalls.push({ url: u, method: m });

  if (u.includes('/tblLOG')) {
    if (m === 'POST') {
      const r = JSON.parse(opties.body).records || [];
      r.forEach((x) => log.push(x.fields));
      return new Response(JSON.stringify({ records: r.map((x, i) =>
        ({ id: 'recLog' + String(i).padStart(11, '0'), fields: x.fields })) }), { status: 200 });
    }
    if (m === 'DELETE') { return new Response('{"records":[]}', { status: 200 }); }
    return new Response(JSON.stringify({ records: [] }), { status: 200 });
  }
  /* Geen chauffeur, geen klant: elke code die niet de hoofdsleutel is, is fout. */
  return new Response(JSON.stringify({ records: [] }), { status: 200 });
};

function doe(code, ip, extra = {}) {
  return worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: Object.assign({
      Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
      'X-Portaal-Code': code, 'CF-Connecting-IP': ip,
      'CF-IPCountry': 'NL'
    }, extra),
    body: JSON.stringify({ actie: 'overzicht', dag: '2026-09-10' })
  }), env);
}

console.log('\n=== de deur van het portaal ===\n');
console.log('de rem telt over meerdere exemplaren heen');

{
  kast.clear();
  log = [];
  /* Vijftien foute pogingen vanaf hetzelfde adres. */
  let laatste = null;
  for (let i = 0; i < 17; i++) {
    laatste = await doe('foutecode-' + String(i).padStart(6, '0'), '203.0.113.9');
  }
  keur('na zeventien foute pogingen gaat de deur op slot',
    laatste.status === 429, laatste.status);

  /* En nu het punt van de hele wijziging.

     Cloudflare draait meerdere exemplaren van de Worker naast elkaar, elk met
     zijn eigen geheugen. Dat boots je niet na door nog een verzoek te sturen —
     dan praat je tegen hetzelfde exemplaar en telt dezelfde teller gewoon
     door. Je moet de module opnieuw laden: dan is de Map leeg, precies als bij
     een vers exemplaar, terwijl de cache van Cloudflare blijft staan.

     Zonder deze omweg slaagt de proef ook als de cachelaag er niet is, en
     bewijst hij dus niets over het enige dat hier veranderd is. */
  const vers = (await import('../worker-portaal/portaal.js?vers=1')).default;
  const nogeens = await vers.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': 'weer-een-foute-code', 'CF-Connecting-IP': '203.0.113.9',
               'CF-IPCountry': 'NL' },
    body: JSON.stringify({ actie: 'overzicht', dag: '2026-09-10' })
  }), env);
  keur('en een vers exemplaar met een leeg geheugen ziet hem ook op slot',
    nogeens.status === 429, nogeens.status);
  keur('de cache draagt die stand', kast.size > 0, kast.size);

  /* Een ander adres heeft er geen last van. */
  const buurman = await doe(CODE, '198.51.100.4');
  keur('een ander adres komt gewoon binnen', buurman.status === 200, buurman.status);
}

console.log('\nzonder cache blijft het werken');
{
  const bewaar = globalThis.caches;
  delete globalThis.caches;
  kast.clear();
  let laatste = null;
  for (let i = 0; i < 3; i++) {
    laatste = await doe('nogfout-' + String(i).padStart(8, '0'), '203.0.113.55');
  }
  keur('drie foute pogingen zonder cache geven gewoon 401',
    laatste.status === 401, laatste.status);
  const goed = await doe(CODE, '198.51.100.77');
  keur('en de goede code komt er nog steeds in', goed.status === 200, goed.status);
  globalThis.caches = bewaar;
}

console.log('\nhet logboek');
{
  kast.clear();
  log = [];
  await doe('een-foute-code-hier', '203.0.113.20');
  keur('een geweigerde poging wordt vastgelegd', log.length === 1, log.length);
  keur('en staat als Geweigerd te boek',
    log[0] && log[0].Soort === 'Geweigerd', log[0] && log[0].Soort);
  keur('met het land erbij',
    log[0] && /NL/.test(log[0].Herkomst || ''), log[0] && log[0].Herkomst);

  /* Dit is de controle die er het meest toe doet. */
  const alles = JSON.stringify(log);
  keur('de geprobeerde code staat NIET in het logboek',
    !alles.includes('een-foute-code-hier'), alles.slice(0, 200));
  keur('en de hoofdsleutel al helemaal niet', !alles.includes(CODE));
  keur('het volledige IP-adres staat er ook niet in',
    !alles.includes('203.0.113.20'), log[0] && log[0].Netwerk);
  keur('alleen het netwerk', log[0] && log[0].Netwerk === '203.0.x.x',
    log[0] && log[0].Netwerk);
}

console.log('\ngeslaagde toegang, maar niet elke tik');
{
  kast.clear();
  log = [];
  /* Elk blok hierin gebruikt een eigen land, en dat is geen willekeur: de
     dagrem onthoudt per persoon per land dat er al een regel is. Kwam de
     eigenaar hierboven al vanuit NL binnen, dan hoort een tweede regel vanuit
     NL er vandaag niet meer te komen — dat is precies de bedoeling. Zou deze
     proef opnieuw NL nemen, dan zou hij die rem aanzien voor een fout. */
  const eerste = await doe(CODE, '198.51.100.10', { 'CF-IPCountry': 'BE' });
  keur('de eerste keer binnen wordt vastgelegd', log.length === 1, log.length);
  keur('als Binnen', log[0] && log[0].Soort === 'Binnen', log[0] && log[0].Soort);
  keur('en met wie', log[0] && log[0].Wie === 'Eigenaar', log[0] && log[0].Wie);
  keur('het verzoek zelf gaat gewoon door', eerste.status === 200, eerste.status);

  /* Elke knop in het portaal stuurt de code mee. Zou elk verzoek een regel
     opleveren, dan staat de tabel binnen een week vol en lees je er niets
     meer uit. */
  for (let i = 0; i < 20; i++) {
    await doe(CODE, '198.51.100.10', { 'CF-IPCountry': 'BE' });
  }
  keur('twintig verzoeken erna leveren geen twintig regels op',
    log.length === 1, log.length);

  /* Maar vanuit een ander land wél: dat is precies wat je wilt zien. */
  const elders = await doe(CODE, '198.51.100.10', { 'CF-IPCountry': 'RU' });
  keur('binnenkomen vanuit een ander land geeft wél een nieuwe regel',
    log.length === 2, log.length);
  keur('en dat land staat erbij',
    log[1] && /RU/.test(log[1].Herkomst || ''), log[1] && log[1].Herkomst);
}

console.log('\nhet logboek mag nooit in de weg zitten');
{
  kast.clear();
  log = [];
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, opties = {}) => {
    if (String(url).includes('/tblLOG')) { throw new Error('logtabel weg'); }
    return echt(url, opties);
  };
  const res = await doe(CODE, '198.51.100.30');
  keur('een stukke logtabel houdt het portaal niet tegen',
    res.status === 200, res.status);
  globalThis.fetch = echt;

  /* En zonder tabel ingesteld gebeurt er simpelweg niets. */
  log = [];
  const zonder = { ...env, AIRTABLE_TOEGANGSLOG: '' };
  const uit = await worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': CODE, 'CF-Connecting-IP': '198.51.100.31' },
    body: JSON.stringify({ actie: 'overzicht', dag: '2026-09-10' })
  }), zonder);
  keur('zonder logtabel werkt het portaal gewoon', uit.status === 200, uit.status);
  keur('en wordt er niets weggeschreven', log.length === 0, log.length);
}

console.log('\nwat er van een adres wordt bewaard');
{
  kast.clear();
  for (const [ip, verwacht] of [
    ['83.128.14.7', '83.128.x.x'],
    ['8.8.8.8', '8.8.x.x'],
    ['2a02:a45f:1234:5678::1', '2a02:a45f:1234:x']
  ]) {
    log = [];
    await doe('fout-' + ip.replace(/[^a-z0-9]/gi, ''), ip);
    keur(ip + ' wordt ' + verwacht, log[0] && log[0].Netwerk === verwacht,
      log[0] && log[0].Netwerk);
  }
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
