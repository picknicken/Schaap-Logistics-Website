/* =========================================================================
   De pushmeldingen, van de sleutelpagina tot aan de pushdienst.

   Wat hier bewezen wordt en wat niet. Bewezen: dat de sleutels die
   `scripts/pushsleutels.html` in een echte browser maakt precies passen op wat
   de Worker verwacht, dat het bericht daarmee zo ondertekend en versleuteld de
   deur uit gaat dat de ontvangende telefoon het weer open krijgt, en dat een
   kapot abonnement, een platte pushdienst of een verkeerd geplakte sleutel de
   rest van de ronde niet meesleurt.

   Niet bewezen, en met geen enkele proef hier te bewijzen: dat er werkelijk een
   melding op een telefoon verschijnt. Of Apple of Google hem doorzet, of iOS
   hem toont, en of de telefoon het portaal vanaf het beginscherm heeft geopend
   — dat zie je alleen door op Proefmelding te drukken. Zie tests/LEESMIJ.md.

   Het openmaken doen we hier met een eigen uitwerking van RFC 8291 en niet met
   de code van de Worker. Zou je die hergebruiken, dan bewijs je alleen dat de
   Worker het eens is met zichzelf, en dat is precies de fout die je niet vindt.

   Waarom de sleutelpagina hier meedoet terwijl het maar een hulpscriptje is:
   het is het enige stuk van deze keten dat met de hand wordt bediend, één keer,
   en als het een sleutel in het verkeerde formaat afgeeft merk je dat pas
   doordat er nooit een melding komt — zonder foutmelding, want de pushdienst
   neemt het pakketje netjes aan en de telefoon gooit het weg.
   ========================================================================= */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env.PLAYWRIGHT_PAD ||
  '/opt/node22/lib/node_modules/playwright/index.js';
const pw = (await import(PW)).default;
const BASIS = process.env.SITE_ADRES || 'http://127.0.0.1:8097';
const hier = path.dirname(fileURLToPath(import.meta.url));

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

console.log('\n=== de sleutelpagina en de pushketen ===');

console.log('\nwat scripts/pushsleutels.html afgeeft');

/* De pagina in een echte browser laten draaien. Node kan dit niet nadoen: de
   pagina gebruikt de WebCrypto van de browser, en juist of die twee hetzelfde
   opleveren is wat we willen weten. */
const browser = await pw.chromium.launch();
const blad = await browser.newPage();
const stuk = [];
blad.on('pageerror', (e) => stuk.push(String(e)));
await blad.goto(BASIS + '/scripts/pushsleutels.html', { waitUntil: 'networkidle' });

/* De pagina maakt uit zichzelf niets: er hoort een mens op de knop te drukken.
   Dat is met opzet zo — je wilt geen nieuw sleutelpaar bij elke paginalading,
   want dan moeten alle telefoons zich opnieuw aanmelden. Dus drukken we. */
const knop = await blad.$('#maak');
keur('er staat een knop om de sleutels te maken', !!knop);
if (knop) { await knop.click(); }
const gelukt = await blad.waitForFunction(
  () => document.getElementById('publiek') &&
        document.getElementById('publiek').value.length > 10,
  { timeout: 15000 }).then(() => true).catch(() => false);
keur('en na één druk staan de velden gevuld', gelukt);
keur('het uitvoervak is dan zichtbaar',
  await blad.isVisible('#uit').catch(() => false));

const publiek = await blad.inputValue('#publiek').catch(() => '');
const prive = await blad.inputValue('#prive').catch(() => '');
await browser.close();

keur('de pagina laadt zonder javascriptfout', stuk.length === 0, stuk.join(' | '));
keur('er komt een publieke sleutel uit', publiek.length > 40, publiek.length + ' tekens');
keur('en een private sleutel', prive.length > 40, prive.length + ' tekens');

/* De publieke sleutel gaat rechtstreeks naar de browser van de chauffeur, die
   er `applicationServerKey` van maakt. Dat moet een ongecomprimeerd P-256 punt
   zijn: 65 bytes die met 0x04 beginnen, in base64url zonder opvulling. */
let pubBytes = null;
try { pubBytes = Buffer.from(publiek, 'base64url'); } catch { /* ongeldig */ }
keur('de publieke sleutel is 65 bytes', pubBytes && pubBytes.length === 65,
  pubBytes ? pubBytes.length + ' bytes' : 'niet te lezen');
keur('en begint met 0x04, zoals een ongecomprimeerd punt hoort',
  !!pubBytes && pubBytes.length > 0 && pubBytes[0] === 0x04,
  pubBytes && pubBytes.length ? '0x' + pubBytes[0].toString(16) : '-');
keur('hij bevat geen opvulling of onveilige tekens',
  /^[A-Za-z0-9_-]+$/.test(publiek), publiek.slice(0, 20));

/* De private sleutel gaat als secret naar Cloudflare. De Worker leest hem als
   JWK; ontbreekt er een veld, dan valt het ondertekenen om. */
let jwk = null;
try { jwk = JSON.parse(prive); } catch { /* geen json */ }
keur('de private sleutel is leesbare JSON', !!jwk);
keur('met precies de velden die de Worker verwacht',
  jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.d && jwk.x && jwk.y,
  jwk ? Object.keys(jwk).join(',') : '-');
keur('en op één regel, zodat plakken in een terminal niet misgaat',
  !/[\r\n]/.test(prive));

/* De twee helften horen bij elkaar: de x en y uit de private sleutel moeten
   dezelfde zijn als die in de publieke. Anders onderteken je met de ene en
   controleert de pushdienst met de andere. */
if (pubBytes && jwk) {
  const x = Buffer.from(pubBytes.subarray(1, 33)).toString('base64url');
  const y = Buffer.from(pubBytes.subarray(33, 65)).toString('base64url');
  keur('de twee helften horen bij hetzelfde paar',
    x === jwk.x && y === jwk.y, x === jwk.x ? 'y wijkt af' : 'x wijkt af');
}

if (!pubBytes || pubBytes.length !== 65 || !jwk || !jwk.d) {
  console.log('\nGeen bruikbaar sleutelpaar uit de pagina — de rest van deze ' +
    'proef zegt niets zonder.\n' + fouten + ' fout(en)\n');
  process.exit(1);
}

console.log('\nde Worker met precies deze sleutels');

/* Vanaf hier draaien we de echte Worker met de sleutels die de pagina zojuist
   maakte, met een nagebootste Airtable en een nagebootste pushdienst. */
const worker = (await import('../worker-portaal/portaal.js')).default;

let apparaten = [];
let aanvraag, rit;
let verstuurd = [];
let apparaatPatches = [];
let antwoordVanDienst = 201;

function zetKlaar() {
  apparaten = [
    { id: 'recP1', fields: { Apparaat: 'Telefoon', Voor: 'Eigenaar', Actief: true,
        Endpoint: 'https://fcm.googleapis.com/fcm/send/goed',
        'Sleutel p256dh': telefoonPubB64, 'Sleutel auth': telefoonAuthB64 } },
    { id: 'recP2', fields: { Apparaat: 'Oude telefoon', Voor: 'Eigenaar', Actief: true,
        Endpoint: 'https://fcm.googleapis.com/fcm/send/weg',
        'Sleutel p256dh': telefoonPubB64, 'Sleutel auth': telefoonAuthB64 } }
  ];
  aanvraag = { id: 'recQQQQQQQQQQQQQQ', fields: {
    Aanvraag: 'AAN-1', Status: { id: 's', name: 'Nieuw' },
    Dienst: { id: 'd', name: 'Spoedtransport' }, Bedrijf: 'Janssen',
    Ophaallocatie: 'Rotterdam', Afleverlocatie: 'Venlo' } };
  rit = { id: 'recAAAAAAAAAAAAAA', fields: {
    Rit: 'RIT-1', Ritdatum: '2026-09-10', Status: 'Gepland',
    'Geannuleerd door klant': true, Klantnaam: ['Klant BV'] } };
  verstuurd = [];
  apparaatPatches = [];
}

/* De sleutels van een telefoon, zoals een browser ze bij het aanmelden geeft. */
const telefoonPaar = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const telefoonPubB64 = Buffer.from(
  await crypto.subtle.exportKey('raw', telefoonPaar.publicKey)).toString('base64url');
const telefoonAuthB64 = Buffer.from(
  crypto.getRandomValues(new Uint8Array(16))).toString('base64url');

zetKlaar();

globalThis.fetch = async (url, opties = {}) => {
  const u = String(url);
  if (u.startsWith('https://fcm.googleapis.com/')) {
    verstuurd.push({ url: u, headers: opties.headers, lijf: opties.body });
    /* Het tweede apparaat is er niet meer: 410 Gone, precies wat een
       pushdienst zegt bij een verlopen abonnement. */
    if (u.endsWith('/weg')) { return new Response('gone', { status: 410 }); }
    return new Response('', { status: antwoordVanDienst });
  }
  if (u.includes('/tblP')) {
    if (opties.method === 'PATCH') {
      const id = u.split('/').pop();
      apparaatPatches.push({ id, velden: JSON.parse(opties.body).fields });
      return new Response(JSON.stringify({ id, fields: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ records: apparaten }), { status: 200 });
  }
  if (u.includes('/tblA')) {
    if (opties.method === 'PATCH') {
      Object.assign(aanvraag.fields, JSON.parse(opties.body).fields);
      return new Response(JSON.stringify(aanvraag), { status: 200 });
    }
    const nog = !aanvraag.fields['Pushmelding verstuurd op'];
    return new Response(JSON.stringify({ records: nog ? [aanvraag] : [] }), { status: 200 });
  }
  if (u.includes('/tblR')) {
    if (opties.method === 'PATCH') {
      Object.assign(rit.fields, JSON.parse(opties.body).fields);
      return new Response(JSON.stringify(rit), { status: 200 });
    }
    const nog = !!rit.fields['Geannuleerd door klant'] &&
                !rit.fields['Pushmelding annulering op'];
    return new Response(JSON.stringify({ records: nog ? [rit] : [] }), { status: 200 });
  }
  return new Response(JSON.stringify({ records: [] }), { status: 200 });
};

const metSleutels = {
  AIRTABLE_TOKEN: 'tok-geheim', AIRTABLE_BASE: 'appX',
  AIRTABLE_RITTEN: 'tblR', AIRTABLE_AANVRAGEN: 'tblA', AIRTABLE_PUSH: 'tblP',
  AIRTABLE_OPDRACHTEN: 'tblO', AIRTABLE_KLANTEN: 'tblK', AIRTABLE_FACTUREN: 'tblF',
  AIRTABLE_CHAUFFEURS: 'tblC', AIRTABLE_DAGSTATEN: 'tblD',
  TOEGESTANE_ORIGIN: 'https://schaaplogistics.nl', PORTAAL_CODE: 'hoofdsleutel-1234',
  VAPID_CONTACT: 'mailto:info@schaaplogistics.nl',
  VAPID_PUBLIEK: publiek, VAPID_PRIVE: prive
};

/* Een pushronde uitlokken zoals de cron dat doet. */
const wachtjes = [];
const ctx = { waitUntil: (p) => wachtjes.push(p) };
async function ronde(env, omgekeerd) {
  zetKlaar();
  if (omgekeerd) { apparaten.reverse(); }
  wachtjes.length = 0;
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  await Promise.all(wachtjes);
}

await ronde(metSleutels);

/* Twee dingen wachten op een seintje — een nieuwe aanvraag en een afzegging —
   en er staan twee telefoons aan. Vier pogingen dus. Dat aantal noemen we hier
   met opzet: gaat het er straks één meer of minder worden, dan is er iets aan
   de ronde veranderd en hoort iemand daar even naar te kijken. */
const naar = (eind) => verstuurd.filter((v) => v.url.endsWith(eind)).length;
keur('met deze sleutels gaat er werkelijk een bericht de deur uit',
  verstuurd.length === 4, verstuurd.length + ' verstuurd: ' +
  verstuurd.map((v) => v.url.split('/').pop()).join(','));
keur('en het draagt een VAPID-bewijs met de publieke sleutel erin',
  verstuurd.length > 0 &&
  String(verstuurd[0].headers.Authorization || '').includes(publiek),
  (verstuurd[0] || {}).headers && Object.keys(verstuurd[0].headers).join(','));
keur('het gaat versleuteld, met de kopregels die de RFC voorschrijft',
  verstuurd.length > 0 &&
  verstuurd[0].headers['Content-Encoding'] === 'aes128gcm' &&
  verstuurd[0].headers.TTL !== undefined,
  JSON.stringify((verstuurd[0] || {}).headers || {}).slice(0, 160));

console.log('\nkan de telefoon het pakketje ook werkelijk openmaken');

/* Dit is het stuk dat er het meest toe doet en dat je met geen enkele
   foutmelding merkt. Klopt de versleuteling niet, dan neemt de pushdienst het
   bericht netjes aan met een 201, en gooit de telefoon het stilletjes weg. Je
   ziet alleen: er komt nooit een melding. En dan ga je in het portaal zoeken,
   of in Airtable, terwijl het aan een verkeerd gezette byte ligt.

   Daarom maken we het hier open zoals een telefoon dat doet — met de private
   helft van het paar dat we bij het aanmelden hebben afgegeven, en met een
   eigen uitwerking van RFC 8291, niet met de code van de Worker. Anders bewijs
   je alleen dat de Worker het eens is met zichzelf. */

const hmac = async (sleutel, data) => {
  const k = await crypto.subtle.importKey('raw', sleutel, { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
};
const plak = (...delen) => {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0));
  let i = 0;
  for (const d of delen) { uit.set(d, i); i += d.length; }
  return uit;
};
const tekst = (t) => new TextEncoder().encode(t);

async function maakOpen(lijf, uaPriveSleutel, uaPub, authGeheim) {
  const b = new Uint8Array(lijf);
  const zout = b.subarray(0, 16);
  const idlen = b[20];
  const serverPub = b.subarray(21, 21 + idlen);
  const versleuteld = b.subarray(21 + idlen);

  const serverSleutel = await crypto.subtle.importKey('raw', serverPub,
    { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const gedeeld = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: serverSleutel }, uaPriveSleutel, 256));

  const prkSleutel = await hmac(authGeheim, gedeeld);
  const ikm = await hmac(prkSleutel,
    plak(tekst('WebPush: info'), new Uint8Array([0]), uaPub, serverPub, new Uint8Array([1])));
  const prk = await hmac(zout, ikm);
  const cek = (await hmac(prk,
    plak(tekst('Content-Encoding: aes128gcm'), new Uint8Array([0, 1])))).subarray(0, 16);
  const nonce = (await hmac(prk,
    plak(tekst('Content-Encoding: nonce'), new Uint8Array([0, 1])))).subarray(0, 12);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const open = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce }, aes, versleuteld));
  /* De opvulling er weer af: nullen tot aan de scheidingsbyte. */
  let eind = open.length;
  while (eind > 0 && open[eind - 1] === 0) { eind--; }
  return new TextDecoder().decode(open.subarray(0, eind - 1));
}

const uaPubRuw = new Uint8Array(
  await crypto.subtle.exportKey('raw', telefoonPaar.publicKey));
const authRuw = Buffer.from(telefoonAuthB64, 'base64url');

let open = null, openFout = '';
try {
  const pakket = verstuurd.find((v) => v.url.endsWith('/goed'));
  open = JSON.parse(await maakOpen(pakket.lijf, telefoonPaar.privateKey, uaPubRuw, authRuw));
} catch (e) { openFout = String(e && e.message || e); }

keur('de telefoon kan het bericht openmaken met haar eigen sleutel',
  !!open, openFout);
keur('en er staat leesbare tekst in, geen halve rommel',
  !!open && typeof open.titel === 'string' && open.titel.length > 0 &&
  typeof open.tekst === 'string', JSON.stringify(open));
keur('de aanvraag uit Airtable staat er werkelijk in',
  !!open && /Janssen|Klant BV/.test(open.tekst + ' ' + open.titel),
  open && open.tekst);

/* Met een andere sleutel hoort het juist niet open te gaan. Zonder deze
   controle zou de proef hierboven ook slagen als er helemaal niets versleuteld
   werd. */
const vreemdPaar = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
let vreemdLukte = false;
try {
  const pakket = verstuurd.find((v) => v.url.endsWith('/goed'));
  await maakOpen(pakket.lijf, vreemdPaar.privateKey, uaPubRuw, authRuw);
  vreemdLukte = true;
} catch { /* hoort niet te lukken */ }
keur('en met de sleutel van een andere telefoon gaat hij niet open', !vreemdLukte);

/* Het VAPID-bewijs, met de ogen van de pushdienst: die controleert de
   handtekening tegen de publieke sleutel die in dezelfde kopregel meekomt. */
let vapidGoed = false, vapidLading = null, vapidFout = '';
try {
  const kop = String(verstuurd[0].headers.Authorization || '');
  const t = /t=([^,\s]+)/.exec(kop)[1];
  const k = /k=([^,\s]+)/.exec(kop)[1];
  const [kopdeel, ladingdeel, handtekening] = t.split('.');
  vapidLading = JSON.parse(Buffer.from(ladingdeel, 'base64url').toString('utf8'));
  const pub = await crypto.subtle.importKey('raw', Buffer.from(k, 'base64url'),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  vapidGoed = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub,
    Buffer.from(handtekening, 'base64url'), tekst(kopdeel + '.' + ladingdeel));
} catch (e) { vapidFout = String(e && e.message || e); }

keur('de handtekening op het VAPID-bewijs klopt tegen de publieke sleutel',
  vapidGoed, vapidFout);
keur('het bewijs is gericht aan de pushdienst zelf, niet aan iets anders',
  !!vapidLading && vapidLading.aud === 'https://fcm.googleapis.com',
  vapidLading && vapidLading.aud);
keur('het verloopt, en niet pas over een jaar',
  !!vapidLading && vapidLading.exp > Date.now() / 1000 &&
  vapidLading.exp < Date.now() / 1000 + 24 * 3600 + 60,
  vapidLading && Math.round((vapidLading.exp - Date.now() / 1000) / 3600) + ' uur');
keur('en er staat in bij wie de pushdienst kan aankloppen',
  !!vapidLading && /^mailto:|^https:/.test(String(vapidLading.sub || '')),
  vapidLading && vapidLading.sub);

console.log('\neen kapot abonnement sleept de rest niet mee');
keur('beide seintjes bereikten de goede telefoon', naar('/goed') === 2, naar('/goed'));
keur('en de kapotte is ook geprobeerd, niet overgeslagen', naar('/weg') === 2, naar('/weg'));
keur('een 410 zet dat ene apparaat uit, zodat het niet elke minuut terugkomt',
  apparaatPatches.some((p) => p.id === 'recP2' && p.velden.Actief === false),
  JSON.stringify(apparaatPatches).slice(0, 200));
keur('en de goede telefoon blijft gewoon aan staan',
  !apparaatPatches.some((p) => p.id === 'recP1' && p.velden.Actief === false));

/* En de omgekeerde volgorde: eerst de kapotte. Dat is het geval dat er
   werkelijk toe doet — als de lus op de eerste fout stopt, valt hier het
   goede apparaat weg en merk je dat nooit. */
await ronde(metSleutels, true);
keur('en andersom net zo goed: de kapotte eerst, de goede krijgt hem nog',
  verstuurd.length === 4 && verstuurd[0].url.endsWith('/weg') &&
  verstuurd.filter((v) => v.url.endsWith('/goed')).length === 2,
  verstuurd.map((v) => v.url.split('/').pop()).join(','));

console.log('\neen pushfout blokkeert de aanvraag of de annulering niet');

/* De pushdienst weigert alles. De ronde moet dan gewoon aflopen, en de
   aanvraag en de annulering moeten afgestempeld blijven staan — push is een
   seintje, geen onderdeel van de administratie. */
antwoordVanDienst = 500;
let omgevallen = false;
try { await ronde(metSleutels); } catch (e) { omgevallen = true; }
keur('een pushdienst die 500 geeft laat de ronde niet omvallen', !omgevallen);
keur('en zet de telefoon niet uit — 500 is de dienst, niet het abonnement',
  !apparaatPatches.some((p) => p.id === 'recP1' && p.velden.Actief === false),
  JSON.stringify(apparaatPatches.filter((p) => p.id === 'recP1')).slice(0, 200));
keur('de aanvraag is en blijft gewoon afgestempeld',
  !!aanvraag.fields['Pushmelding verstuurd op']);
keur('en de annulering ook', !!rit.fields['Pushmelding annulering op']);

antwoordVanDienst = 201;
const echteMock = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  if (String(url).startsWith('https://fcm.googleapis.com/')) {
    throw new Error('netwerk weg');
  }
  return echteMock(url, o);
};
omgevallen = false;
try { await ronde(metSleutels); } catch (e) { omgevallen = true; }
keur('een netwerkfout naar de pushdienst ook niet', !omgevallen);
keur('en de aanvraag staat er nog steeds goed bij',
  !!aanvraag.fields['Pushmelding verstuurd op']);

/* De rest van de proef gaat over gewone verzoeken; de pushdienst hoeft niet
   meer kapot te zijn. */
globalThis.fetch = echteMock;

console.log('\neen verkeerd geplakte sleutel');

/* De sleutel wordt eenmalig met de hand overgezet, en dat is precies waar het
   misgaat: de publieke in het vakje van de private, een halve regel, of een
   regel met witruimte eromheen. Wat er dan hoort te gebeuren is: geen melding,
   maar ook geen kapotte ronde en geen aanvraag die stilletjes op afgehandeld
   komt te staan terwijl niemand hem heeft gezien. */
for (const [naam, waarde] of [
  ['de publieke sleutel in het vakje van de private', publiek],
  ['een halve regel', prive.slice(0, 40)],
  ['een leeg paar accolades', '{}']
]) {
  zetKlaar();
  verstuurd = [];
  let viel = false;
  try { await ronde({ ...metSleutels, VAPID_PRIVE: waarde }); } catch { viel = true; }
  keur('met ' + naam + ' valt de ronde niet om', !viel);
  keur('  en gaat er niets de deur uit', verstuurd.length === 0, verstuurd.length);
}

/* Witruimte eromheen hoort juist géén probleem te zijn — een geplakte regel
   sleept vaak een enter mee. */
{
  zetKlaar();
  verstuurd = [];
  await ronde({ ...metSleutels, VAPID_PRIVE: '\n  ' + prive + '  \n' });
  keur('maar een enter of een spatie eromheen mag niets uitmaken',
    verstuurd.length === 4, verstuurd.length);
}

/* En de proefmelding: die knop bestaat juist om dit zichtbaar te maken. */
{
  zetKlaar();
  const proef = (env) => worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': 'hoofdsleutel-1234', 'CF-Connecting-IP': '10.0.0.8' },
    body: JSON.stringify({ actie: 'pushtest' })
  }), env);

  const kapot = await proef({ ...metSleutels, VAPID_PRIVE: '{}' });
  keur('een proefmelding met een kapotte sleutel zegt dat hij niet aankwam',
    kapot.status === 502, kapot.status);
  const uit = await proef({ ...metSleutels, VAPID_PUBLIEK: '', VAPID_PRIVE: '' });
  keur('en zonder sleutels zegt hij dat push nog niet is ingesteld',
    uit.status === 501, uit.status);
  const goed = await proef(metSleutels);
  keur('met goede sleutels komt hij wel aan', goed.status === 200, goed.status);
}

console.log('\nzonder sleutels blijft alles keurig dicht');
{
  const zonder = { ...metSleutels, VAPID_PUBLIEK: '', VAPID_PRIVE: '' };
  zetKlaar();
  verstuurd = [];
  await ronde(zonder);
  keur('zonder sleutels gaat er niets de deur uit', verstuurd.length === 0);
  keur('en wordt er ook niets afgestempeld — anders mis je die aanvraag ' +
    'later alsnog', !aanvraag.fields['Pushmelding verstuurd op']);

  /* De publieke sleutel mag pas naar de browser als het geheel werkt. */
  const vraag = (env) => worker.fetch(new Request('https://p.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'X-Portaal-Code': 'hoofdsleutel-1234', 'CF-Connecting-IP': '10.0.0.7' },
    body: JSON.stringify({ actie: 'overzicht', dag: '2026-09-10' })
  }), env);

  const uitZonder = await (await vraag(zonder)).json();
  keur('het portaal krijgt geen sleutel als push uitstaat',
    uitZonder.pushSleutel === '', JSON.stringify(uitZonder.pushSleutel));
  keur('en ziet dat push hier niet kan', uitZonder.kan && uitZonder.kan.push === false,
    JSON.stringify(uitZonder.kan));

  const uitMet = await (await vraag(metSleutels)).json();
  keur('met sleutels krijgt het portaal de publieke sleutel',
    uitMet.pushSleutel === publiek);
  keur('en de private sleutel gaat nooit mee',
    !JSON.stringify(uitMet).includes(JSON.parse(prive).d));

  /* Half ingevuld is ook uit. Dat is de stand waarin de repository nu staat:
     VAPID_PUBLIEK = "" in wrangler.toml en geen secret gezet. */
  for (const [naam, env] of [
    ['alleen een publieke sleutel', { ...metSleutels, VAPID_PRIVE: '' }],
    ['alleen een private sleutel', { ...metSleutels, VAPID_PUBLIEK: '' }],
    ['geen apparatentabel', { ...metSleutels, AIRTABLE_PUSH: '' }]
  ]) {
    zetKlaar();
    verstuurd = [];
    await ronde(env);
    keur('met ' + naam + ' blijft push uit', verstuurd.length === 0);
  }
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
