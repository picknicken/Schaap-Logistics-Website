/* =========================================================================
   Geen factuur zonder klant, en de meldingen die daarbij horen.

   Naam, adres, btw-nummer en debiteurnummer op een factuur komen alle vier
   via de koppeling uit Klanten. Hangt er geen klant aan de rit, dan rolt er
   een factuur uit met een leeg adres: niet te versturen, niet te innen, en
   boven de honderd euro ook niet toegestaan.

   De rem zit daarom op twee plekken, en met opzet niet op een derde:

   - zorgVoorFactuur maakt geen factuur zonder klant. Dat is de eigenlijke rem.
   - zetStatus weigert Uitgevoerd zonder klant. Dat is een knop in het portaal,
     dus het moment om het recht te zetten.
   - het aftekenen met een handtekening weigert niets. Daar sta je bij de klant
     op de stoep, en een bewijs van aflevering dat je kwijtraakt omdat er een
     koppeling ontbreekt is erger dan een factuur die een dag later komt.

   En omdat een rem die werk laat liggen alleen maar een ander gat maakt: hang
   je later alsnog een klant aan een afgeronde rit, dan komt die factuur er.
   ========================================================================= */
const worker = (await import('../worker-portaal/portaal.js')).default;

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

const env = {
  AIRTABLE_TOKEN: 'tok-geheim', AIRTABLE_BASE: 'appX',
  AIRTABLE_RITTEN: 'tblR', AIRTABLE_OPDRACHTEN: 'tblO', AIRTABLE_AANVRAGEN: 'tblA',
  AIRTABLE_KLANTEN: 'tblK', AIRTABLE_FACTUREN: 'tblF', AIRTABLE_CHAUFFEURS: 'tblC',
  AIRTABLE_DAGSTATEN: 'tblD', AIRTABLE_PUSH: 'tblP',
  TOEGESTANE_ORIGIN: 'https://schaaplogistics.nl',
  PORTAAL_CODE: 'geheim-hoofdsleutel-1234',
  VAPID_CONTACT: 'mailto:info@schaaplogistics.nl'
};

/* --- de nagebootste base --- */
let ritten, facturen, apparaten, verstuurd, gemaakt, lading;
const VANDAAG = new Date().toISOString().slice(0, 10);
const GISTEREN = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

function zetKlaar() {
  ritten = {
    recZonderKlant001: { id: 'recZonderKlant001', fields: {
      Rit: 'RIT-1', Ritdatum: VANDAAG, Status: 'Onderweg', 'Type rit': 'Spoedtransport',
      Kilometers: 70, 'Automatisch totaal excl. BTW': 287, 'BTW bedrag': 60.27,
      'Automatisch totaal incl. BTW': 347.27 } },
    recMetKlant000001: { id: 'recMetKlant000001', fields: {
      Rit: 'RIT-2', Ritdatum: VANDAAG, Status: 'Onderweg', 'Type rit': 'Standaard transport',
      Klant: [{ id: 'recKlant000000001' }], Kilometers: 40,
      'Automatisch totaal excl. BTW': 115 } },
    recAfgetekend0001: { id: 'recAfgetekend0001', fields: {
      Rit: 'RIT-3', Ritdatum: GISTEREN, Status: 'Uitgevoerd', Kilometers: 20 } },
    recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
      Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30 } }
  };
  facturen = {};
  gemaakt = [];
  verstuurd = [];
  apparaten = [{ id: 'recP1', fields: { Apparaat: 'Telefoon', Voor: 'Eigenaar', Actief: true,
    Endpoint: 'https://fcm.googleapis.com/fcm/send/goed',
    'Sleutel p256dh': telPub, 'Sleutel auth': telAuth } }];
}

const paar = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const telPub = Buffer.from(await crypto.subtle.exportKey('raw', paar.publicKey)).toString('base64url');
const telAuth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
const vapidPaar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
env.VAPID_PUBLIEK = Buffer.from(await crypto.subtle.exportKey('raw', vapidPaar.publicKey)).toString('base64url');
{
  const j = await crypto.subtle.exportKey('jwk', vapidPaar.privateKey);
  env.VAPID_PRIVE = JSON.stringify({ kty: 'EC', crv: 'P-256', d: j.d, x: j.x, y: j.y });
}

zetKlaar();

globalThis.fetch = async (url, opties = {}) => {
  const u = String(url);
  const m = opties.method || 'GET';
  const lees = () => { try { return JSON.parse(opties.body); } catch { return {}; } };

  if (u.startsWith('https://fcm.googleapis.com/')) {
    verstuurd.push({ url: u, urgency: (opties.headers || {}).Urgency });
    return new Response('', { status: 201 });
  }
  if (u.includes('content.airtable.com')) { return new Response('{}', { status: 200 }); }

  if (u.includes('/tblC')) { return new Response(JSON.stringify({ records: [] }), { status: 200 }); }
  if (u.includes('/tblP')) {
    if (m === 'PATCH') { return new Response('{"id":"recP"}', { status: 200 }); }
    return new Response(JSON.stringify({ records: apparaten }), { status: 200 });
  }

  if (u.includes('/tblR')) {
    const id = (u.split('?')[0].match(/\/(rec[A-Za-z0-9]{14})$/) || [])[1];
    if (id && m === 'PATCH') {
      /* Airtable wist een veld als je er null in zet. */
      const velden = lees().fields;
      for (const [k, v] of Object.entries(velden)) {
        if (v === null) { delete ritten[id].fields[k]; }
        else { ritten[id].fields[k] = v; }
      }
      return new Response(JSON.stringify(ritten[id]), { status: 200 });
    }
    if (id) { return new Response(JSON.stringify(ritten[id] || { id, fields: {} }), { status: 200 }); }

    /* De pushronde en het ochtendbericht vragen elk om iets anders. Zonder de
       filter na te doen krijgt elke zoekopdracht alle ritten terug, en dan
       ziet elke rit eruit als een annulering én als een wijzigverzoek. Een
       proef die daarop groen staat bewijst niets. */
    const q = decodeURIComponent(u.replace(/\+/g, ' '));
    let uit = Object.values(ritten);
    if (q.includes('{Geannuleerd door klant}')) {
      uit = uit.filter((r) => !!r.fields['Geannuleerd door klant'] &&
                              !r.fields['Pushmelding annulering op']);
    } else if (q.includes("{Wijzigverzoek status} = 'Open'")) {
      uit = uit.filter((r) => r.fields['Wijzigverzoek status'] === 'Open' &&
                              !r.fields['Pushmelding wijzigverzoek op']);
    } else if (q.includes("{Status} != 'Geannuleerd'")) {
      uit = uit.filter((r) => r.fields.Status !== 'Geannuleerd' &&
                              r.fields.Status !== 'Uitgevoerd');
    }
    return new Response(JSON.stringify({ records: uit }), { status: 200 });
  }

  if (u.includes('/tblF')) {
    if (m === 'POST') {
      /* Airtable neemt records aan als {records:[{fields}]} en geeft ze zo ook
         terug. Een kaler antwoord laat maak() struikelen, en dan slaagt deze
         proef om de verkeerde reden: er komt geen factuur, maar niet doordat
         de rem werkte. */
      const uit = [];
      for (const r of (lees().records || [])) {
        const id = 'recFactuur' + String(gemaakt.length + 1).padStart(7, '0');
        facturen[id] = { id, fields: r.fields || {} };
        gemaakt.push(r.fields || {});
        uit.push(facturen[id]);
      }
      return new Response(JSON.stringify({ records: uit }), { status: 200 });
    }
    if (m === 'PATCH') {
      for (const r of (lees().records || [])) {
        if (facturen[r.id]) { Object.assign(facturen[r.id].fields, r.fields); }
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    }
    const leesbaar = decodeURIComponent(u.replace(/\+/g, ' '));
    let uit = Object.values(facturen);
    if (leesbaar.includes('{Dagen te laat} > 0')) {
      uit = uit.filter((r) => (Number(r.fields['Dagen te laat']) || 0) > 0);
    }
    if (leesbaar.includes("!= 'Te laat'")) {
      uit = uit.filter((r) => r.fields.Status !== 'Te laat');
    }
    return new Response(JSON.stringify({ records: uit }), { status: 200 });
  }
  return new Response(JSON.stringify({ records: [] }), { status: 200 });
};

const doe = (lading) => worker.fetch(new Request('https://p.dev/', {
  method: 'POST',
  headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
             'X-Portaal-Code': env.PORTAAL_CODE, 'CF-Connecting-IP': '10.0.0.' + (1 + Math.floor(Math.random() * 200)) },
  body: JSON.stringify(lading)
}), env);

console.log('\n=== geen factuur zonder klant ===\n');
console.log('op Uitgevoerd zetten');

{
  zetKlaar();
  const res = await doe({ actie: 'status', id: 'recZonderKlant001', status: 'Uitgevoerd' });
  const data = await res.json();
  keur('een rit zonder klant mag niet op Uitgevoerd', res.status === 409, res.status);
  keur('en de melding zegt wat je moet doen',
    /klant/i.test(data.fout || ''), data.fout);
  keur('het portaal kan er zelf op reageren', data.geenKlant === true);
  keur('de status is niet stiekem toch gewijzigd',
    ritten.recZonderKlant001.fields.Status === 'Onderweg',
    ritten.recZonderKlant001.fields.Status);
  keur('en er is geen factuur gemaakt', gemaakt.length === 0, JSON.stringify(gemaakt));
}

{
  zetKlaar();
  const res = await doe({ actie: 'status', id: 'recMetKlant000001', status: 'Uitgevoerd' });
  keur('mét klant mag het gewoon', res.status === 200, res.status);
  keur('de rit staat op Uitgevoerd',
    ritten.recMetKlant000001.fields.Status === 'Uitgevoerd');
  keur('en er staat één conceptfactuur klaar', gemaakt.length === 1, gemaakt.length);
  keur('met de klant eraan',
    gemaakt.length === 1 && (gemaakt[0].Klant || []).includes('recKlant000000001'),
    JSON.stringify(gemaakt[0] || {}));
}

/* Andere statussen raakt de rem niet aan: je moet een rit zonder klant wel
   op Onderweg of Geannuleerd kunnen zetten. */
for (const st of ['Onderweg', 'Gepland', 'Geannuleerd']) {
  zetKlaar();
  const res = await doe({ actie: 'status', id: 'recGeplandGeen001', status: st });
  keur('naar ' + st + ' mag ook zonder klant', res.status === 200, res.status);
}

console.log('\nde handtekening, bij de klant op de stoep');
{
  zetKlaar();
  const plaatje = 'data:image/png;base64,' + Buffer.from('nep').toString('base64');
  const res = await doe({ actie: 'handtekening', id: 'recZonderKlant001',
    naam: 'J. Jansen', data: plaatje });
  keur('aftekenen mag ook zonder klant — het bewijs gaat voor', res.status === 200, res.status);
  keur('de rit staat op Uitgevoerd',
    ritten.recZonderKlant001.fields.Status === 'Uitgevoerd');
  keur('de naam van wie tekende is bewaard',
    ritten.recZonderKlant001.fields['Getekend door'] === 'J. Jansen',
    ritten.recZonderKlant001.fields['Getekend door']);
  keur('maar er is géén factuur uitgerold', gemaakt.length === 0, JSON.stringify(gemaakt));
}

console.log('\nde klant later alsnog koppelen');
{
  zetKlaar();
  const res = await doe({ actie: 'koppelklant', soort: 'rit',
    id: 'recAfgetekend0001', klantId: 'recKlant000000001' });
  keur('koppelen lukt', res.status === 200, res.status);
  keur('en de factuur die er niet kwam, komt er nu alsnog', gemaakt.length === 1, gemaakt.length);
  keur('met de klant eraan',
    gemaakt.length === 1 && (gemaakt[0].Klant || []).includes('recKlant000000001'));
}
{
  zetKlaar();
  await doe({ actie: 'koppelklant', soort: 'rit',
    id: 'recGeplandGeen001', klantId: 'recKlant000000001' });
  keur('een rit die nog moet rijden krijgt géén factuur', gemaakt.length === 0,
    JSON.stringify(gemaakt));
}
{
  zetKlaar();
  ritten.recAfgetekend0001.fields.Facturen = [{ id: 'recFactuurBest001' }];
  await doe({ actie: 'koppelklant', soort: 'rit',
    id: 'recAfgetekend0001', klantId: 'recKlant000000001' });
  keur('en een rit die er al een heeft krijgt er geen tweede', gemaakt.length === 0,
    JSON.stringify(gemaakt));
}

console.log('\n=== de meldingen ===\n');
console.log('een factuur die te lang openstaat');

const wachtjes = [];
const ctx = { waitUntil: (p) => wachtjes.push(p) };
async function dagklus() {
  wachtjes.length = 0;
  await worker.scheduled({ cron: '0 5 * * *' }, env, ctx);
  await Promise.all(wachtjes);
}

{
  zetKlaar();
  facturen.recF1 = { id: 'recF1', fields: { Factuur: 'F-1', Klant: ['Janssen BV'],
    'Dagen te laat': 9, Totaal: 347.27, Status: 'Verstuurd' } };
  facturen.recF2 = { id: 'recF2', fields: { Factuur: 'F-2', Klant: ['De Vries'],
    'Dagen te laat': 3, Totaal: 150, Status: 'Verstuurd' } };
  await dagklus();
  keur('allebei komen ze op Te laat te staan',
    facturen.recF1.fields.Status === 'Te laat' && facturen.recF2.fields.Status === 'Te laat');
  /* Twee berichten: één over de facturen, één ochtendbericht. Het aantal
     noemen we hier precies, want "minstens één" zou ook slagen als het
     factuurbericht helemaal niet komt en alleen het ochtendbericht afgaat. */
  keur('er gaan twee berichten uit: over de facturen en het ochtendbericht',
    verstuurd.length === 2, verstuurd.length);
}
{
  /* Een tweede ronde: ze staan al op Te laat, dus de zoekopdracht slaat ze
     over en er hoort geen factuurbericht meer te komen. Anders piept je
     telefoon elke dag opnieuw over dezelfde factuur. Het ochtendbericht komt
     wél, want dat gaat over vandaag en niet over die ene factuur. */
  facturen.recF1.fields['Dagen te laat'] = 10;
  verstuurd = [];
  await dagklus();
  keur('de dag erna komt alleen het ochtendbericht nog',
    verstuurd.length === 1, verstuurd.length);
}

console.log('\nhet ochtendbericht');
{
  zetKlaar();
  await dagklus();
  keur('met ritten en losse eindjes komt er precies één bericht',
    verstuurd.length === 1, verstuurd.length);
}
{
  zetKlaar();
  ritten = {};
  facturen = {};
  verstuurd = [];
  await dagklus();
  keur('is er niets te melden, dan blijft het stil', verstuurd.length === 0,
    verstuurd.length);
}
{
  zetKlaar();
  verstuurd = [];
  facturen.recFtest = { id: 'recFtest', fields: { Factuur: 'F-9', Klant: ['X BV'],
    'Dagen te laat': 4, Totaal: 100, Status: 'Verstuurd' } };
  const uit = { ...env, VAPID_PUBLIEK: '', VAPID_PRIVE: '' };
  wachtjes.length = 0;
  await worker.scheduled({ cron: '0 5 * * *' }, uit, ctx);
  await Promise.all(wachtjes);
  keur('staat push uit, dan gaat er niets de deur uit', verstuurd.length === 0);
  /* En het werk dat er niet van afhangt gaat gewoon door. Zonder deze
     controle zou de regel hierboven ook slagen als de hele dagklus stilviel. */
  keur('maar de facturen worden wel gewoon op Te laat gezet',
    facturen.recFtest.fields.Status === 'Te laat',
    facturen.recFtest.fields.Status);
}

/* =========================================================================
   Het wijzigverzoek van een klant.

   Een klant kan hiermee vragen om een extra stop of een ander afleveradres.
   Vragen — niet zetten. Beide veranderen de prijs, en als de klant die zelf
   kan bijstellen bepaalt hij je factuur. Deze proef bewaakt precies dat: dat
   er een verzoek klaarkomt en dat er niets aan de rit verandert.
   ========================================================================= */
console.log('\n=== het wijzigverzoek ===\n');

const KLANTCODE = 'klantcode-abcdefgh';
let klanten, ritSleutels;

/* Het klantportaal werkt met een betekenisloze sleutel per rit, niet met het
   record-id. Die sleutel komt uit het overzicht, dus die halen we net zo op
   als een klant dat doet. */
const klantDoe = (lading) => worker.fetch(new Request('https://p.dev/', {
  method: 'POST',
  headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
             'X-Portaal-Code': KLANTCODE, 'CF-Connecting-IP': '10.0.1.' + (1 + Math.floor(Math.random() * 200)) },
  body: JSON.stringify(lading)
}), env);

const oudeFetch = globalThis.fetch;
globalThis.fetch = async (url, opties = {}) => {
  const u = String(url);
  const m = opties.method || 'GET';
  if (u.includes('/tblK')) {
    /* De ritten van een klant komen niet uit een filter maar uit het
       koppelveld op zijn eigen record. Dat moet deze nabootsing dus ook doen,
       anders krijgt de klant een lege lijst en slaagt de proef nergens door. */
    const klantRec = {
      id: 'recKlant000000001',
      fields: { Klantnaam: 'Janssen BV', Portaalcode: KLANTCODE,
                'Soort klant': 'Vaste klant', Klantnummer: 7,
                Ritten: Object.keys(ritten).map((id) => ({ id })) }
    };
    if (/\/tblK\/rec[A-Za-z0-9]{14}$/.test(u.split('?')[0])) {
      return new Response(JSON.stringify(klantRec), { status: 200 });
    }
    const leesbaar = decodeURIComponent(u.replace(/\+/g, ' '));
    const gezocht = (leesbaar.match(/\{Portaalcode\} = '([^']*)'/) || [])[1];
    return new Response(JSON.stringify({
      records: gezocht === KLANTCODE ? [klantRec] : [] }), { status: 200 });
  }
  return oudeFetch(url, opties);
};

async function sleutelVan(ritId) {
  const res = await klantDoe({ actie: 'klantoverzicht' });
  const data = await res.json();
  const idx = Object.keys(ritten).indexOf(ritId);
  return { data, rit: (data.ritten || [])[idx] };
}

{
  zetKlaar();
  /* Alleen ritten van deze klant, en eentje die nog gepland staat. */
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }] } } };

  const { data, rit } = await sleutelVan('recGeplandGeen001');
  keur('de klant ziet zijn zending', !!rit, JSON.stringify(data).slice(0, 200));
  keur('en mag er een wijziging voor vragen', rit && rit.magWijzigen === true);
  keur('er ligt nog geen verzoek', rit && rit.wijzigStand === '');

  const res = await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel,
    soort: 'Extra stop', tekst: 'Er moet een doos mee naar Breda, Hoofdstraat 12.' });
  keur('het verzoek wordt aangenomen', res.status === 200, res.status);

  const f = ritten.recGeplandGeen001.fields;
  keur('het staat als Open in de administratie', f['Wijzigverzoek status'] === 'Open',
    f['Wijzigverzoek status']);
  keur('met de tekst van de klant erbij',
    /Breda/.test(f.Wijzigverzoek || ''), f.Wijzigverzoek);
  keur('en het soort dat hij koos', f['Wijzigverzoek soort'] === 'Extra stop',
    f['Wijzigverzoek soort']);

  /* Dit is waar het om gaat. */
  keur('de rit zelf is NIET veranderd: geen stop erbij',
    f['Extra stops'] === undefined, f['Extra stops']);
  keur('geen ander afleveradres', f.Afleverlocatie === undefined, f.Afleverlocatie);
  keur('geen andere kilometers', f.Kilometers === 30, f.Kilometers);
  keur('en de status staat nog gewoon op Gepland', f.Status === 'Gepland', f.Status);
}

console.log('\nwat een klant niet mag');
{
  const { rit } = await sleutelVan('recGeplandGeen001');
  const res = await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel,
    soort: 'Extra stop', tekst: 'En nog een doos naar Tilburg.' });
  keur('een tweede verzoek terwijl er al een openstaat wordt geweigerd',
    res.status === 409, res.status);
  keur('en het eerste verzoek staat er nog ongeschonden',
    /Breda/.test(ritten.recGeplandGeen001.fields.Wijzigverzoek || ''));
  keur('de knop is dan ook weg', rit.magWijzigen === false, rit.magWijzigen);
}
{
  zetKlaar();
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Onderweg', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }] } } };
  const { rit } = await sleutelVan('recGeplandGeen001');
  const res = await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel,
    soort: 'Extra stop', tekst: 'Toch nog even langs Breda.' });
  keur('een rit die al onderweg is kan hij niet meer wijzigen', res.status === 409, res.status);
  const tekst = await res.text();
  keur('en hij krijgt te horen dat hij moet bellen', /bel/i.test(tekst), tekst.slice(0, 120));
}
{
  zetKlaar();
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }] } } };
  const { rit } = await sleutelVan('recGeplandGeen001');

  const leeg = await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel,
    soort: 'Extra stop', tekst: '  ' });
  keur('een leeg verzoek wordt geweigerd', leeg.status === 400, leeg.status);

  /* Het soort gaat een keuzelijst in Airtable in. Staat er iets anders in dan
     wat erin mag, dan weigert Airtable de hele update en is het verzoek weg. */
  await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel,
    soort: 'Gratis rijden graag', tekst: 'Iets bijzonders.' });
  keur('een verzonnen soort wordt teruggebracht tot Iets anders',
    ritten.recGeplandGeen001.fields['Wijzigverzoek soort'] === 'Iets anders',
    ritten.recGeplandGeen001.fields['Wijzigverzoek soort']);

  /* En een rit van iemand anders. */
  const vreemd = await klantDoe({ actie: 'klantwijzig', rit: 'a'.repeat(16),
    soort: 'Extra stop', tekst: 'De rit van de buurman.' });
  keur('een zending die niet van hem is bestaat niet voor hem',
    vreemd.status === 404, vreemd.status);
}

console.log('\nde lange tekst afkappen');
{
  zetKlaar();
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }] } } };
  const { rit } = await sleutelVan('recGeplandGeen001');
  await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel, soort: 'Iets anders',
    tekst: 'A'.repeat(5000) });
  const t = ritten.recGeplandGeen001.fields.Wijzigverzoek || '';
  keur('een tekst van vijfduizend tekens wordt afgekapt', t.length === 1000, t.length);
}

console.log('\njouw kant: inwilligen of afwijzen');
{
  zetKlaar();
  ritten.recGeplandGeen001.fields['Wijzigverzoek'] = 'Doos mee naar Breda.';
  ritten.recGeplandGeen001.fields['Wijzigverzoek soort'] = 'Extra stop';
  ritten.recGeplandGeen001.fields['Wijzigverzoek status'] = 'Open';

  const raar = await doe({ actie: 'wijzigbesluit', id: 'recGeplandGeen001',
    besluit: 'Misschien' });
  keur('een besluit dat niet bestaat wordt geweigerd', raar.status === 400, raar.status);

  const res = await doe({ actie: 'wijzigbesluit', id: 'recGeplandGeen001',
    besluit: 'Ingewilligd' });
  keur('inwilligen lukt', res.status === 200, res.status);
  keur('het verzoek staat op Ingewilligd',
    ritten.recGeplandGeen001.fields['Wijzigverzoek status'] === 'Ingewilligd');
  keur('en de tekst van de klant blijft staan als bewijs',
    /Breda/.test(ritten.recGeplandGeen001.fields.Wijzigverzoek || ''));
  /* Inwilligen verandert de rit niet: dat doe je zelf, met de knoppen die er
     al voor zijn. Uit een zin een aantal kilometers raden geeft een verkeerde
     factuur. */
  keur('maar de rit is er niet stilletjes door veranderd',
    ritten.recGeplandGeen001.fields.Kilometers === 30 &&
    ritten.recGeplandGeen001.fields['Extra stops'] === undefined);

  const nogeens = await doe({ actie: 'wijzigbesluit', id: 'recGeplandGeen001',
    besluit: 'Afgewezen' });
  keur('een tweede besluit mag: je mag je bedenken', nogeens.status === 200, nogeens.status);
}
{
  zetKlaar();
  const res = await doe({ actie: 'wijzigbesluit', id: 'recMetKlant000001',
    besluit: 'Ingewilligd' });
  keur('een rit zonder verzoek geeft een nette melding', res.status === 409, res.status);
}

console.log('\nde melding erover');
{
  zetKlaar();
  ritten.recGeplandGeen001.fields['Wijzigverzoek'] = 'Doos mee naar Breda.';
  ritten.recGeplandGeen001.fields['Wijzigverzoek soort'] = 'Extra stop';
  ritten.recGeplandGeen001.fields['Wijzigverzoek status'] = 'Open';
  verstuurd = [];
  wachtjes.length = 0;
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  await Promise.all(wachtjes);
  keur('een open verzoek geeft meteen een seintje', verstuurd.length === 1, verstuurd.length);
  keur('en wordt afgestempeld',
    !!ritten.recGeplandGeen001.fields['Pushmelding wijzigverzoek op']);

  verstuurd = [];
  wachtjes.length = 0;
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  await Promise.all(wachtjes);
  keur('de minuut erna komt hij niet nog eens', verstuurd.length === 0, verstuurd.length);
}
{
  /* Handel je het af en vraagt de klant iets nieuws, dan hoort de stempel weg
     te zijn zodat je wél een seintje krijgt. */
  zetKlaar();
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }],
    Wijzigverzoek: 'Eerdere vraag.', 'Wijzigverzoek soort': 'Iets anders',
    'Wijzigverzoek status': 'Afgewezen',
    'Pushmelding wijzigverzoek op': '2026-09-01T10:00:00.000Z' } } };
  const { rit } = await sleutelVan('recGeplandGeen001');
  keur('na een afgehandeld verzoek mag hij weer vragen', rit.magWijzigen === true);
  await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel, soort: 'Extra stop',
    tekst: 'Nu toch een stop erbij.' });
  keur('de oude stempel is gewist',
    !ritten.recGeplandGeen001.fields['Pushmelding wijzigverzoek op'],
    ritten.recGeplandGeen001.fields['Pushmelding wijzigverzoek op']);

  verstuurd = [];
  wachtjes.length = 0;
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  await Promise.all(wachtjes);
  keur('dus het tweede verzoek geeft ook een seintje', verstuurd.length === 1, verstuurd.length);
}

console.log('\nper ritsoort');

/* Een wijzigverzoek mag bij alle vier de soorten, want de grens is de status
   en niet het soort: staat de rit nog op Gepland, dan kan er nog iets. Maar
   hoe dringend het is verschilt wél. Bij een standaardrit van volgende week
   kun je er rustig naar kijken; bij directe spoed sta je misschien al met de
   sleutel in je hand, en dan hoort de melding te blijven staan in plaats van
   weg te zakken. */
for (const [ritsoort, dringend] of [
  ['Standaard transport', false],
  ['Spoedtransport', true],
  ['Directe spoed', true],
  ['Internationaal transport', false]
]) {
  zetKlaar();
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    'Type rit': ritsoort, Klant: [{ id: 'recKlant000000001' }] } } };

  const { rit } = await sleutelVan('recGeplandGeen001');
  keur(ritsoort + ': de klant mag een wijziging vragen', rit.magWijzigen === true);
  keur(ritsoort + ': hij ziet welk soort rit het is', rit.type === ritsoort, rit.type);

  const res = await klantDoe({ actie: 'klantwijzig', rit: rit.sleutel,
    soort: 'Extra stop', tekst: 'Een doos mee naar Breda.' });
  keur(ritsoort + ': het verzoek komt aan', res.status === 200, res.status);
  keur(ritsoort + ': en de rit blijft onaangeroerd',
    ritten.recGeplandGeen001.fields.Kilometers === 30 &&
    ritten.recGeplandGeen001.fields['Extra stops'] === undefined &&
    ritten.recGeplandGeen001.fields['Type rit'] === ritsoort);

  verstuurd = [];
  lading = [];
  wachtjes.length = 0;
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  await Promise.all(wachtjes);
  keur(ritsoort + ': er gaat een seintje uit', verstuurd.length === 1, verstuurd.length);
  keur(ritsoort + ': met urgentie ' + (dringend ? 'high' : 'normal'),
    verstuurd.length === 1 &&
    verstuurd[0].urgency === (dringend ? 'high' : 'normal'),
    (verstuurd[0] || {}).urgency);
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
