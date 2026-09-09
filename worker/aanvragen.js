/* =========================================================================
   Cloudflare Worker — neemt aanvragen van de website aan en schrijft ze in
   Airtable. Deze tussenlaag bestaat om één reden: de Airtable-sleutel mag
   niet in de website staan, want alles daar is voor iedere bezoeker leesbaar.

   Instellen (zie AIRTABLE.md voor de volledige stappen):
     wrangler secret put AIRTABLE_TOKEN      <- de persoonlijke toegangstoken
   en als gewone variabelen:
     AIRTABLE_BASE    appLUKMbBBkJUagFs
     AIRTABLE_TABEL   tblhvOATDAfvBmabA
     TOEGESTANE_ORIGIN  https://schaaplogistics.nl,https://picknicken.github.io
   ========================================================================= */

/* Alleen deze velden gaan door naar Airtable, en niet zomaar: per veld staat
   erbij wat er hoogstens in mag. Alles wat de aanvrager verder meestuurt wordt
   genegeerd — een open endpoint moet nooit zelf bepalen welke kolommen het
   beschrijft. De namen zijn exact de kolomnamen in de tabel.

   Waarom er een grens achter elk veld staat. Dit adres is openbaar. Zonder
   grens kan iemand er tweehonderdduizend tekens in een opmerkingveld doorheen
   duwen, vijf keer per minuut, en dan loopt niet alleen de tabel vol maar
   wordt het portaal ook onbruikbaar: die tekst komt op een ritkaart terecht.
   De maten zijn ruim genomen — een echte opmerking is twee zinnen — maar ze
   zijn er.

   `getal` betekent: alleen een getal binnen dit bereik, en anders niets. Een
   negatieve afstand of een negatieve prijsindicatie is geen aanvraag maar een
   poging, en die hoort niet in je administratie te belanden. */
const VELDREGELS = {
  'Dienst':                  { tekst: 60 },
  'Tijdvak':                 { tekst: 60 },
  'Ophaallocatie':           { tekst: 200 },
  'Ophaalpostcode':          { tekst: 10 },
  'Afleverlocatie':          { tekst: 200 },
  'Afleverpostcode':         { tekst: 10 },
  'Datum':                   { tekst: 30 },
  'Ophaaltijd':              { tekst: 20 },
  'Extra stops':             { tekst: 10 },
  'Omschrijving':            { tekst: 2000 },
  'Aantal colli':            { tekst: 60 },
  'Gewicht':                 { tekst: 60 },
  'Afmetingen':              { tekst: 60 },
  'Bedrijf':                 { tekst: 150 },
  'Contactpersoon':          { tekst: 150 },
  'Telefoon':                { tekst: 40 },
  'E-mail':                  { tekst: 150 },
  'Opmerkingen':             { tekst: 2000 }
};

/* Wat de server zelf invult, wat er ook binnenkomt.

   Deze twee stonden eerst gewoon op de lijst hierboven omdat het formulier ze
   meestuurt. Dat betekende dat iedereen ze kon meesturen — ook een status die
   zegt dat de aanvraag al is omgezet, en dan staat hij nergens meer in je
   lijstje en rijd je die rit niet. Wat de server kan weten, hoort de server te
   bepalen. */
const SERVERVELDEN = { 'Status': 'Nieuw', 'Bron': 'Website' };

/* `Geschatte afstand km` en `Prijsindicatie excl btw` staan met opzet niet in
   VELDREGELS hierboven. Ze worden niet aangenomen maar berekend; zie
   eigenBerekening() verderop. */

/* Eén waarde uit de aanvraag, teruggebracht tot wat er in mag. Geeft null
   terug als er niets bruikbaars in zit; die velden worden overgeslagen.

   Een object of een lijst wordt niet omgezet maar geweigerd. `String({})`
   levert "[object Object]" op, en dat in je administratie zetten is erger dan
   het weglaten: dan denk je dat de klant dat heeft ingevuld. */
function schoonVeld(regel, w) {
  if (w === null || w === undefined || w === '') { return null; }
  if (typeof w === 'object') { return null; }

  if (regel.getal) {
    const n = Number(w);
    if (!isFinite(n)) { return null; }
    if (n < regel.getal.min || n > regel.getal.max) { return null; }
    return n;
  }

  const tekst = String(w).slice(0, regel.tekst).trim();
  return tekst === '' ? null : tekst;
}

/* Zonder deze velden is een aanvraag niet op te volgen. */
const VERPLICHT = ['Bedrijf', 'Contactpersoon', 'Telefoon', 'E-mail'];

/* ---------------------------------------------------- de voorwaarden

   Algemene voorwaarden binden een klant alleen als hij ze vóór of bij het
   sluiten van de overeenkomst krijgt aangeboden in een vorm die hij kan
   bewaren. Het formulier laat daarom niet versturen zonder akkoord, en hier
   wordt dat nog een keer gecontroleerd: wat er in een browser gebeurt is geen
   bewijs, want die kan iedereen omzeilen.

   Het moment komt van deze server en niet van de bezoeker. De versie komt wel
   van de pagina — dat is nu eenmaal de tekst die hij te zien kreeg — maar hij
   moet gelijk zijn aan wat hieronder staat, zodat een oude pagina uit de cache
   van een browser geen akkoord kan opleveren op een tekst die niet meer geldt.

   Wijzig je de voorwaarden, dan verander je drie dingen tegelijk: deze regel,
   CONFIG.voorwaardenVersie in assets/site.js, en de PDF. */
const VOORWAARDEN_VERSIE = '2026-09-08';
const VOORWAARDENVELD    = 'Voorwaarden geaccepteerd';

/* =========================================================================
   De prijsberekening, hier op de server.

   Dit is een kopie van de som in assets/site.js. Dat is bewust een kopie en
   geen gedeeld bestand: een Cloudflare Worker en een browserscript delen geen
   module zonder er een bouwstap bij te halen, en die staat er met opzet niet.
   De prijs is het waard om op twee plekken te staan; wijzig je een tarief,
   wijzig hem dan hier mee. De tests hieronder rekenen beide kanten na.

   Waarom dit hier moet staan. De browser rekende de afstand en de prijs uit en
   stuurde ze mee. Dat is prima om te tonen, maar niet om te bewaren: wie het
   formulier omzeilt kan een aanvraag insturen met afstand 1 en prijs 1, en dat
   getal loopt door naar de opdracht, de rit en de conceptfactuur. Wat de
   server zelf kan uitrekenen, hoort de server uit te rekenen.
   ========================================================================= */

const TARIEF = {
  minimum: 75,
  wegfactor: 1.25,
  stoptoeslag: 25,
  ritten: {
    'Standaard transport':      { start: 75,  km: 1.00 },
    'Spoedtransport':           { start: 100, km: 1.50 },
    'Directe spoed':            { start: 125, km: 2.00 },
    /* Over de grens rekenen we niets uit: de postcodetabel hieronder is
       Nederlands, en een verzonnen afstand is erger dan geen afstand. */
    'Internationaal transport': { start: 150, km: 2.00, minimum: 200, buitenland: true }
  },
  tijden: {
    'Overdag':                { deel: 0,    bodem: 0  },
    'Avondrit (18:00-23:00)': { deel: 0.20, bodem: 25 },
    'Nacht- of weekendrit':   { deel: 0.40, bodem: 50 }
  }
};

/* Middelpunten van de Nederlandse postcoderegio's (eerste twee cijfers).
   Genoeg voor een prijsindicatie; niet voor navigatie. */
const REGIO = {
  10:[52.37,4.90], 11:[52.31,4.95], 12:[52.22,5.17], 13:[52.37,5.22], 14:[52.28,5.16],
  15:[52.44,4.83], 16:[52.64,5.06], 17:[52.80,4.79], 18:[52.63,4.75], 19:[52.47,4.63],
  20:[52.38,4.64], 21:[52.29,4.58], 22:[52.20,4.42], 23:[52.16,4.49], 24:[52.13,4.66],
  25:[52.08,4.31], 26:[52.01,4.36], 27:[52.06,4.49], 28:[52.01,4.71], 29:[51.93,4.58],
  30:[51.92,4.48], 31:[51.91,4.35], 32:[51.85,4.33], 33:[51.81,4.67], 34:[52.03,5.09],
  35:[52.09,5.12], 36:[52.14,5.04], 37:[52.09,5.23], 38:[52.16,5.39], 39:[52.02,5.56],
  40:[51.89,5.43], 41:[51.93,5.10], 42:[51.83,4.97], 43:[51.63,3.95], 44:[51.50,3.75],
  45:[51.32,3.75], 46:[51.49,4.29], 47:[51.53,4.47], 48:[51.59,4.78], 49:[51.64,4.86],
  50:[51.56,5.09], 51:[51.69,5.07], 52:[51.70,5.30], 53:[51.81,5.25], 54:[51.68,5.57],
  55:[51.43,5.40], 56:[51.44,5.48], 57:[51.48,5.66], 58:[51.53,5.90], 59:[51.37,6.17],
  60:[51.25,5.71], 61:[51.10,5.87], 62:[50.85,5.69], 63:[50.87,5.83], 64:[50.92,5.95],
  65:[51.84,5.86], 66:[51.81,5.72], 67:[52.02,5.66], 68:[51.98,5.91], 69:[51.96,6.08],
  70:[51.97,6.29], 71:[51.97,6.60], 72:[52.14,6.20], 73:[52.21,5.97], 74:[52.25,6.16],
  75:[52.23,6.85], 76:[52.36,6.66], 77:[52.58,6.62], 78:[52.78,6.90], 79:[52.72,6.40],
  80:[52.51,6.09], 81:[52.39,6.28], 82:[52.52,5.47], 83:[52.71,5.75], 84:[52.82,6.10],
  85:[52.96,5.86], 86:[53.03,5.66], 87:[53.10,5.50], 88:[53.19,5.54], 89:[53.20,5.79],
  90:[53.18,5.83], 91:[53.32,5.99], 92:[53.10,6.10], 93:[53.14,6.42], 94:[53.00,6.56],
  95:[53.05,6.90], 96:[53.15,6.85], 97:[53.22,6.57], 98:[53.28,6.40], 99:[53.32,6.86]
};

/* Precies vier cijfers, en een regio die bestaat. Alles daarbuiten is geen
   Nederlandse postcode en levert dus geen afstand op. */
function postcode(w) {
  const m = /^\s*(\d{4})\s*$/.exec(String(w || ''));
  return m && REGIO[parseInt(m[1].slice(0, 2), 10)] ? m[1] : null;
}

function hemelsbreed(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a[0] * rad) * Math.cos(b[0] * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* De rijafstand tussen twee postcodes, of null als een van de twee niet
   deugt. Zelfde som als op de site: hemelsbreed maal de wegfactor, en binnen
   dezelfde regio blijft er altijd een rit over. */
function afstandTussen(pcA, pcB) {
  const a = REGIO[parseInt(String(pcA).slice(0, 2), 10)];
  const b = REGIO[parseInt(String(pcB).slice(0, 2), 10)];
  if (!a || !b) { return null; }
  return Math.max(5, Math.round(hemelsbreed(a, b) * TARIEF.wegfactor));
}

function centen(bedrag) { return Math.round(bedrag * 100) / 100; }

/* Ritprijs = starttarief + kilometers, aangevuld tot het minimum, en pas
   daarna de toeslagen. Identiek aan bereken() in assets/site.js. */
function prijsVoor(dienst, km, tijdvak, stops) {
  const r = TARIEF.ritten[dienst];
  if (!r) { return null; }
  const t = TARIEF.tijden[tijdvak] || TARIEF.tijden['Overdag'];
  const ritprijs = r.start + km * r.km;
  const bodem = r.minimum || TARIEF.minimum;
  const correctie = Math.max(0, bodem - ritprijs);
  const basis = ritprijs + correctie;
  const tijdSom = t.deel ? centen(Math.max(basis * t.deel, t.bodem)) : 0;
  return centen(basis + tijdSom + stops * TARIEF.stoptoeslag);
}

/* Hoeveel extra stops er werkelijk zijn. Wat er binnenkomt is soms een getal,
   soms een leeg veld en soms iets als "2 adressen". */
function stopsUit(w) {
  const n = parseInt(String(w === undefined || w === null ? '' : w).trim(), 10);
  if (isNaN(n) || n < 0) { return 0; }
  return Math.min(n, 20);
}

/* De afstand en de prijs zoals de server ze ziet. Kan hij ze niet uitrekenen
   — buitenland, een adres zonder postcode, een dienst die we niet kennen —
   dan komt er niets. Leeg is beter dan verzonnen: een leeg veld valt op in het
   portaal, een verkeerd getal ziet eruit alsof het klopt. */
function eigenBerekening(velden) {
  const dienst = velden['Dienst'];
  const r = TARIEF.ritten[dienst];
  if (!r || r.buitenland) { return {}; }

  const van = postcode(velden['Ophaalpostcode']);
  const naar = postcode(velden['Afleverpostcode']);
  if (!van || !naar) { return {}; }

  const km = afstandTussen(van, naar);
  if (km === null) { return {}; }

  const prijs = prijsVoor(dienst, km, velden['Tijdvak'], stopsUit(velden['Extra stops']));
  if (prijs === null) { return {}; }

  return { 'Geschatte afstand km': km, 'Prijsindicatie excl btw': prijs };
}

/* ---------------------------------------------------------------- de rem

   Dit adres is openbaar: iedereen die het vindt kan het aanroepen. Zonder rem
   kan één iemand duizend aanvragen per minuut insturen en loopt de tabel vol.

   De teller staat in het geheugen van de Worker zelf. Dat is geen sluitende
   bewaking — Cloudflare draait meerdere exemplaren naast elkaar en ruimt ze
   tussendoor op, dus wie het echt wil kan eromheen. Maar het kost niets, het
   vraagt geen enkele instelling en het stopt precies waar het om gaat: één
   bron die doorratelt. Wil je het waterdicht, dan zet je er in Cloudflare een
   Rate limiting rule voor in de plaats. */
const REM_VENSTER = 60 * 1000;   /* per minuut */
const REM_MAX     = 5;           /* zoveel aanvragen mag één adres */
const remTeller   = new Map();

function magDoor(ip) {
  const nu = Date.now();

  /* Oude regels opruimen. Zonder dit groeit de Map ongemerkt door. */
  for (const [sleutel, rij] of remTeller) {
    if (nu - rij.begin > REM_VENSTER) { remTeller.delete(sleutel); }
  }

  const rij = remTeller.get(ip);
  if (!rij || nu - rij.begin > REM_VENSTER) {
    remTeller.set(ip, { begin: nu, aantal: 1 });
    return true;
  }
  rij.aantal += 1;
  return rij.aantal <= REM_MAX;
}

const FOTOVELD    = "Foto's";
const FOTONAMEN   = "Foto's meegestuurd";
const MAX_FOTO_MB = 5;     /* limiet van het Airtable-uploadendpoint */
const MAX_BODY_MB = 30;    /* hele verzoek, base64 meegerekend */

/* Wat er als foto binnen mag komen. Een lijst en geen "alles wat met image/
   begint": image/svg+xml begint daar ook mee, en een svg is geen plaatje maar
   een document dat script kan bevatten. Dat wil je niet als bijlage bij een
   aanvraag hebben staan, ook al opent Airtable hem op zijn eigen adres. */
const FOTOSOORTEN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/* Een bestandsnaam gaat mee naar Airtable. Schuine strepen horen er niet in,
   en een naam van vijfduizend tekens ook niet. Dezelfde schoonmaak als in het
   chauffeursportaal, want daar kwam dit eerder al langs. */
function schoneBestandsnaam(w) {
  const schoon = String(w || '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '')
    .slice(0, 60);
  return schoon || 'foto';
}

/* Meer dan een adres toestaan. Tijdens een verhuizing naar een eigen
   domeinnaam draaien het oude en het nieuwe adres een tijd naast elkaar; met
   een enkele waarde zou je moeten kiezen welke van de twee stuk mag. Scheiden
   met een komma. */
function magVanOrigin(origin, toegestaan) {
  if (!origin) { return false; }
  return String(toegestaan || '')
    .split(',')
    .map((a) => a.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .includes(origin.replace(/\/$/, ''));
}

export default {
  async fetch(verzoek, env) {
    const origin = verzoek.headers.get('Origin') || '';
    const toegestaan = magVanOrigin(origin, env.TOEGESTANE_ORIGIN);

    /* De site stuurt Content-Type: application/json, dus de browser doet eerst
       een preflight. Zonder dit antwoord komt de POST nooit aan. */
    if (verzoek.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin, toegestaan) });
    }
    if (verzoek.method !== 'POST') {
      return antwoord(405, { fout: 'Alleen POST' }, origin, toegestaan);
    }
    if (!toegestaan) {
      return antwoord(403, { fout: 'Onbekende herkomst' }, origin, false);
    }

    /* Pas remmen nadat de herkomst gecontroleerd is: anders vult een vreemde
       site de teller voor een bezoeker die netjes op onze eigen site zit. */
    const ip = verzoek.headers.get('CF-Connecting-IP') || 'onbekend';
    if (!magDoor(ip)) {
      return antwoord(429, {
        fout: 'U heeft net al een aanvraag verstuurd. Wacht even, of bel ons.'
      }, origin, true);
    }

    const lengte = Number(verzoek.headers.get('Content-Length') || 0);
    if (lengte > MAX_BODY_MB * 1024 * 1024) {
      return antwoord(413, { fout: 'Aanvraag te groot' }, origin, true);
    }

    let body;
    try {
      body = await verzoek.json();
    } catch {
      return antwoord(400, { fout: 'Ongeldige JSON' }, origin, true);
    }

    /* `null`, `42` en `[]` zijn alle drie geldige JSON en kwamen hier dus
       langs de vangnet hierboven. Daarna werd er meteen een veld van gelezen
       en viel de Worker om — een verzoek van vier tekens gaf een 500. Geldige
       JSON is nog geen aanvraag. */
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return antwoord(400, { fout: 'Ongeldige aanvraag' }, origin, true);
    }

    /* Honeypot: het formulier heeft een verborgen veld dat een mens leeg laat.
       Ingevuld betekent een bot. We melden succes, zodat de bot niets leert. */
    if (typeof body.controle === 'string' && body.controle.trim() !== '') {
      return antwoord(200, { ok: true }, origin, true);
    }

    const binnen = body.velden && typeof body.velden === 'object' ? body.velden : {};
    const velden = {};
    for (const naam of Object.keys(VELDREGELS)) {
      /* Lege en onbruikbare waarden weglaten: een lege string naar een
         keuzeveld is een fout in Airtable, en een leeg veld hoort gewoon leeg
         te blijven. */
      const w = schoonVeld(VELDREGELS[naam], binnen[naam]);
      if (w === null) { continue; }
      velden[naam] = w;
    }
    Object.assign(velden, SERVERVELDEN);

    /* De afstand en de prijs komen van hier, niet van de browser. Wat de
       aanvrager erover meestuurde is hierboven al niet overgenomen: die twee
       velden staan niet meer in VELDREGELS. */
    Object.assign(velden, eigenBerekening(velden));

    const ontbreekt = VERPLICHT.filter((n) => !velden[n]);
    if (ontbreekt.length) {
      return antwoord(400, { fout: 'Ontbrekende velden: ' + ontbreekt.join(', ') }, origin, true);
    }

    if (body.voorwaarden !== true) {
      return antwoord(400, { fout: 'Akkoord met de algemene voorwaarden ontbreekt' }, origin, true);
    }
    if (String(body.voorwaardenVersie || '') !== VOORWAARDEN_VERSIE) {
      return antwoord(400, {
        fout: 'De voorwaarden zijn gewijzigd. Ververs de pagina en probeer het opnieuw.'
      }, origin, true);
    }
    velden[VOORWAARDENVELD] = 'Versie ' + VOORWAARDEN_VERSIE + ', geaccepteerd op ' +
                              new Date().toISOString();

    const fotos = Array.isArray(body.fotos) ? body.fotos.slice(0, 5) : [];
    if (fotos.length) {
      velden[FOTONAMEN] = fotos.map((f) => schoneBestandsnaam(f && f.naam)).join(', ')
        .slice(0, 500);
    }

    velden['Aanvraag'] = korteOmschrijving(velden);

    /* 1. Het record aanmaken. Dit is de aanvraag; lukt dit niet, dan is er
          niets binnengekomen en moet de bezoeker dat weten. */
    let recordId;
    try {
      recordId = await maakRecord(env, velden);
    } catch (fout) {
      return antwoord(502, { fout: 'Airtable weigerde de aanvraag: ' + fout.message }, origin, true);
    }

    /* 2. Daarna pas de foto's. Mislukt dat, dan staat de aanvraag er al — de
          bestandsnamen zitten in het tekstveld, dus je weet dat er foto's
          waren en kunt ze opvragen. Een fotoprobleem mag nooit een aanvraag
          kosten. */
    const fotoResultaat = await voegFotosToe(env, recordId, fotos);

    return antwoord(200, { ok: true, recordId, fotos: fotoResultaat }, origin, true);
  }
};

function cors(origin, toegestaan) {
  return {
    'Access-Control-Allow-Origin': toegestaan ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function antwoord(status, data, origin, toegestaan) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin, toegestaan) }
  });
}

/* Wordt het primaire veld in de tabel, zodat de lijst leesbaar is. */
function korteOmschrijving(v) {
  const route = [v['Ophaalpostcode'] || v['Ophaallocatie'] || '?',
                 v['Afleverpostcode'] || v['Afleverlocatie'] || '?'].join(' naar ');
  return (v['Dienst'] || 'Aanvraag') + ': ' + route;
}

async function maakRecord(env, velden) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE}/${env.AIRTABLE_TABEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records: [{ fields: velden }] })
    }
  );
  if (!res.ok) {
    throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  return data.records[0].id;
}

/* Zet de meegestuurde data-URLs als bijlage bij het record.

   LET OP: dit gebruikt het upload-endpoint van Airtable, dat base64 direct
   aanneemt. Werkt dat bij jou niet, dan blijft de aanvraag gewoon staan en
   zie je hier in de logs waarom. In dat geval is het alternatief: de foto's
   naar eigen opslag (bijvoorbeeld R2) schrijven en Airtable de URL geven. */
async function voegFotosToe(env, recordId, fotos) {
  const uitkomst = { gelukt: 0, overgeslagen: [] };

  for (const foto of fotos) {
    const naam = schoneBestandsnaam(foto && foto.naam);
    const match = /^data:([^;]+);base64,(.+)$/.exec(String(foto && foto.data || ''));
    if (!match) {
      uitkomst.overgeslagen.push(`${naam} (onleesbaar)`);
      continue;
    }
    const [, type, base64] = match;
    if (!FOTOSOORTEN.includes(type.toLowerCase())) {
      uitkomst.overgeslagen.push(`${naam} (geen foto)`);
      continue;
    }
    /* base64 is ongeveer 4/3 van de oorspronkelijke bytes */
    if (base64.length * 0.75 > MAX_FOTO_MB * 1024 * 1024) {
      uitkomst.overgeslagen.push(`${naam} (groter dan ${MAX_FOTO_MB} MB)`);
      continue;
    }

    try {
      const res = await fetch(
        `https://content.airtable.com/v0/${env.AIRTABLE_BASE}/${recordId}/${encodeURIComponent(FOTOVELD)}/uploadAttachment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ contentType: type, file: base64, filename: naam })
        }
      );
      if (!res.ok) {
        throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      uitkomst.gelukt++;
    } catch (fout) {
      console.log(`Foto ${naam} niet toegevoegd aan ${recordId}: ${fout.message}`);
      uitkomst.overgeslagen.push(`${naam} (upload mislukt)`);
    }
  }

  return uitkomst;
}
