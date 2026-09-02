/* =========================================================================
   Cloudflare Worker — neemt aanvragen van de website aan en schrijft ze in
   Airtable. Deze tussenlaag bestaat om één reden: de Airtable-sleutel mag
   niet in de website staan, want alles daar is voor iedere bezoeker leesbaar.

   Instellen (zie AIRTABLE.md voor de volledige stappen):
     wrangler secret put AIRTABLE_TOKEN      <- de persoonlijke toegangstoken
   en als gewone variabelen:
     AIRTABLE_BASE    appLUKMbBBkJUagFs
     AIRTABLE_TABEL   tblhvOATDAfvBmabA
     TOEGESTANE_ORIGIN  https://picknicken.github.io
   ========================================================================= */

/* Alleen deze velden gaan door naar Airtable. Alles wat de aanvrager verder
   meestuurt wordt genegeerd — een open endpoint moet nooit zelf bepalen welke
   kolommen het beschrijft. De namen zijn exact de kolomnamen in de tabel. */
const TOEGESTANE_VELDEN = [
  'Status', 'Bron', 'Dienst', 'Tijdvak',
  'Ophaallocatie', 'Ophaalpostcode', 'Afleverlocatie', 'Afleverpostcode',
  'Datum', 'Ophaaltijd', 'Extra stops',
  'Omschrijving', 'Aantal colli', 'Gewicht', 'Afmetingen',
  'Bedrijf', 'Contactpersoon', 'Telefoon', 'E-mail', 'Opmerkingen',
  'Geschatte afstand km', 'Prijsindicatie excl btw'
];

/* Zonder deze velden is een aanvraag niet op te volgen. */
const VERPLICHT = ['Bedrijf', 'Contactpersoon', 'Telefoon', 'E-mail'];

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

export default {
  async fetch(verzoek, env) {
    const origin = verzoek.headers.get('Origin') || '';
    const toegestaan = origin === env.TOEGESTANE_ORIGIN;

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

    /* Honeypot: het formulier heeft een verborgen veld dat een mens leeg laat.
       Ingevuld betekent een bot. We melden succes, zodat de bot niets leert. */
    if (typeof body.controle === 'string' && body.controle.trim() !== '') {
      return antwoord(200, { ok: true }, origin, true);
    }

    const binnen = body.velden && typeof body.velden === 'object' ? body.velden : {};
    const velden = {};
    for (const naam of TOEGESTANE_VELDEN) {
      const w = binnen[naam];
      /* Lege waarden weglaten: een lege string naar een keuzeveld is een fout
         in Airtable, en een leeg veld hoort gewoon leeg te blijven. */
      if (w === null || w === undefined || w === '') { continue; }
      velden[naam] = w;
    }

    const ontbreekt = VERPLICHT.filter((n) => !velden[n]);
    if (ontbreekt.length) {
      return antwoord(400, { fout: 'Ontbrekende velden: ' + ontbreekt.join(', ') }, origin, true);
    }

    const fotos = Array.isArray(body.fotos) ? body.fotos.slice(0, 5) : [];
    if (fotos.length) {
      velden[FOTONAMEN] = fotos.map((f) => String(f && f.naam || 'onbekend')).join(', ');
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
    const naam = String(foto && foto.naam || 'foto');
    const match = /^data:([^;]+);base64,(.+)$/.exec(String(foto && foto.data || ''));
    if (!match) {
      uitkomst.overgeslagen.push(`${naam} (onleesbaar)`);
      continue;
    }
    const [, type, base64] = match;
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
