/* =========================================================================
   Cloudflare Worker — het chauffeursportaal.

   Bewust een tweede Worker, los van schaap-aanvragen. Die eerste draait en
   neemt aanvragen aan; daar wil je niet in hoeven snijden om hier iets te
   veranderen. Ze delen wel dezelfde Airtable-token.

   Dit endpoint is anders dan het aanvraagendpoint: dat mag iedereen
   aanroepen (het schrijft alleen), dit leest klantgegevens en past ritten
   aan. Daarom zit er een toegangscode op.

   Instellen:
     wrangler secret put AIRTABLE_TOKEN     <- dezelfde token als de aanvraag-Worker
     wrangler secret put PORTAAL_CODE       <- je eigen toegangscode, lang en willekeurig
   en als gewone variabelen (staan al in wrangler.toml):
     AIRTABLE_BASE       appLUKMbBBkJUagFs
     AIRTABLE_RITTEN     tblNH4BAVu9uRHZIS
     TOEGESTANE_ORIGIN   https://picknicken.github.io
   ========================================================================= */

/* Kolomnamen in de tabel Ritten. Als je een veld hernoemt in Airtable, moet
   het hier mee — anders komt het stil als leeg terug. */
const V = {
  rit:        'Rit',
  datum:      'Ritdatum',
  type:       'Type rit',
  status:     'Status',
  ophaal:     'Ophaaladres',
  aflever:    'Afleveradres',
  km:         'Kilometers',
  klant:      'Klantnaam',
  telefoon:   'Klant telefoon',
  opmerking:  'Opmerkingen',
  totaal:     'Automatisch totaal excl. BTW',
  handtek:    'Handtekening',
  getekendD:  'Getekend door',
  getekendO:  'Getekend op',
  onderweg:   'Onderweg sinds'
};

/* Precies de statussen die in Airtable bestaan. Een status die de telefoon
   verzint mag nooit doorgeschreven worden. */
const STATUSSEN = ['Gepland', 'Onderweg', 'Uitgevoerd', 'Geannuleerd'];

const MAX_BODY_MB    = 4;    /* een handtekening is een paar kB; dit is ruim */
const MAX_HANDTEK_KB = 800;
const MAX_DAGEN      = 31;   /* hoeveel dagen je in één keer mag opvragen */

export default {
  async fetch(verzoek, env) {
    const origin = verzoek.headers.get('Origin') || '';
    const toegestaan = origin === env.TOEGESTANE_ORIGIN;

    if (verzoek.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin, toegestaan) });
    }
    if (verzoek.method !== 'POST') {
      return antwoord(405, { fout: 'Alleen POST' }, origin, toegestaan);
    }
    if (!toegestaan) {
      return antwoord(403, { fout: 'Onbekende herkomst' }, origin, false);
    }

    const lengte = Number(verzoek.headers.get('Content-Length') || 0);
    if (lengte > MAX_BODY_MB * 1024 * 1024) {
      return antwoord(413, { fout: 'Verzoek te groot' }, origin, true);
    }

    if (!env.PORTAAL_CODE) {
      return antwoord(500, { fout: 'PORTAAL_CODE ontbreekt in de Worker' }, origin, true);
    }
    const code = verzoek.headers.get('X-Portaal-Code') || '';
    if (!gelijk(code, env.PORTAAL_CODE)) {
      /* Even wachten. Het maakt raden niet onmogelijk, maar wel traag. */
      await new Promise((r) => setTimeout(r, 700));
      return antwoord(401, { fout: 'Onjuiste toegangscode' }, origin, true);
    }

    let body;
    try {
      body = await verzoek.json();
    } catch {
      return antwoord(400, { fout: 'Ongeldige JSON' }, origin, true);
    }

    try {
      switch (body.actie) {
        case 'ritten':       return await haalRitten(env, body, origin);
        case 'status':       return await zetStatus(env, body, origin);
        case 'handtekening': return await zetHandtekening(env, body, origin);
        case 'notitie':      return await zetNotitie(env, body, origin);
        default:
          return antwoord(400, { fout: 'Onbekende actie' }, origin, true);
      }
    } catch (fout) {
      console.log('Portaal: ' + fout.message);
      return antwoord(502, { fout: fout.message }, origin, true);
    }
  }
};

/* ------------------------------------------------------------------ acties */

/* De ritten van één dag, of van een reeks dagen. De telefoon bepaalt welke
   dag; de Worker rekent niets uit, want de tijdzone van een Worker is UTC en
   die van de chauffeur niet. */
async function haalRitten(env, body, origin) {
  const van = datum(body.van) || datum(body.dag);
  const tot = datum(body.tot) || van;
  if (!van || !tot) {
    return antwoord(400, { fout: 'Geef een datum als JJJJ-MM-DD' }, origin, true);
  }
  if (afstandInDagen(van, tot) > MAX_DAGEN) {
    return antwoord(400, { fout: `Hoogstens ${MAX_DAGEN} dagen tegelijk` }, origin, true);
  }

  const filter = `AND(
    IS_AFTER({${V.datum}}, DATEADD(DATETIME_PARSE('${van}', 'YYYY-MM-DD'), -1, 'days')),
    IS_BEFORE({${V.datum}}, DATEADD(DATETIME_PARSE('${tot}', 'YYYY-MM-DD'), 1, 'days'))
  )`;

  const zoek = new URLSearchParams();
  zoek.set('filterByFormula', filter);
  zoek.set('pageSize', '100');
  zoek.append('sort[0][field]', V.datum);
  zoek.append('sort[0][direction]', 'asc');

  const data = await airtable(env, `${env.AIRTABLE_RITTEN}?${zoek}`);
  const ritten = (data.records || []).map(naarRit);
  return antwoord(200, { ok: true, van, tot, ritten }, origin, true);
}

async function zetStatus(env, body, origin) {
  const id = ritId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }
  if (!STATUSSEN.includes(body.status)) {
    return antwoord(400, { fout: 'Onbekende status' }, origin, true);
  }

  const velden = { [V.status]: body.status };
  /* Bij vertrek de tijd vastleggen, zodat je achteraf ziet hoe lang een rit
     werkelijk duurde. Alleen als hij nog leeg is: twee keer op Onderweg
     drukken mag de starttijd niet verschuiven. Dat kijken we hier na en niet
     op de telefoon — die kan het mis hebben of een oude lijst tonen. */
  if (body.status === 'Onderweg') {
    const nu = await haalRit(env, id);
    if (!nu.onderweg) { velden[V.onderweg] = new Date().toISOString(); }
  }

  const rit = await werkBij(env, id, velden);
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* De handtekening bij aflevering. In deze volgorde, en dat is met opzet:
   eerst de naam en het tijdstip vastleggen en de rit op Uitgevoerd zetten,
   daarna pas de afbeelding uploaden. Mislukt de upload, dan klopt de
   administratie nog steeds en meldt het portaal dat de krabbel opnieuw moet.
   Andersom zou een gelukte upload bij een mislukte update een handtekening
   opleveren die nergens bij hoort. */
async function zetHandtekening(env, body, origin) {
  const id = ritId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }

  const naam = String(body.naam || '').trim().slice(0, 120);
  if (naam.length < 2) {
    return antwoord(400, { fout: 'Vul in wie er getekend heeft' }, origin, true);
  }

  const match = /^data:(image\/png|image\/jpeg);base64,(.+)$/.exec(String(body.data || ''));
  if (!match) {
    return antwoord(400, { fout: 'Geen leesbare handtekening ontvangen' }, origin, true);
  }
  const [, type, base64] = match;
  if (base64.length * 0.75 > MAX_HANDTEK_KB * 1024) {
    return antwoord(413, { fout: 'Handtekening te groot' }, origin, true);
  }

  const rit = await werkBij(env, id, {
    [V.getekendD]: naam,
    [V.getekendO]: new Date().toISOString(),
    [V.status]:    'Uitgevoerd'
  });

  let opgeslagen = true;
  let reden = '';
  try {
    await uploadBijlage(env, id, V.handtek, type, base64, 'handtekening.png');
  } catch (fout) {
    opgeslagen = false;
    reden = fout.message;
    console.log(`Handtekening niet opgeslagen bij ${id}: ${fout.message}`);
  }

  return antwoord(200, { ok: true, handtekening: opgeslagen, reden, rit }, origin, true);
}

async function zetNotitie(env, body, origin) {
  const id = ritId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }
  const tekst = String(body.tekst || '').slice(0, 2000);
  const rit = await werkBij(env, id, { [V.opmerking]: tekst });
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* ------------------------------------------------------------- hulpmiddelen */

/* Vergelijkt twee strings zonder eerder te stoppen bij het eerste verschil,
   zodat de looptijd niets verraadt over hoeveel tekens klopten. */
function gelijk(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) { return false; }
  let verschil = 0;
  for (let i = 0; i < x.length; i++) {
    verschil |= x.charCodeAt(i) ^ y.charCodeAt(i);
  }
  return verschil === 0;
}

function datum(w) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(w || '')) ? String(w) : null;
}

function afstandInDagen(van, tot) {
  return Math.round((Date.parse(tot + 'T00:00:00Z') - Date.parse(van + 'T00:00:00Z')) / 86400000);
}

function ritId(w) {
  return /^rec[A-Za-z0-9]{14}$/.test(String(w || '')) ? String(w) : null;
}

/* Airtable geeft een opzoekveld als array terug, ook als er één waarde in
   staat. Voor de telefoon is dat onhandig, dus we pakken de eerste. */
function eerste(w) {
  return Array.isArray(w) ? (w.length ? w[0] : '') : (w === undefined ? '' : w);
}

function naarRit(record) {
  const f = record.fields || {};
  return {
    id:         record.id,
    naam:       f[V.rit] || '',
    datum:      f[V.datum] || '',
    type:       f[V.type] || '',
    status:     f[V.status] || 'Gepland',
    ophaal:     f[V.ophaal] || '',
    aflever:    f[V.aflever] || '',
    km:         f[V.km] || 0,
    klant:      eerste(f[V.klant]),
    telefoon:   eerste(f[V.telefoon]),
    opmerking:  f[V.opmerking] || '',
    bedrag:     f[V.totaal] || 0,
    getekend:   f[V.getekendD] || '',
    getekendOp: f[V.getekendO] || '',
    onderweg:   f[V.onderweg] || '',
    handtekening: Array.isArray(f[V.handtek]) && f[V.handtek].length > 0
  };
}

async function airtable(env, pad, opties) {
  const res = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE}/${pad}`, {
    ...opties,
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
      ...((opties && opties.headers) || {})
    }
  });
  if (!res.ok) {
    throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

async function haalRit(env, id) {
  return naarRit(await airtable(env, `${env.AIRTABLE_RITTEN}/${id}`));
}

async function werkBij(env, id, velden) {
  const data = await airtable(env, `${env.AIRTABLE_RITTEN}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: velden })
  });
  return naarRit(data);
}

async function uploadBijlage(env, recordId, veld, type, base64, bestandsnaam) {
  const res = await fetch(
    `https://content.airtable.com/v0/${env.AIRTABLE_BASE}/${recordId}/${encodeURIComponent(veld)}/uploadAttachment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ contentType: type, file: base64, filename: bestandsnaam })
    }
  );
  if (!res.ok) {
    throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

function cors(origin, toegestaan) {
  return {
    'Access-Control-Allow-Origin': toegestaan ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Portaal-Code',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function antwoord(status, data, origin, toegestaan) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...cors(origin, toegestaan)
    }
  });
}
