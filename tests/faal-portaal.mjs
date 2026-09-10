/* =========================================================================
   Faaltest van de portaal-Worker.

   Achter dit adres zitten klantnamen, adressen, bedragen, handtekeningen en
   foto's. Er zijn drie soorten bezoekers — eigenaar, chauffeur, klant — en de
   vraag is bij elk van de drie: wat krijg ik te zien dat niet voor mij is, en
   wat kan ik stukmaken.
   ========================================================================= */
import worker from '../worker-portaal/portaal.js';

const env = {
  AIRTABLE_TOKEN: 'tok-geheim-niet-lekken', AIRTABLE_BASE: 'appX',
  AIRTABLE_RITTEN: 'tblR', AIRTABLE_OPDRACHTEN: 'tblO', AIRTABLE_AANVRAGEN: 'tblA',
  AIRTABLE_KLANTEN: 'tblK', AIRTABLE_FACTUREN: 'tblF', AIRTABLE_CHAUFFEURS: 'tblC',
  AIRTABLE_DAGSTATEN: 'tblD', AIRTABLE_PUSH: 'tblP', AIRTABLE_SCHADES: 'tblSCH',
  VAPID_CONTACT: 'mailto:info@schaaplogistics.nl',
  TOEGESTANE_ORIGIN: 'https://schaaplogistics.nl',
  PORTAAL_CODE: 'geheim-hoofdsleutel-1234'
};
const ORIGIN = 'https://schaaplogistics.nl';
const CHAUF = 'chauffeur-code-1234';
const BAAS = 'eigen-code-van-de-baas-5678';
const KLANT = 'klantcode-abcdefgh';

let gesprek = [];
let rit, klant, medewerkers, schade;

function zetKlaar() {
  rit = { id: 'recAAAAAAAAAAAAAA', fields: {
    Rit: 'RIT-1', Ritdatum: '2026-09-03', Status: 'Gepland',
    Ophaaladres: 'A', Afleveradres: 'B', Kilometers: 20, Chauffeur: 'Piet Rijder',
    'Brandstof berekend': 12.5, Tol: 4, Parkeren: 2, 'Overige ritkosten': 1,
    'Totale ritkosten': 17.5, Winst: 82.5, Korting: 10, 'Reden korting': 'Te laat',
    'Extra kosten': 6, 'Automatisch totaal excl. BTW': 100,
    Klantnaam: ['Klant BV'], 'Klant telefoon': ['+31612345678'],
    Opmerkingen: 'Interne notitie', Handtekening: [], "Foto's": []
  } };
  klant = { id: 'recKKKKKKKKKKKKKK', fields: {
    Klantnaam: 'Klant BV', Portaalcode: KLANT, 'Soort klant': 'Vaste klant',
    Ritten: [rit.id], Facturen: []
  } };
  schade = { id: 'recSCHADE00000001', fields: {
    Schade: 'Spiegel geraakt', Datum: '2026-09-03', Soort: 'Eigen voertuig',
    Status: 'Open', Kenteken: '12-AB-34'
  } };
  /* Id's in de vorm die Airtable werkelijk teruggeeft: rec plus veertien
     tekens. Stond er iets korters, dan wijst de tussenlaag het af op de vorm
     en slaagt een proef omdat hij struikelt in plaats van omdat hij weigert. */
  medewerkers = [
    { id: 'recPIETRIJDER0001', fields: { Chauffeur: 'Piet Rijder', Toegangscode: CHAUF,
                             Rol: { id: 'r2', name: 'Chauffeur' }, Actief: true } },
    /* De eigenaar met een eigen persoonlijke code, naast de hoofdsleutel. Zo
       logt hij dagelijks in; de hoofdsleutel blijft de reservesleutel. */
    { id: 'recSHANEDEBAAS001', fields: { Chauffeur: 'Shane', Toegangscode: BAAS,
                             Rol: { id: 'r1', name: 'Eigenaar' }, Actief: true } }
  ];
}
zetKlaar();

globalThis.fetch = async (url, opties = {}) => {
  const u = String(url);
  let gelezen = null;
  if (opties.body) { try { gelezen = JSON.parse(opties.body); } catch { gelezen = '(bytes)'; } }
  gesprek.push({ url: u, method: opties.method || 'GET', body: gelezen });
  const leesbaar = decodeURIComponent(u.replace(/\+/g, ' '));

  if (u.includes('/tblC')) {
    if (/\/tblC\/rec/.test(u) || opties.method === 'PATCH') {
      return new Response(JSON.stringify(medewerkers[0]), { status: 200 });
    }
    /* Zonder filter geeft Airtable de hele tabel terug — dat is wat het
       tabblad Chauffeurs ophaalt. Stond hier alleen de filtertak, dan kwam die
       lijst altijd leeg terug en slaagde elke proef erover om de verkeerde
       reden. */
    const m = /\{Toegangscode\} = '([^']*)'/.exec(leesbaar);
    if (!m) { return new Response(JSON.stringify({ records: medewerkers }), { status: 200 }); }
    return new Response(JSON.stringify({
      records: medewerkers.filter((w) => w.fields.Toegangscode === m[1]) }), { status: 200 });
  }
  if (u.includes('/tblK')) {
    if (/\/tblK\/rec/.test(u)) { return new Response(JSON.stringify(klant), { status: 200 }); }
    const m = /\{Portaalcode\} = '([^']*)'/.exec(leesbaar);
    if (m) {
      return new Response(JSON.stringify({
        records: klant.fields.Portaalcode === m[1] ? [klant] : [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ records: [klant] }), { status: 200 });
  }
  if (u.includes('/tblSCH')) {
    if (opties.method === 'POST') {
      return new Response(JSON.stringify({ records: [{ id: 'recSCHADE00000001',
        fields: JSON.parse(opties.body).records[0].fields }] }), { status: 200 });
    }
    if (opties.method === 'PATCH') {
      Object.assign(schade.fields, JSON.parse(opties.body).fields);
      return new Response(JSON.stringify(schade), { status: 200 });
    }
    if (/\/tblSCH\/rec/.test(u)) {
      return new Response(JSON.stringify(schade), { status: 200 });
    }
    return new Response(JSON.stringify({ records: [schade] }), { status: 200 });
  }
  if (u.includes('/tblP')) {
    /* Airtable geeft bij het aanmaken een lijst terug en bij het bijwerken
       één record. Dat verschil moet hier kloppen, anders slaagt een proef
       omdat de Worker struikelt in plaats van omdat hij weigert. */
    if (opties.method === 'POST') {
      return new Response(JSON.stringify({
        records: [{ id: 'recPUSH1', fields: JSON.parse(opties.body).records[0].fields }]
      }), { status: 200 });
    }
    if (opties.method === 'PATCH') {
      return new Response(JSON.stringify({ id: 'recPUSH1', fields: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ records: [] }), { status: 200 });
  }
  if (u.includes('uploadAttachment')) {
    const stukken = u.split('/');
    const veld = decodeURIComponent(stukken[stukken.length - 2]);
    const lading = JSON.parse(opties.body);
    rit.fields[veld] = (rit.fields[veld] || []).concat([{
      id: 'att' + ((rit.fields[veld] || []).length + 1), filename: lading.filename,
      url: 'https://v5/x' }]);
    return new Response(JSON.stringify({ id: 'att1' }), { status: 200 });
  }
  if (opties.method === 'PATCH' && /\/tblR\/rec/.test(u)) {
    Object.assign(rit.fields, JSON.parse(opties.body).fields);
    return new Response(JSON.stringify({ id: rit.id, fields: rit.fields }), { status: 200 });
  }
  if (opties.method === 'PATCH') {
    return new Response(JSON.stringify({ id: 'recX', fields: {} }), { status: 200 });
  }
  if (opties.method === 'POST') {
    const v = JSON.parse(opties.body).records[0].fields;
    return new Response(JSON.stringify({
      records: [{ id: 'recNIEUWNIEUWNIEU', fields: v }] }), { status: 200 });
  }
  if (/\/tblR\/rec/.test(u)) { return new Response(JSON.stringify(rit), { status: 200 }); }
  return new Response(JSON.stringify({ records: [rit] }), { status: 200 });
};

let ip = 0;
const vraag = (body, { origin = ORIGIN, code = env.PORTAAL_CODE, method = 'POST',
                       headers = {}, ruw } = {}) => {
  const h = { 'Content-Type': 'application/json',
              'CF-Connecting-IP': '10.5.0.' + (++ip), ...headers };
  if (origin !== null) { h.Origin = origin; }
  if (code !== null) { h['X-Portaal-Code'] = code; }
  return new Request('https://p.workers.dev/', {
    method, headers: h,
    body: method === 'POST' ? (ruw !== undefined ? ruw : JSON.stringify(body)) : undefined
  });
};

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};
const doe = async (body, opties) => {
  gesprek = [];
  const res = await worker.fetch(vraag(body, opties), env);
  let data = {};
  try { data = await res.clone().json(); } catch { /* geen json */ }
  return { res, data, tekst: JSON.stringify(data), gesprek: gesprek.slice() };
};
const patches = () => gesprek.filter((c) => c.method === 'PATCH')
  .map((c) => c.body && c.body.fields).filter(Boolean);

console.log('\n=== de portaal-Worker onder vuur ===');

console.log('\nrommel in plaats van een verzoek');
{
  let r = await doe(null, { ruw: 'null' });
  keur('de letterlijke null valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe(null, { ruw: '[]' });
  keur('een lijst valt niet om', r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe(null, { ruw: '"hallo"' });
  keur('een losse tekst valt niet om', r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe(null, { ruw: '123' });
  keur('een getal valt niet om', r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe(null, { ruw: 'niet eens json' });
  keur('kapotte JSON geeft 400', r.res.status === 400, r.res.status);

  r = await doe({});
  keur('een verzoek zonder actie valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe({ actie: { kwaad: true } });
  keur('een actie die een object is valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe({ actie: ['overzicht'] });
  keur('een actie die een lijst is valt niet om',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  r = await doe({ actie: 'bestaatniet' });
  keur('een onbekende actie geeft een nette fout',
    r.res.status >= 400 && r.res.status < 500, r.res.status);

  /* Een klassieke: proberen de prototypeketen te vergiftigen zodat een
     chauffeur ineens eigenaar heet. */
  r = await doe(null, { code: CHAUF, ruw: JSON.stringify({
    actie: 'overzicht', dag: '2026-09-03', __proto__: { rol: 'Eigenaar' } }) });
  keur('prototype-vergiftiging maakt van een chauffeur geen eigenaar',
    r.res.status === 200 && !r.tekst.includes('82.5'), r.tekst.slice(0, 200));
  keur('en Object.prototype is niet aangetast', ({}).rol === undefined);
}

console.log('\nde sloten');
{
  let r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { origin: 'https://kwaad.nl' });
  keur('een vreemde site komt er niet in', r.res.status === 403, r.res.status);
  keur('en krijgt geen CORS-toestemming',
    r.res.headers.get('Access-Control-Allow-Origin') === 'null');

  r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { code: null });
  keur('zonder code kom je er niet in', r.res.status === 401, r.res.status);

  r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { code: 'fout-maar-lang-genoeg' });
  keur('met een verkeerde code ook niet', r.res.status === 401, r.res.status);

  /* De hoofdsleutel op één teken na. Zou een vergelijking die vroeg stopt
     verraden hoe ver je was; die vergelijking hoort dat niet te doen. */
  r = await doe({ actie: 'overzicht', dag: '2026-09-03' },
    { code: env.PORTAAL_CODE.slice(0, -1) + 'x' });
  keur('de hoofdsleutel op een teken na werkt niet', r.res.status === 401, r.res.status);

  /* Een spatie erachter zegt niets: HTTP haalt die er zelf al af voordat de
     Worker de kopregel te zien krijgt. Wat wél iets zegt: dezelfde tekens in
     een andere volgorde, en de code van iemand anders. */
  r = await doe({ actie: 'overzicht', dag: '2026-09-03' },
    { code: env.PORTAAL_CODE.split('').reverse().join('') });
  keur('dezelfde tekens in een andere volgorde werken niet',
    r.res.status === 401, r.res.status);

  r = await doe({ actie: 'overzicht', dag: '2026-09-03' },
    { code: env.PORTAAL_CODE.toUpperCase() });
  keur('de hoofdsleutel in hoofdletters werkt niet', r.res.status === 401, r.res.status);

  r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { code: KLANT });
  keur('een klantcode opent het chauffeursportaal niet', r.res.status === 401, r.res.status);
}

console.log('\nformule-injectie in de code');
{
  const pogingen = [
    ["' OR '1'='1", 'een altijd-waar-poging'],
    ["' & '' & '", 'een lege vergelijking erin praten'],
    ["a') , OR(1,1), ('", 'de formule opensplitsen'],
    ['{Portaalcode}!=BLANK', 'een veldnaam als code'],
    ['aaaaaaaaaaaa"', 'een dubbele aanhaling'],
    ['../../tblKlanten', 'een pad omhoog']
  ];
  for (const [code, wat] of pogingen) {
    const r = await doe({ actie: 'klantoverzicht' }, { code });
    const naarAirtable = r.gesprek.map((c) => decodeURIComponent(c.url)).join(' ');
    keur(wat + ' komt niet in een formule terecht',
      r.res.status === 401 && !naarAirtable.includes(code),
      'status ' + r.res.status);
  }

  /* Zoeken naar ritten: daar gaat vrije tekst wel een formule in. */
  const r = await doe({ actie: 'zoekritten', tekst: "x') , 1, FIND('" });
  const url = decodeURIComponent((r.gesprek[0] || {}).url || '');
  const term = (/FIND\('([^']*)'/.exec(url) || [])[1] || '';
  keur('de zoekterm bevat geen aanhalingstekens of haakjes meer',
    !/['"{}()\\]/.test(term), term);

  const f = await doe({ actie: 'zoekfacturen', nummer: "SL' , '" });
  const furl = decodeURIComponent((f.gesprek[0] || {}).url || '');
  keur('het factuurnummer ook niet', !furl.includes("SL' , '"), furl.slice(0, 160));
}

console.log('\nwat een chauffeur niet mag');
{
  const eigenaarActies = ['aanvragen', 'accepteer', 'afwijzen', 'planning', 'klanten',
    'nieuwerit', 'koppelklant', 'uitnodigen', 'klantsoort', 'nieuweklant',
    'leesbericht', 'zoekfacturen', 'factuurbetaald', 'meldingen'];
  for (const actie of eigenaarActies) {
    const r = await doe({ actie, id: rit.id }, { code: CHAUF });
    keur('een chauffeur mag niet "' + actie + '"', r.res.status === 403, r.res.status);
  }

  /* Hoofdletters, spaties en rare varianten mogen de lijst niet omzeilen. */
  for (const variant of ['Aanvragen', ' aanvragen', 'aanvragen ', 'AANVRAGEN']) {
    const r = await doe({ actie: variant }, { code: CHAUF });
    keur('"' + variant + '" glipt er niet langs', r.res.status >= 400, r.res.status);
  }

  /* En de rit van een ander. */
  rit.fields.Chauffeur = 'Iemand Anders';
  for (const actie of ['status', 'notitie', 'ritkm', 'ritkosten', 'handtekening',
                       'ritfoto', 'ritcontact']) {
    const r = await doe({ actie, id: rit.id, status: 'Uitgevoerd', tekst: 'x',
                          km: 1, contact: 'x' }, { code: CHAUF });
    keur('"' + actie + '" mag niet bij de rit van een ander', r.res.status === 403, r.res.status);
  }
  rit.fields.Chauffeur = 'Piet Rijder';
}

console.log('\nwat een chauffeur nooit terugkrijgt');
{
  const GELD = ['bedrag', 'korting', 'kortingRe', 'doorbereken', 'brandstof', 'tol',
                'parkeren', 'overig', 'kosten', 'winst', 'totaalIncl', 'btw',
                /* De tariefafspraak met een klant is ook geld. */
                'start', 'kmNorm', 'kmSpoed'];
  const acties = [
    { actie: 'overzicht', dag: '2026-09-03' },
    { actie: 'ritten', van: '2026-09-01', tot: '2026-09-05' },
    { actie: 'status', id: 'recAAAAAAAAAAAAAA', status: 'Onderweg' },
    { actie: 'notitie', id: 'recAAAAAAAAAAAAAA', tekst: 'iets' },
    { actie: 'ritkm', id: 'recAAAAAAAAAAAAAA', km: 30 },
    { actie: 'ritkosten', id: 'recAAAAAAAAAAAAAA', tol: 10, parkeren: 3 },
    { actie: 'ritcontact', id: 'recAAAAAAAAAAAAAA', contact: 'Henk', telefoon: '0612' },
    { actie: 'zoekritten', tekst: 'RIT' }
  ];
  for (const body of acties) {
    const r = await doe(body, { code: CHAUF });
    const lek = GELD.filter((v) => new RegExp('"' + v + '"').test(r.tekst));
    keur('"' + body.actie + '" lekt geen bedragen',
      r.res.status < 300 && lek.length === 0,
      'status ' + r.res.status + ' ' + lek.join(','));
    keur('"' + body.actie + '" lekt de winst niet als getal',
      !r.tekst.includes('82.5'), r.tekst.slice(0, 160));
  }

  const r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { code: CHAUF });
  keur('de Airtable-sleutel lekt nooit mee', !r.tekst.includes(env.AIRTABLE_TOKEN));
  keur('de hoofdsleutel ook niet', !r.tekst.includes(env.PORTAAL_CODE));
}

console.log('\nwat een klant niet kan');
{
  const chauffeursActies = ['overzicht', 'ritten', 'status', 'notitie', 'ritkm',
    'ritkosten', 'handtekening', 'ritfoto', 'ritcontact', 'zoekritten', 'klanten',
    'nieuwerit', 'uitnodigen', 'nieuweklant', 'zoekfacturen'];
  for (const actie of chauffeursActies) {
    const r = await doe({ actie, id: rit.id }, { code: KLANT });
    keur('een klant kan niet bij "' + actie + '"', r.res.status === 401, r.res.status);
  }

  const r = await doe({ actie: 'klantoverzicht' }, { code: KLANT });
  keur('zijn eigen overzicht krijgt hij wel', r.res.status === 200, r.res.status);
  const verboden = [['brandstof', '12.5'], ['winst', '82.5'], ['kosten', '17.5'],
    ['de interne ritnaam', 'RIT-1'], ['het telefoonnummer', '+31612345678'],
    ['de interne opmerking', 'Interne notitie'], ['het record-id', 'recAAAAAAAAAAAAAA'],
    ['zijn eigen portaalcode', KLANT]];
  for (const [wat, naald] of verboden) {
    keur(wat + ' lekt niet naar de klant', !r.tekst.includes(naald));
  }
}

console.log('\ngrenswaarden op de getallen');
{
  const gek = [-1, -99999, 1e308, 'Infinity', 'NaN', '1e400', '0x10',
               '  12  ', 'twaalf', null, [], {}, true];
  for (const w of gek) {
    const r = await doe({ actie: 'ritkm', id: rit.id, km: w, stops: w, wachttijd: w });
    const v = patches()[0] || {};
    const kmOk = v.Kilometers === undefined ||
      (typeof v.Kilometers === 'number' && isFinite(v.Kilometers) && v.Kilometers >= 0);
    keur('km = ' + JSON.stringify(w) + ' levert geen onzin in Airtable op',
      r.res.status < 500 && kmOk,
      'status ' + r.res.status + ', km = ' + JSON.stringify(v.Kilometers));
  }

  for (const w of [-50, 1e308, 'NaN', 'gratis', {}]) {
    const r = await doe({ actie: 'ritkosten', id: rit.id, brandstof: w, tol: w, overig: w });
    const v = patches()[0] || {};
    const ok = v.Brandstofkosten === undefined ||
      (typeof v.Brandstofkosten === 'number' && isFinite(v.Brandstofkosten) &&
       v.Brandstofkosten >= 0);
    keur('ritkosten ' + JSON.stringify(w) + ' levert geen onzin op',
      r.res.status < 500 && ok,
      'status ' + r.res.status + ', ' + JSON.stringify(v.Brandstofkosten));
  }

  for (const dag of ['2026-13-45', 'gisteren', '', '0000-00-00', '2026-09-03T00:00',
                     "2026-09-03' OR '1", '99999-01-01']) {
    const r = await doe({ actie: 'overzicht', dag });
    keur('een dag van "' + dag + '" wordt geweigerd of netjes opgevangen',
      r.res.status < 500, r.res.status);
  }

  const ver = await doe({ actie: 'ritten', van: '2020-01-01', tot: '2030-01-01' });
  keur('een venster van tien jaar wordt geweigerd', ver.res.status === 400, ver.res.status);

  const omgekeerd = await doe({ actie: 'ritten', van: '2026-09-30', tot: '2026-09-01' });
  keur('een venster dat achteruit loopt wordt geweigerd of leeg',
    omgekeerd.res.status < 500, omgekeerd.res.status);
}

console.log('\nlengte van wat er wordt weggeschreven');
{
  const lang = 'X'.repeat(100000);
  const velden = [
    ['notitie', { tekst: lang }, 'Opmerkingen'],
    ['ritcontact', { contact: lang, telefoon: lang }, 'Contact ter plaatse']
  ];
  for (const [actie, extra, veld] of velden) {
    const r = await doe({ actie, id: rit.id, ...extra });
    const v = patches()[0] || {};
    const lengte = String(v[veld] || '').length;
    keur('"' + actie + '" schrijft geen 100.000 tekens weg',
      r.res.status < 500 && lengte <= 2000, 'status ' + r.res.status + ', ' + lengte);
  }

  const kort = await doe({ actie: 'zoekritten', tekst: lang });
  const zurl = decodeURIComponent((kort.gesprek[0] || {}).url || '');
  keur('een zoekterm van 100.000 tekens wordt afgekapt', zurl.length < 2000, zurl.length);
}

console.log('\nde handtekening en de foto');
{
  const groot = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);
  let r = await doe({ actie: 'handtekening', id: rit.id, naam: 'X', data: groot });
  keur('een handtekening van 2 MB wordt geweigerd', r.res.status >= 400, r.res.status);

  r = await doe({ actie: 'handtekening', id: rit.id, naam: 'X',
                  data: 'data:text/html;base64,' + 'A'.repeat(200) });
  keur('html als handtekening wordt geweigerd', r.res.status >= 400, r.res.status);

  r = await doe({ actie: 'handtekening', id: rit.id, naam: 'X',
                  data: 'data:image/svg+xml;base64,' + 'A'.repeat(200) });
  keur('een svg als handtekening wordt geweigerd', r.res.status >= 400, r.res.status);

  rit.fields["Foto's"] = [];
  r = await doe({ actie: 'ritfoto', id: rit.id, naam: 'x.svg',
                  data: 'data:image/svg+xml;base64,' + 'A'.repeat(400) });
  keur('een svg als ritfoto ook', r.res.status >= 400, r.res.status);

  rit.fields["Foto's"] = [];
  r = await doe({ actie: 'ritfoto', id: rit.id, naam: 'a.jpg',
                  data: 'data:image/jpeg;base64,' + 'A'.repeat(3 * 1024 * 1024) });
  keur('een foto van 3 MB wordt geweigerd', r.res.status >= 400, r.res.status);
}

console.log('\npushmeldingen als achterdeur');
{
  const env2 = { ...env, VAPID_PUBLIEK: 'BPtest', VAPID_PRIVE: '{"d":"geheim"}' };
  const stuur = async (body, code) => {
    gesprek = [];
    const res = await worker.fetch(vraag(body, { code }), env2);
    return { res, gesprek: gesprek.slice() };
  };

  let r = await stuur({ actie: 'pushaan', endpoint: 'https://kwaadaardig.nl/verzamel',
    p256dh: 'a', auth: 'b' }, CHAUF);
  keur('een zelfgekozen adres wordt niet als pushdienst aangenomen',
    r.res.status >= 400, r.res.status);

  r = await stuur({ actie: 'pushaan', endpoint: 'https://x/' + 'a'.repeat(100000),
    p256dh: 'a', auth: 'b' }, CHAUF);
  const geschreven = (r.gesprek.find((c) => c.method === 'POST') || {}).body;
  const lengte = JSON.stringify(geschreven || {}).length;
  keur('een endpoint van 100.000 tekens wordt niet weggeschreven',
    r.res.status >= 400 || lengte < 5000, 'status ' + r.res.status + ', ' + lengte);

  r = await stuur({ actie: 'pushaan',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'a', auth: 'b' }, CHAUF);
  keur('een echte pushdienst wordt wel aangenomen', r.res.status === 200, r.res.status);
}

console.log('\nals Airtable of de omgeving wegvalt');
{
  const zonder = { ...env, PORTAAL_CODE: '' };
  const res = await worker.fetch(vraag({ actie: 'overzicht', dag: '2026-09-03' }), zonder);
  keur('zonder PORTAAL_CODE komt er een nette 500', res.status === 500, res.status);
  const t = await res.text();
  keur('en die noemt geen sleutels', !t.includes('tok-geheim'));

  const oud = globalThis.fetch;
  globalThis.fetch = async () => new Response('kapot', { status: 500 });
  const r = await doe({ actie: 'overzicht', dag: '2026-09-03' });
  keur('een stukke Airtable geeft 502 en geen 500', r.res.status === 502, r.res.status);
  keur('en de sleutel staat niet in de melding', !r.tekst.includes(env.AIRTABLE_TOKEN));

  globalThis.fetch = async () => { throw new Error('geen netwerk'); };
  const n = await doe({ actie: 'overzicht', dag: '2026-09-03' });
  keur('een netwerkfout ook 502', n.res.status === 502, n.res.status);
  globalThis.fetch = oud;
}

/* =========================================================================
   Inloggen met je eigen code in plaats van met de hoofdsleutel.

   De hoofdsleutel uit Cloudflare hoort een reservesleutel te zijn, geen
   dagelijkse. Staat er bij jouw rij in Chauffeurs de rol Eigenaar, dan geeft
   je persoonlijke code precies dezelfde rechten — zonder dat de hoofdsleutel
   ergens gedeeld of getoond hoeft te worden. Dat moet hier bewezen worden en
   niet aangenomen: het verschil tussen "mag alles" en "mag zijn eigen ritten"
   is het hele portaal.
   ========================================================================= */
/* =========================================================================
   De afgesproken afstand naast de gereden afstand.

   Geschatte kilometers is het ijkpunt: de afstand waarop de prijs is
   afgegeven. Wordt die bij elke correctie meegeschreven, dan schuift het
   ijkpunt mee met de correctie en is er niets meer om tegen af te zetten —
   dan kan de klant nooit meer nagaan waar hij ja tegen zei.
   ========================================================================= */
console.log('\nde afgesproken afstand blijft staan');
{
  zetKlaar();

  /* Een rit die je zelf aanmaakt: het opgegeven aantal is meteen de afspraak. */
  let r = await doe({ actie: 'nieuwerit', datum: '2026-09-03', km: 40,
    ophaal: 'A', aflever: 'B', type: 'Spoedtransport' });
  const gemaakt = (r.gesprek.find((c) => c.method === 'POST' &&
    (c.body || {}).records) || {}).body.records[0].fields;
  keur('een nieuwe rit legt de afgesproken afstand vast',
    gemaakt['Geschatte kilometers'] === 40,
    JSON.stringify(gemaakt['Geschatte kilometers']));
  keur('en zet hem gelijk aan de kilometers',
    gemaakt.Kilometers === 40, JSON.stringify(gemaakt.Kilometers));

  /* En nu de correctie achteraf. Die hoort alleen Kilometers te raken. */
  rit.fields['Geschatte kilometers'] = 40;
  r = await doe({ actie: 'ritkm', id: rit.id, km: 57 });
  const geschreven = patches()[0] || {};
  keur('de gereden kilometers worden bijgewerkt',
    geschreven.Kilometers === 57, JSON.stringify(geschreven.Kilometers));
  keur('maar de afgesproken afstand wordt niet aangeraakt',
    !('Geschatte kilometers' in geschreven), JSON.stringify(geschreven));
  keur('en staat dus nog op wat er is afgesproken',
    rit.fields['Geschatte kilometers'] === 40,
    rit.fields['Geschatte kilometers']);

  /* Het portaal moet hem terugkrijgen, anders valt er op het scherm niets te
     vergelijken. */
  keur('de rit komt met beide afstanden terug',
    r.data.rit && r.data.rit.km === 57 && r.data.rit.kmGeschat === 40,
    JSON.stringify(r.data.rit && { km: r.data.rit.km, kmGeschat: r.data.rit.kmGeschat }));

  /* En de klant krijgt hem niet: die ziet wat er gefactureerd wordt, niet de
     rekenslag daarachter. */
  const klantKant = await doe({ actie: 'zendingen' }, { code: KLANT });
  keur('de klant ziet de geschatte afstand niet',
    !klantKant.tekst.includes('kmGeschat') &&
    !klantKant.tekst.includes('Geschatte kilometers'),
    klantKant.tekst.slice(0, 200));
}

console.log('\ninloggen met je eigen code in plaats van de hoofdsleutel');
{
  zetKlaar();

  /* Een eigenaarsactie die een chauffeur nooit mag: de klantenlijst. */
  let r = await doe({ actie: 'chauffeurs' }, { code: BAAS });
  keur('de eigen code van de baas mag een eigenaarsactie', r.res.status === 200,
    r.res.status + ' ' + r.tekst.slice(0, 120));

  r = await doe({ actie: 'chauffeurs' }, { code: CHAUF });
  keur('een gewone chauffeurscode mag dat niet', r.res.status === 403, r.res.status);

  /* En het overzicht: een eigenaar krijgt klanten en aanvragen, een chauffeur
     krijgt lege lijsten. Dat is het echte verschil, niet alleen de statuscode. */
  r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { code: BAAS });
  keur('en hij krijgt het volledige overzicht',
    r.res.status === 200 && Array.isArray(r.data.klanten) && r.data.klanten.length > 0,
    r.res.status + ' klanten=' + JSON.stringify(r.data.klanten));
  keur('met zijn eigen naam erbij', r.data.ik && r.data.ik.naam === 'Shane',
    JSON.stringify(r.data.ik));
  keur('en de rol Eigenaar', r.data.ik && r.data.ik.rol === 'Eigenaar',
    JSON.stringify(r.data.ik));
  keur('en zijn eigen rij-id, zodat het portaal weet welke rij hij zelf is',
    r.data.ik && r.data.ik.id === 'recSHANEDEBAAS001', JSON.stringify(r.data.ik));

  /* De hoofdsleutel blijft werken — dat is de hele reden dat hij bestaat. */
  r = await doe({ actie: 'chauffeurs' });
  keur('de hoofdsleutel blijft ernaast gewoon werken', r.res.status === 200,
    r.res.status);
  keur('en die heeft geen rij-id', r.data.ik === undefined || !r.data.ik.id,
    JSON.stringify(r.data.ik));

  /* Wat er niet mag gebeuren: de code teruggeven aan wie hem opvraagt zonder
     dat hij erom vroeg. */
  r = await doe({ actie: 'overzicht', dag: '2026-09-03' }, { code: BAAS });
  keur('geen enkele toegangscode lift mee in het overzicht',
    !r.tekst.includes(BAAS) && !r.tekst.includes(CHAUF) &&
    !r.tekst.includes(env.PORTAAL_CODE));

  /* Uit gezet, dan is het voorbij — ook voor een eigenaarsrij. */
  medewerkers[1].fields.Actief = false;
  r = await doe({ actie: 'chauffeurs' }, { code: BAAS });
  keur('op non-actief werkt zijn eigen code niet meer', r.res.status === 401,
    r.res.status);
  r = await doe({ actie: 'chauffeurs' });
  keur('en dan komt hij er met de hoofdsleutel nog steeds in',
    r.res.status === 200, r.res.status);
  medewerkers[1].fields.Actief = true;
}

console.log('\njezelf buitensluiten');
{
  zetKlaar();

  /* De knop bestaat niet op je eigen rij, maar de tussenlaag moet het ook
     weigeren: het portaal is niet de plek waar dit wordt afgedwongen. */
  let r = await doe({ actie: 'chauffeurbij', id: 'recSHANEDEBAAS001', actief: false },
    { code: BAAS });
  keur('jezelf op non-actief zetten wordt geweigerd', r.res.status === 409,
    r.res.status + ' ' + r.tekst.slice(0, 120));
  keur('en er ging niets naar Airtable', patches().length === 0,
    JSON.stringify(patches()));

  r = await doe({ actie: 'chauffeurbij', id: 'recSHANEDEBAAS001', rol: 'Chauffeur' },
    { code: BAAS });
  keur('jezelf degraderen ook niet', r.res.status === 409, r.res.status);

  /* Iemand anders uitzetten mag wel — anders is de knop nutteloos. */
  r = await doe({ actie: 'chauffeurbij', id: 'recPIETRIJDER0001', actief: false },
    { code: BAAS });
  keur('een ander op non-actief zetten mag wel', r.res.status === 200,
    r.res.status + ' ' + r.tekst.slice(0, 120));

  /* En je eigen gegevens bijwerken blijft gewoon kunnen; alleen uitzetten en
     degraderen zijn geblokkeerd. */
  r = await doe({ actie: 'chauffeurbij', id: 'recSHANEDEBAAS001', kenteken: '12-ab-34' },
    { code: BAAS });
  keur('je eigen kenteken bijwerken mag nog steeds', r.res.status === 200,
    r.res.status);

  /* Met de hoofdsleutel is er geen eigen rij, dus daar geldt de rem niet —
     dan is er ook niets om jezelf mee buiten te sluiten. */
  r = await doe({ actie: 'chauffeurbij', id: 'recSHANEDEBAAS001', actief: false });
  keur('met de hoofdsleutel kan het wel, want die sluit niets af',
    r.res.status === 200, r.res.status);
}

/* =========================================================================
   De systeemcheck.

   Een controle die groen zegt terwijl er iets stuk is, is erger dan geen
   controle: dan zoek je in de verkeerde hoek. Dus is de vraag hier niet of hij
   werkt als alles klopt, maar of hij het ziet als er iets niet klopt.
   ========================================================================= */
console.log('\nde systeemcheck');
{
  zetKlaar();
  const echt = globalThis.fetch;

  /* Alles in orde. */
  let r = await doe({ actie: 'systeemcheck' });
  keur('de check draait', r.res.status === 200, r.res.status);
  keur('en geeft punten terug', Array.isArray(r.data.punten) && r.data.punten.length > 5,
    (r.data.punten || []).length);
  keur('met een naam en een stand per punt',
    (r.data.punten || []).every((p) => p.naam && p.stand), JSON.stringify(r.data.punten));

  /* Wat er nooit in mag staan: de sleutels zelf. Een controle die je geheimen
     op je scherm zet is zelf het lek. */
  keur('geen enkele sleutel staat in de uitslag',
    !r.tekst.includes(env.AIRTABLE_TOKEN) && !r.tekst.includes(env.PORTAAL_CODE),
    r.tekst.slice(0, 200));

  /* Een chauffeur heeft hier niets te zoeken: hij zou de namen van alle
     tabellen en instellingen te zien krijgen. */
  r = await doe({ actie: 'systeemcheck' }, { code: CHAUF });
  keur('een chauffeur mag de systeemcheck niet draaien', r.res.status === 403,
    r.res.status);

  /* Een hernoemd veld in Airtable. Dat is de storing waar dit voor bedoeld is:
     hij geeft een 422 bij het opslaan en zegt verder niets. */
  globalThis.fetch = async (url, opties = {}) => {
    if (String(url).includes('/tblR?') && String(url).includes('fields%5B%5D')) {
      return new Response(JSON.stringify({ error: {
        type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field names: kilometers' } }),
        { status: 422 });
    }
    return echt(url, opties);
  };
  r = await doe({ actie: 'systeemcheck' });
  const ritregel = (r.data.punten || []).find((p) => /Ritten/.test(p.naam)) || {};
  keur('een hernoemd veld valt op', ritregel.stand === 'fout', JSON.stringify(ritregel));
  keur('en de melding noemt het veld bij naam',
    /kilometers/i.test(ritregel.tekst || ''), ritregel.tekst);
  keur('met wat je eraan doet erbij',
    /hernoemd|veldkaart/i.test(ritregel.doen || ''), ritregel.doen);
  keur('en de teller telt hem mee', r.data.fouten >= 1, r.data.fouten);
  globalThis.fetch = echt;

  /* Een instelling die ontbreekt verklaart meestal alles eronder. */
  const kaal = { ...env, PORTAAL_CODE: 'geheim-hoofdsleutel-1234', VAPID_PUBLIEK: '' };
  delete kaal.AIRTABLE_TOKEN;
  const res = await worker.fetch(vraag({ actie: 'systeemcheck' }), kaal);
  const uit = await res.json();
  const instel = (uit.punten || []).find((p) => p.naam === 'Instellingen') || {};
  keur('een ontbrekende token valt op', instel.stand === 'fout', JSON.stringify(instel));
  keur('en wordt bij naam genoemd', /AIRTABLE_TOKEN/.test(instel.tekst || ''),
    instel.tekst);

  /* De rekenformule in Airtable. Valt die om, dan rolt er een factuur van nul
     euro uit en merk je dat pas als de klant belt. */
  globalThis.fetch = async (url, opties = {}) => {
    const u = String(url);
    if (u.includes('/tblR?') && u.includes('filterByFormula')) {
      return new Response(JSON.stringify({ records: [
        { id: 'recA', fields: { Kilometers: 20 } },
        { id: 'recB', fields: { Kilometers: 40 } }
      ] }), { status: 200 });
    }
    return echt(url, opties);
  };
  r = await doe({ actie: 'systeemcheck' });
  const som = (r.data.punten || []).find((p) => /prijsberekening/i.test(p.naam)) || {};
  keur('een formule die niet meer rekent valt op', som.stand === 'fout',
    JSON.stringify(som));
  keur('en zegt dat er anders een factuur van nul euro uit rolt',
    /nul euro/.test(som.doen || ''), som.doen);
  globalThis.fetch = echt;

  /* En de controle mag zelf niets veranderen. Draai je hem omdat je twijfelt,
     dan hoort hij die twijfel niet erger te maken. */
  r = await doe({ actie: 'systeemcheck' });
  const schrijf = r.gesprek.filter((c) => c.method && c.method !== 'GET');
  keur('de systeemcheck schrijft nergens iets weg', schrijf.length === 0,
    JSON.stringify(schrijf.map((c) => c.method + ' ' + c.url)).slice(0, 200));
}

/* =========================================================================
   Schade en contracten.

   Twee stukken administratie waar de tussenlaag verder niets mee rekent. Dat
   maakt ze niet vrijblijvend: er gaan bestanden in, en alles wat een bestand
   aanneemt moet weten wat het níét aanneemt.
   ========================================================================= */
/* =========================================================================
   Twee chauffeurs die tegelijk dezelfde rit oppakken.

   Tussen "is hij vrij?" en "zet mijn naam erop" zit een oproep naar Airtable.
   Drukken er twee in datzelfde ogenblik, dan zien ze allebei een vrije rit.
   Airtable kent geen voorwaardelijke schrijfactie, dus die race is niet weg te
   nemen — wel moet de verliezer de waarheid te horen krijgen in plaats van een
   groene knop en een rit die hij niet rijdt.
   ========================================================================= */
console.log('\ntwee chauffeurs op dezelfde rit');
{
  zetKlaar();
  rit.fields.Chauffeur = '';
  medewerkers.push({ id: 'recKLAASJANSEN001', fields: {
    Chauffeur: 'Klaas Jansen', Toegangscode: 'code-van-klaas-9876',
    Rol: { id: 'r2', name: 'Chauffeur' }, Actief: true } });

  /* De ander is net iets eerder: hij schrijft zijn naam terwijl dit verzoek
     nog onderweg is. Dat bootsen we na door bij de PATCH een andere naam terug
     te geven dan er verstuurd werd — precies wat Airtable doet als er in de
     tussentijd iets overheen is geschreven. */
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, opties = {}) => {
    const u = String(url);
    if (opties.method === 'PATCH' && /\/tblR\/rec/.test(u)) {
      gesprek.push({ url: u, method: 'PATCH', body: JSON.parse(opties.body) });
      return new Response(JSON.stringify({ id: rit.id,
        fields: { ...rit.fields, Chauffeur: 'Klaas Jansen' } }), { status: 200 });
    }
    return echt(url, opties);
  };
  let r = await doe({ actie: 'ritoppakken', id: rit.id }, { code: CHAUF });
  keur('wie de race verliest krijgt geen groene knop', r.res.status === 409,
    r.res.status);
  keur('en hoort wie hem wel heeft', /Klaas Jansen/.test(r.tekst), r.tekst.slice(0, 160));
  globalThis.fetch = echt;

  /* Zonder race gaat het gewoon goed. zetKlaar zet de nagebootste tabellen
     terug, dus Klaas moet er opnieuw bij. */
  zetKlaar();
  rit.fields.Chauffeur = '';
  medewerkers.push({ id: 'recKLAASJANSEN001', fields: {
    Chauffeur: 'Klaas Jansen', Toegangscode: 'code-van-klaas-9876',
    Rol: { id: 'r2', name: 'Chauffeur' }, Actief: true } });
  r = await doe({ actie: 'ritoppakken', id: rit.id }, { code: CHAUF });
  keur('en zonder race pakt hij hem gewoon op', r.res.status === 200,
    r.res.status + ' ' + r.tekst.slice(0, 120));
  keur('met zijn naam erop', rit.fields.Chauffeur === 'Piet Rijder',
    rit.fields.Chauffeur);

  /* En de gewone gevallen blijven staan: een rit die al bezet is, en een rit
     die niet meer op Gepland staat. */
  r = await doe({ actie: 'ritoppakken', id: rit.id }, { code: 'code-van-klaas-9876' });
  keur('een rit die al bezet is wordt geweigerd', r.res.status === 409, r.res.status);
  keur('met de naam van wie hem heeft', /Piet Rijder/.test(r.tekst),
    r.tekst.slice(0, 160));
}

console.log('\nschade vastleggen');
{
  zetKlaar();

  let r = await doe({ actie: 'nieuweschade', wat: 'Spiegel geraakt',
    datum: '2026-09-03', soort: 'Eigen voertuig', kenteken: '12-ab-34',
    toedracht: 'Bij het inparkeren tegen een paaltje.' });
  keur('een schade vastleggen lukt', r.res.status === 200, r.res.status);
  const velden = (r.gesprek.find((c) => c.method === 'POST' &&
    (c.body || {}).records) || {}).body.records[0].fields;
  keur('met de datum erbij', velden.Datum === '2026-09-03', velden.Datum);
  keur('het kenteken in hoofdletters', velden.Kenteken === '12-AB-34', velden.Kenteken);
  keur('en hij begint op Open', velden.Status === 'Open', velden.Status);

  r = await doe({ actie: 'nieuweschade', wat: '' });
  keur('zonder omschrijving wordt hij geweigerd', r.res.status === 400, r.res.status);

  /* Een verzonnen soort mag niet doorschieten naar Airtable: dat veld is een
     keuzelijst en een onbekende waarde laat de hele schrijfactie omvallen. */
  r = await doe({ actie: 'nieuweschade', wat: 'Iets', soort: '<script>' });
  const v2 = (r.gesprek.find((c) => c.method === 'POST' &&
    (c.body || {}).records) || {}).body.records[0].fields;
  keur('een verzonnen soort valt terug op een bestaande',
    v2.Soort === 'Eigen voertuig', v2.Soort);

  /* De stand bijwerken, en de meldingsdatum die vanzelf meekomt. */
  r = await doe({ actie: 'schadebij', id: 'recSCHADE00000001',
    status: 'Gemeld bij verzekeraar' });
  keur('de stand bijwerken lukt', r.res.status === 200, r.res.status);
  const p1 = patches()[0] || {};
  keur('en zet meteen de meldingsdatum', !!p1['Gemeld op'], JSON.stringify(p1));

  r = await doe({ actie: 'schadebij', id: 'recSCHADE00000001', status: 'Verzonnen' });
  keur('een verzonnen stand wordt geweigerd', r.res.status === 400, r.res.status);

  r = await doe({ actie: 'schadebij', id: 'recSCHADE00000001' });
  keur('een bijwerking zonder velden ook', r.res.status === 400, r.res.status);

  /* En de lijst. */
  r = await doe({ actie: 'schades' });
  keur('de lijst komt terug', r.res.status === 200 &&
    Array.isArray(r.data.schades), r.res.status);

  /* Een chauffeur heeft hier niets te zoeken. */
  r = await doe({ actie: 'schades' }, { code: CHAUF });
  keur('een chauffeur mag de schadelijst niet zien', r.res.status === 403,
    r.res.status);
}

console.log('\nbestanden bij een schade en bij een chauffeur');
{
  zetKlaar();
  const pdf = 'data:application/pdf;base64,' + 'A'.repeat(40);
  const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(40);

  let r = await doe({ actie: 'schadeformulier', id: 'recSCHADE00000001',
    naam: 'formulier.pdf', data: pdf });
  keur('een schadeformulier als pdf mag', r.res.status === 200,
    r.res.status + ' ' + r.tekst.slice(0, 120));

  r = await doe({ actie: 'schadeformulier', id: 'recSCHADE00000001',
    naam: 'foto.jpg', data: jpg });
  keur('een foto van het papier ook', r.res.status === 200, r.res.status);

  /* Bij de foto's hoort geen pdf: dat veld staat op de kaart als plaatje en
     een pdf zou daar als gebroken afbeelding in komen. */
  r = await doe({ actie: 'schadefoto', id: 'recSCHADE00000001',
    naam: 'formulier.pdf', data: pdf });
  keur('maar een pdf als schadefoto niet', r.res.status === 400, r.res.status);

  /* En alles wat geen van beide is. */
  const rommel = ['data:text/html;base64,PHNjcmlwdD4=', 'gewoon tekst',
    'data:image/svg+xml;base64,PHN2Zz4=', ''];
  for (const w of rommel) {
    r = await doe({ actie: 'schadeformulier', id: 'recSCHADE00000001', data: w });
    keur('geweigerd: ' + (w || '(leeg)').slice(0, 30), r.res.status === 400,
      r.res.status);
  }

  /* Te groot. */
  r = await doe({ actie: 'schadeformulier', id: 'recSCHADE00000001',
    data: 'data:application/pdf;base64,' + 'A'.repeat(20 * 1024 * 1024) });
  keur('een te groot bestand wordt geweigerd', r.res.status === 413, r.res.status);

  /* Hetzelfde voor het contract van een chauffeur. */
  r = await doe({ actie: 'chauffeurcontract', id: 'recPIETRIJDER0001',
    naam: 'contract.pdf', data: pdf });
  keur('een contract bij een chauffeur mag', r.res.status === 200,
    r.res.status + ' ' + r.tekst.slice(0, 120));

  r = await doe({ actie: 'chauffeurcontract', id: 'recPIETRIJDER0001',
    data: 'data:text/html;base64,PHNjcmlwdD4=' });
  keur('maar geen html', r.res.status === 400, r.res.status);

  r = await doe({ actie: 'chauffeurcontract', id: 'onzin', data: pdf });
  keur('en niet op een verzonnen id', r.res.status === 400, r.res.status);

  r = await doe({ actie: 'chauffeurcontract', id: 'recPIETRIJDER0001',
    naam: 'contract.pdf', data: pdf }, { code: CHAUF });
  keur('een chauffeur mag zelf geen contract uploaden', r.res.status === 403,
    r.res.status);

  /* De chauffeurslijst zegt of er een contract hangt, met een adres erbij —
     maar de toegangscode blijft er net zo goed uit als eerst. */
  r = await doe({ actie: 'chauffeurs' });
  keur('de lijst noemt de contractsoort',
    r.tekst.includes('"soort"'), r.tekst.slice(0, 200));
  keur('en nog steeds geen toegangscode', !r.tekst.includes(CHAUF));
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
