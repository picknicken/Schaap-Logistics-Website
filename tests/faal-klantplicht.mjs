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
let ritten, facturen, apparaten, verstuurd, gemaakt;
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
    verstuurd.push({ url: u });
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
      Object.assign(ritten[id].fields, lees().fields);
      return new Response(JSON.stringify(ritten[id]), { status: 200 });
    }
    if (id) { return new Response(JSON.stringify(ritten[id] || { id, fields: {} }), { status: 200 }); }
    return new Response(JSON.stringify({ records: Object.values(ritten) }), { status: 200 });
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

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
