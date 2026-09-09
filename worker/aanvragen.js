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
  'Opmerkingen':             { tekst: 2000 },
  'Geschatte afstand km':    { getal: { min: 0, max: 5000 } },
  'Prijsindicatie excl btw': { getal: { min: 0, max: 100000 } }
};

/* Wat de server zelf invult, wat er ook binnenkomt.

   Deze twee stonden eerst gewoon op de lijst hierboven omdat het formulier ze
   meestuurt. Dat betekende dat iedereen ze kon meesturen — ook een status die
   zegt dat de aanvraag al is omgezet, en dan staat hij nergens meer in je
   lijstje en rijd je die rit niet. Wat de server kan weten, hoort de server te
   bepalen. */
const SERVERVELDEN = { 'Status': 'Nieuw', 'Bron': 'Website' };

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
