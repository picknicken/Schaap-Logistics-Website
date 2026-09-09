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
    /* Eén factuur opvragen op id geeft dat record terug, niet een lijst. Zonder
       dit onderscheid krijgt de Worker een antwoord zonder fields en houdt hij
       elke factuur voor niet-concept — dan slaagt de proef om de verkeerde
       reden: er wordt niets weggegooid, maar niet doordat de grens werkte. */
    const fid = (u.split('?')[0].match(/\/(rec[A-Za-z0-9]{14})$/) || [])[1];
    if (fid && m === 'GET') {
      return new Response(JSON.stringify(facturen[fid] || { id: fid, fields: {} }),
        { status: 200 });
    }
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
let klantExtra = {};

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
      fields: Object.assign({ Klantnaam: 'Janssen BV', Portaalcode: KLANTCODE,
                'Soort klant': 'Vaste klant', Klantnummer: 7,
                Ritten: Object.keys(ritten).map((id) => ({ id })) }, klantExtra)
    };
    if (/\/tblK\/rec[A-Za-z0-9]{14}$/.test(u.split('?')[0])) {
      if (m === 'PATCH') {
        const velden = JSON.parse(opties.body).fields;
        Object.assign(klantExtra, velden);
        return new Response(JSON.stringify({ id: klantRec.id,
          fields: Object.assign({}, klantRec.fields, velden) }), { status: 200 });
      }
      return new Response(JSON.stringify(klantRec), { status: 200 });
    }
    /* Zoeken gaat op de code zoals die er NU staat, niet op de code waarmee
       deze proef begon. Anders blijft een ingetrokken klant gewoon binnenkomen
       en bewijst de proef het tegenovergestelde van wat ze beweert. */
    const leesbaar = decodeURIComponent(u.replace(/\+/g, ' '));
    const gezocht = (leesbaar.match(/\{Portaalcode\} = '([^']*)'/) || [])[1];
    const huidig = String(klantRec.fields.Portaalcode || '');
    return new Response(JSON.stringify({
      records: huidig && gezocht === huidig ? [klantRec] : [] }), { status: 200 });
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

/* =========================================================================
   De drie remmen bij een lastige klant: een notitie, de zelfbediening dicht,
   en de toegang eruit.
   ========================================================================= */
console.log('\n=== de lastige klant ===\n');
console.log('de notitie');
{
  zetKlaar();
  klantExtra = {};
  const res = await doe({ actie: 'klantnotitie', klantId: 'recKlant000000001',
    notitie: '  Betaalt altijd te laat. Alleen vooruitbetaling.  ' });
  const data = await res.json();
  keur('een notitie opslaan lukt', res.status === 200, res.status);
  keur('de witruimte eromheen gaat eraf',
    klantExtra.Notitie === 'Betaalt altijd te laat. Alleen vooruitbetaling.',
    JSON.stringify(klantExtra.Notitie));
  keur('en jij krijgt hem terug', /te laat/.test(data.klant.notitie || ''),
    data.klant.notitie);

  await doe({ actie: 'klantnotitie', klantId: 'recKlant000000001',
    notitie: 'X'.repeat(5000) });
  keur('een notitie van vijfduizend tekens wordt afgekapt',
    klantExtra.Notitie.length === 2000, klantExtra.Notitie.length);

  await doe({ actie: 'klantnotitie', klantId: 'recKlant000000001', notitie: '' });
  keur('leeg opslaan haalt hem weg', klantExtra.Notitie === '',
    JSON.stringify(klantExtra.Notitie));
}

console.log('\nen die notitie blijft binnen');
{
  zetKlaar();
  klantExtra = { Notitie: 'Belt over alles. Niet meer aannemen na 18:00.',
                 'Zelfbediening uit': false };
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }] } } };

  const res = await klantDoe({ actie: 'klantoverzicht' });
  const rauw = await res.text();
  /* Dit is de controle die er werkelijk toe doet. De notitie is wat jij over
     een klant denkt; die hoort nooit bij hem op het scherm te komen, ook niet
     verstopt in een veld dat het portaal niet tekent. */
  keur('de notitie staat NERGENS in wat de klant terugkrijgt',
    !/Belt over alles/.test(rauw) && !/18:00/.test(rauw),
    rauw.slice(0, 200));
  keur('en het woord notitie komt er niet in voor',
    !/notitie/i.test(rauw), rauw.slice(0, 200));
}

console.log('\nde zelfbediening dicht');
{
  zetKlaar();
  klantExtra = {};
  ritten = { recGeplandGeen001: { id: 'recGeplandGeen001', fields: {
    Rit: 'RIT-4', Ritdatum: VANDAAG, Status: 'Gepland', Kilometers: 30,
    Klant: [{ id: 'recKlant000000001' }] } } };

  const aan = await sleutelVan('recGeplandGeen001');
  keur('met de zelfbediening aan mag hij annuleren', aan.rit.magAnnuleren === true);
  keur('en wijzigen', aan.rit.magWijzigen === true);
  keur('en er staat geen uitleg over bellen', aan.rit.zelfbedieningUit === false);

  const uit = await doe({ actie: 'klantzelf', klantId: 'recKlant000000001', uit: true });
  keur('uitzetten lukt', uit.status === 200, uit.status);
  keur('het staat aangevinkt in de administratie',
    klantExtra['Zelfbediening uit'] === true, klantExtra['Zelfbediening uit']);

  const dicht = await sleutelVan('recGeplandGeen001');
  keur('de annuleerknop is weg', dicht.rit.magAnnuleren === false);
  keur('de wijzigknop ook', dicht.rit.magWijzigen === false);
  keur('en hij ziet waaróm', dicht.rit.zelfbedieningUit === true);
  keur('maar hij ziet zijn zending gewoon nog',
    dicht.rit.ophaal !== undefined && dicht.rit.status === 'Gepland');

  /* De knoppen weghalen is geen rem. Dit is de rem. */
  const stiekemA = await klantDoe({ actie: 'klantannuleer', rit: aan.rit.sleutel,
    reden: 'Toch maar niet.' });
  keur('zelf een annuleerverzoek in elkaar zetten werkt niet',
    stiekemA.status === 403, stiekemA.status);
  keur('en de rit staat er onaangeroerd bij',
    ritten.recGeplandGeen001.fields.Status === 'Gepland',
    ritten.recGeplandGeen001.fields.Status);

  const stiekemW = await klantDoe({ actie: 'klantwijzig', rit: aan.rit.sleutel,
    soort: 'Extra stop', tekst: 'Een doos naar Breda.' });
  keur('en zelf een wijzigverzoek insturen ook niet',
    stiekemW.status === 403, stiekemW.status);
  keur('er staat dus ook geen verzoek klaar',
    ritten.recGeplandGeen001.fields.Wijzigverzoek === undefined,
    ritten.recGeplandGeen001.fields.Wijzigverzoek);

  const weer = await doe({ actie: 'klantzelf', klantId: 'recKlant000000001', uit: false });
  keur('weer aanzetten lukt', weer.status === 200, weer.status);
  const open = await sleutelVan('recGeplandGeen001');
  keur('en dan mag hij weer', open.rit.magAnnuleren === true &&
    open.rit.magWijzigen === true);

  const raar = await doe({ actie: 'klantzelf', klantId: 'recKlant000000001', uit: 'ja' });
  keur('een niet-schakelaar wordt geweigerd', raar.status === 400, raar.status);
}

console.log('\nde toegang eruit');
{
  zetKlaar();
  klantExtra = {};
  const res = await doe({ actie: 'toegangweg', klantId: 'recKlant000000001' });
  keur('intrekken lukt', res.status === 200, res.status);
  keur('de portaalcode is leeg', klantExtra.Portaalcode === '',
    JSON.stringify(klantExtra.Portaalcode));
  /* Zonder dit zou de automatisering in Airtable er bij de volgende ronde een
     nieuwe code op zetten en stond de deur meteen weer open. */
  keur('en het vinkje Uitnodiging versturen staat uit',
    klantExtra['Uitnodiging versturen'] === false,
    klantExtra['Uitnodiging versturen']);

  const weer = await klantDoe({ actie: 'klantoverzicht' });
  keur('de oude link komt er niet meer in', weer.status === 401, weer.status);

  const nogeens = await doe({ actie: 'toegangweg', klantId: 'recKlant000000001' });
  keur('een tweede keer intrekken zegt netjes dat er niets is',
    nogeens.status === 409, nogeens.status);
}

console.log('\nen wat een chauffeur hiermee mag');
{
  zetKlaar();
  const alsChauffeur = (lading) => worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': 'chauffeurcode-1234', 'CF-Connecting-IP': '10.0.2.9' },
    body: JSON.stringify(lading)
  }), env);
  for (const actie of ['klantnotitie', 'klantzelf', 'toegangweg']) {
    const r = await alsChauffeur({ actie, klantId: 'recKlant000000001',
      notitie: 'x', uit: true });
    keur('een chauffeur komt niet bij ' + actie, r.status === 401 || r.status === 403,
      r.status);
  }
}

/* =========================================================================
   Weggooien, en een chauffeur die zelf een rit oppakt.
   ========================================================================= */
console.log('\n=== weggooien ===\n');

let verwijderd = [];
{
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, opties = {}) => {
    if ((opties.method || 'GET') === 'DELETE') {
      verwijderd.push(String(url));
      return new Response('{"deleted":true}', { status: 200 });
    }
    return echt(url, opties);
  };

  /* Een geplande rit mag gewoon weg: dat is de vergissing en de proefrit. */
  zetKlaar();
  verwijderd = [];
  let res = await doe({ actie: 'ritweg', id: 'recGeplandGeen001' });
  keur('een geplande rit mag weg', res.status === 200, res.status);
  keur('en is werkelijk weggegooid', verwijderd.length === 1, verwijderd.length);

  /* Een uitgevoerde rit niet. Die is gereden: handtekening, kilometers in je
     dagstaat, meestal een factuur. */
  zetKlaar();
  verwijderd = [];
  res = await doe({ actie: 'ritweg', id: 'recAfgetekend0001' });
  keur('een uitgevoerde rit mag niet weg', res.status === 409, res.status);
  keur('en blijft dus staan', verwijderd.length === 0, verwijderd.length);
  let t = await res.text();
  keur('met de reden erbij: annuleren is het alternatief',
    /Geannuleerd/.test(t), t.slice(0, 160));

  /* Een geplande rit met een verstuurde factuur eraan: die factuur is het
     bewijs, en de rit ligt eronder. */
  zetKlaar();
  verwijderd = [];
  ritten.recGeplandGeen001.fields.Facturen = [{ id: 'recFactuur0000001' }];
  facturen.recFactuur0000001 = { id: 'recFactuur0000001',
    fields: { Factuur: 'F-1', Status: 'Verstuurd' } };
  res = await doe({ actie: 'ritweg', id: 'recGeplandGeen001' });
  keur('een rit met een verstuurde factuur eraan mag niet weg',
    res.status === 409, res.status);
  t = await res.text();
  keur('en verwijst naar de creditnota', /creditnota/i.test(t), t.slice(0, 160));

  /* Met alleen een concept eraan mag het wel. */
  zetKlaar();
  verwijderd = [];
  ritten.recGeplandGeen001.fields.Facturen = [{ id: 'recFactuur0000001' }];
  facturen.recFactuur0000001 = { id: 'recFactuur0000001',
    fields: { Factuur: 'F-1', Status: 'Concept' } };
  res = await doe({ actie: 'ritweg', id: 'recGeplandGeen001' });
  keur('met alleen een conceptfactuur eraan mag het wel', res.status === 200, res.status);

  console.log('\nen facturen');
  zetKlaar();
  verwijderd = [];
  facturen.recFactuur0000001 = { id: 'recFactuur0000001',
    fields: { Factuur: 'F-1', Status: 'Concept' } };
  res = await doe({ actie: 'factuurweg', id: 'recFactuur0000001' });
  keur('een conceptfactuur mag weg', res.status === 200, res.status);
  keur('en is weg', verwijderd.length === 1, verwijderd.length);

  for (const stand of ['Verstuurd', 'Te laat', 'Betaald']) {
    zetKlaar();
    verwijderd = [];
    facturen.recFactuur0000001 = { id: 'recFactuur0000001',
      fields: { Factuur: 'F-1', Status: stand } };
    res = await doe({ actie: 'factuurweg', id: 'recFactuur0000001' });
    keur('een factuur op ' + stand + ' mag NIET weg', res.status === 409, res.status);
    keur('  en blijft staan', verwijderd.length === 0, verwijderd.length);
  }

  globalThis.fetch = echt;
}

console.log('\n=== een chauffeur pakt zelf een rit op ===\n');
{
  const CHAUF = 'chauffeurscode-abcd';
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, opties = {}) => {
    const u = String(url);
    if (u.includes('/tblC')) {
      const leesbaar = decodeURIComponent(u.replace(/\+/g, ' '));
      const gezocht = (leesbaar.match(/\{Toegangscode\} = '([^']*)'/) || [])[1];
      return new Response(JSON.stringify({ records: gezocht === CHAUF
        ? [{ id: 'recChauffeur00001', fields: { Chauffeur: 'Piet', Rol: 'Chauffeur',
            Toegangscode: CHAUF, Actief: true } }] : [] }), { status: 200 });
    }
    return echt(url, opties);
  };
  const alsPiet = (lading) => worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': CHAUF, 'CF-Connecting-IP': '10.0.3.' + (1 + Math.floor(Math.random() * 200)) },
    body: JSON.stringify(lading)
  }), env);

  zetKlaar();
  ritten.recGeplandGeen001.fields.Ritdatum = VANDAAG;
  const zien = await (await alsPiet({ actie: 'overzicht', dag: VANDAAG })).json();
  const vrij = (zien.ritten || []).filter((r) => !r.chauffeur);
  keur('Piet ziet een rit die nog vrij ligt', vrij.length >= 1, JSON.stringify(zien.ritten || []).slice(0, 200));
  keur('en er staat geen geld bij',
    vrij.length && vrij[0].bedrag === undefined && vrij[0].winst === undefined,
    JSON.stringify(vrij[0] || {}).slice(0, 200));

  let res = await alsPiet({ actie: 'ritoppakken', id: 'recGeplandGeen001' });
  keur('hij kan hem oppakken', res.status === 200, res.status);
  keur('en staat er dan op', ritten.recGeplandGeen001.fields.Chauffeur === 'Piet',
    ritten.recGeplandGeen001.fields.Chauffeur);

  res = await alsPiet({ actie: 'ritoppakken', id: 'recGeplandGeen001' });
  keur('nog een keer oppakken zegt dat hij al van hem is', res.status === 409, res.status);

  /* Een rit die van iemand anders is. */
  zetKlaar();
  ritten.recGeplandGeen001.fields.Chauffeur = 'Klaas';
  res = await alsPiet({ actie: 'ritoppakken', id: 'recGeplandGeen001' });
  keur('een rit van Klaas kan hij niet overnemen', res.status === 409, res.status);
  let t = await res.text();
  keur('en hij hoort wie hem rijdt', /Klaas/.test(t), t.slice(0, 120));
  keur('Klaas blijft erop staan',
    ritten.recGeplandGeen001.fields.Chauffeur === 'Klaas');

  /* Loslaten. */
  zetKlaar();
  ritten.recGeplandGeen001.fields.Chauffeur = 'Piet';
  res = await alsPiet({ actie: 'ritloslaten', id: 'recGeplandGeen001' });
  keur('zijn eigen rit loslaten mag', res.status === 200, res.status);
  keur('en dan is hij weer vrij',
    !ritten.recGeplandGeen001.fields.Chauffeur,
    ritten.recGeplandGeen001.fields.Chauffeur);

  zetKlaar();
  ritten.recGeplandGeen001.fields.Chauffeur = 'Klaas';
  res = await alsPiet({ actie: 'ritloslaten', id: 'recGeplandGeen001' });
  keur('die van Klaas loslaten mag niet', res.status === 403, res.status);

  zetKlaar();
  ritten.recGeplandGeen001.fields.Chauffeur = 'Piet';
  ritten.recGeplandGeen001.fields.Status = 'Onderweg';
  res = await alsPiet({ actie: 'ritloslaten', id: 'recGeplandGeen001' });
  keur('en loslaten terwijl je onderweg bent ook niet', res.status === 409, res.status);

  /* En wat hij niet mag blijft wat hij niet mag. */
  for (const actie of ['ritweg', 'factuurweg', 'klantnotitie', 'toegangweg']) {
    const r = await alsPiet({ actie, id: 'recGeplandGeen001',
      klantId: 'recKlant000000001' });
    keur('een chauffeur komt niet bij ' + actie, r.status === 403, r.status);
  }

  globalThis.fetch = echt;
}

console.log('\n=== chauffeurs beheren ===\n');
{
  let mensen = {};
  const echt = globalThis.fetch;
  globalThis.fetch = async (url, opties = {}) => {
    const u = String(url);
    const m = opties.method || 'GET';
    if (u.includes('/tblC')) {
      const id = (u.split('?')[0].match(/\/(rec[A-Za-z0-9]{14})$/) || [])[1];
      if (id && m === 'PATCH') {
        Object.assign(mensen[id].fields, JSON.parse(opties.body).fields);
        return new Response(JSON.stringify(mensen[id]), { status: 200 });
      }
      if (id) { return new Response(JSON.stringify(mensen[id] || { id, fields: {} }), { status: 200 }); }
      if (m === 'POST') {
        const uit = [];
        for (const r of (JSON.parse(opties.body).records || [])) {
          const nid = 'recChauf' + String(Object.keys(mensen).length + 1).padStart(9, '0');
          mensen[nid] = { id: nid, fields: r.fields };
          uit.push(mensen[nid]);
        }
        return new Response(JSON.stringify({ records: uit }), { status: 200 });
      }
      /* zoekMedewerker zoekt op {Toegangscode} = '...' en laat niemand binnen
         bij meer dan één treffer. Geeft deze nabootsing altijd iedereen terug,
         dan komt geen enkele chauffeur binnen en meet de proef het verkeerde:
         een 401 op de deur in plaats van een 403 op de actie. */
      const q = decodeURIComponent(u.replace(/\+/g, ' '));
      const gezocht = (q.match(/\{Toegangscode\} = '([^']*)'/) || [])[1];
      const uit = gezocht === undefined
        ? Object.values(mensen)
        : Object.values(mensen).filter(
            (r) => String(r.fields.Toegangscode || '') === gezocht);
      return new Response(JSON.stringify({ records: uit }), { status: 200 });
    }
    return echt(url, opties);
  };

  zetKlaar();
  mensen = {};
  let res = await doe({ actie: 'nieuwechauffeur', naam: 'Piet Jansen',
    telefoon: '06 12345678', kenteken: 'xx-123-y' });
  let data = await res.json();
  keur('een chauffeur aanmaken lukt', res.status === 200, res.status);
  keur('en hij krijgt meteen een code', (data.code || '').length >= 12, data.code && data.code.length);
  keur('het kenteken gaat in hoofdletters',
    Object.values(mensen)[0].fields.Kenteken === 'XX-123-Y',
    Object.values(mensen)[0].fields.Kenteken);
  keur('hij staat op Actief', Object.values(mensen)[0].fields.Actief === true);
  keur('en op de rol Chauffeur',
    Object.values(mensen)[0].fields.Rol === 'Chauffeur');

  const eersteId = Object.keys(mensen)[0];
  const eersteCode = data.code;

  /* Twee keer dezelfde naam is geen kleinigheid: ritten worden op naam
     verdeeld, dus dan zien ze elkaars ritten. */
  res = await doe({ actie: 'nieuwechauffeur', naam: 'piet jansen' });
  keur('dezelfde naam nog eens wordt geweigerd', res.status === 409, res.status);
  let t = await res.text();
  keur('met uitleg waarom dat misgaat', /naam/i.test(t) && /ritten/i.test(t),
    t.slice(0, 160));

  res = await doe({ actie: 'nieuwechauffeur', naam: 'X' });
  keur('een naam van één letter ook', res.status === 400, res.status);

  console.log('\nde code komt niet zomaar langs');
  const lijst = await (await doe({ actie: 'chauffeurs' })).json();
  const rauw = JSON.stringify(lijst);
  keur('het overzicht noemt de chauffeur', /Piet Jansen/.test(rauw));
  keur('maar de toegangscode staat er NIET in', !rauw.includes(eersteCode),
    rauw.slice(0, 200));
  keur('wel dát hij er een heeft',
    lijst.chauffeurs[0].heeftCode === true, lijst.chauffeurs[0].heeftCode);
  keur('en het kenteken en telefoonnummer',
    lijst.chauffeurs[0].kenteken === 'XX-123-Y' &&
    /12345678/.test(lijst.chauffeurs[0].telefoon || ''),
    JSON.stringify(lijst.chauffeurs[0]));

  console.log('\nmaar wel als je erom vraagt');
  res = await doe({ actie: 'chauffeurcode', id: eersteId });
  data = await res.json();
  keur('de code opvragen lukt', res.status === 200, res.status);
  keur('en het is dezelfde als bij het aanmaken', data.code === eersteCode,
    data.code === eersteCode ? '' : 'anders');
  keur('hij is niet stiekem vervangen',
    mensen[eersteId].fields.Toegangscode === eersteCode);

  res = await doe({ actie: 'chauffeurcode', id: eersteId, nieuw: true });
  data = await res.json();
  keur('een nieuwe code vragen geeft een andere', data.code !== eersteCode);
  keur('en de oude is werkelijk vervangen',
    mensen[eersteId].fields.Toegangscode === data.code &&
    mensen[eersteId].fields.Toegangscode !== eersteCode);
  keur('de nieuwe is lang genoeg om niet te raden',
    (data.code || '').length >= 12, (data.code || '').length);

  console.log('\nbijwerken');
  res = await doe({ actie: 'chauffeurbij', id: eersteId,
    notitie: '  Rijbewijs verloopt in maart.  ', kenteken: 'ab-99-cd' });
  keur('notitie en kenteken bijwerken lukt', res.status === 200, res.status);
  keur('de witruimte gaat eraf',
    mensen[eersteId].fields.Notitie === 'Rijbewijs verloopt in maart.',
    JSON.stringify(mensen[eersteId].fields.Notitie));
  keur('en het kenteken staat in hoofdletters',
    mensen[eersteId].fields.Kenteken === 'AB-99-CD');

  res = await doe({ actie: 'chauffeurbij', id: eersteId, actief: false });
  keur('op non-actief zetten lukt', res.status === 200, res.status);
  keur('en dat staat er', mensen[eersteId].fields.Actief === false);

  /* De naam blijft met opzet buiten bereik: die staat op elke rit die deze
     persoon rijdt, en hem hier wijzigen maakt die ritten los van hun
     chauffeur. */
  await doe({ actie: 'chauffeurbij', id: eersteId, naam: 'Iemand anders' });
  keur('de naam is hier niet te wijzigen',
    mensen[eersteId].fields.Chauffeur === 'Piet Jansen',
    mensen[eersteId].fields.Chauffeur);

  res = await doe({ actie: 'chauffeurbij', id: eersteId });
  keur('een leeg verzoek wordt geweigerd', res.status === 400, res.status);

  console.log('\nen een chauffeur komt hier niet bij');
  const CH = 'chauffeurscode-wxyz';
  mensen.recChauf000000009 = { id: 'recChauf000000009', fields: {
    Chauffeur: 'Klaas', Rol: 'Chauffeur', Toegangscode: CH, Actief: true } };
  const alsKlaas = (lading) => worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': CH, 'CF-Connecting-IP': '10.0.4.' + (1 + Math.floor(Math.random() * 200)) },
    body: JSON.stringify(lading)
  }), env);
  for (const actie of ['chauffeurs', 'nieuwechauffeur', 'chauffeurbij', 'chauffeurcode']) {
    const r = await alsKlaas({ actie, id: eersteId, naam: 'Nieuw' });
    keur('Klaas komt niet bij ' + actie, r.status === 403, r.status);
  }

  globalThis.fetch = echt;
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
