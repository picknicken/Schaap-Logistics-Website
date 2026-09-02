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
     AIRTABLE_BASE        appLUKMbBBkJUagFs
     AIRTABLE_RITTEN      tblNH4BAVu9uRHZIS
     AIRTABLE_OPDRACHTEN  tblMNRxxvlQ2ykGCb
     AIRTABLE_AANVRAGEN   tblhvOATDAfvBmabA
     AIRTABLE_KLANTEN     tbluCJAsTFXdB2ZeR
     TOEGESTANE_ORIGIN    https://picknicken.github.io

   De token heeft data.records:read én data.records:write nodig. Alleen
   schrijven volstaat niet: het portaal leest je ritten uit.
   ========================================================================= */

/* Kolomnamen per tabel. Hernoem je een veld in Airtable, dan moet het hier
   mee — anders komt het stil als leeg terug. */
const R = {
  rit:        'Rit',
  opdracht:   'Opdracht',
  klantlink:  'Klant',
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

const O = {
  opdracht:   'Opdracht',
  klantlink:  'Klant',
  klant:      'Klantnaam',
  datum:      'Gewenste datum',
  tijd:       'Gewenste tijd',
  ophaal:     'Ophaaladres',
  aflever:    'Afleveradres',
  referentie: 'Ordernummer klant',
  status:     'Status',
  opmerking:  'Opmerkingen',
  type:       'Type rit',
  ritten:     'Ritten'
};

const A = {
  aanvraag:   'Aanvraag',
  status:     'Status',
  dienst:     'Dienst',
  tijdvak:    'Tijdvak',
  ophaal:     'Ophaallocatie',
  ophaalpc:   'Ophaalpostcode',
  aflever:    'Afleverlocatie',
  afleverpc:  'Afleverpostcode',
  datum:      'Datum',
  tijd:       'Ophaaltijd',
  stops:      'Extra stops',
  omschrijving:'Omschrijving',
  colli:      'Aantal colli',
  gewicht:    'Gewicht',
  afmetingen: 'Afmetingen',
  bedrijf:    'Bedrijf',
  contact:    'Contactpersoon',
  telefoon:   'Telefoon',
  email:      'E-mail',
  opmerking:  'Opmerkingen',
  afstand:    'Geschatte afstand km',
  prijs:      'Prijsindicatie excl btw',
  opdracht:   'Opdracht',
  omzetten:   'Omzetten naar opdracht',
  binnen:     'Binnengekomen'
};

const K = {
  naam:      'Klantnaam',
  adres:     'Adres',
  email:     'E-mail',
  telefoon:  'Telefoon',
  termijn:   'Betalingstermijn (dagen)',
  nummer:    'Klantnummer'
};

/* Precies de statussen die in Airtable bestaan. Een status die de telefoon
   verzint mag nooit doorgeschreven worden. */
const RIT_STATUSSEN = ['Gepland', 'Onderweg', 'Uitgevoerd', 'Geannuleerd'];

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
        case 'overzicht':    return await haalOverzicht(env, body, origin);
        case 'ritten':       return await haalRitten(env, body, origin);
        case 'status':       return await zetStatus(env, body, origin);
        case 'handtekening': return await zetHandtekening(env, body, origin);
        case 'notitie':      return await zetNotitie(env, body, origin);
        case 'accepteer':    return await accepteerAanvraag(env, body, origin);
        case 'afwijzen':     return await wijsAanvraagAf(env, body, origin);
        case 'planrit':      return await planRit(env, body, origin);
        case 'ritdatum':     return await zetRitdatum(env, body, origin);
        case 'koppelklant':  return await koppelKlant(env, body, origin);
        case 'nieuweklant':  return await nieuweKlant(env, body, origin);
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

/* Alles wat het portaal bij het openen nodig heeft, in één verzoek. Drie
   losse verzoeken zou onderweg op mobiel internet drie keer wachten zijn. */
async function haalOverzicht(env, body, origin) {
  const dag = datum(body.dag);
  if (!dag) {
    return antwoord(400, { fout: 'Geef een datum als JJJJ-MM-DD' }, origin, true);
  }
  const [ritten, aanvragen, opdrachten, klanten] = await Promise.all([
    rittenOphalen(env, dag, dag),
    aanvragenOphalen(env),
    opdrachtenOphalen(env),
    klantenOphalen(env)
  ]);
  return antwoord(200, { ok: true, dag, ritten, aanvragen, opdrachten, klanten },
                  origin, true);
}

async function haalRitten(env, body, origin) {
  const van = datum(body.van) || datum(body.dag);
  const tot = datum(body.tot) || van;
  if (!van || !tot) {
    return antwoord(400, { fout: 'Geef een datum als JJJJ-MM-DD' }, origin, true);
  }
  if (afstandInDagen(van, tot) > MAX_DAGEN) {
    return antwoord(400, { fout: `Hoogstens ${MAX_DAGEN} dagen tegelijk` }, origin, true);
  }
  const ritten = await rittenOphalen(env, van, tot);
  return antwoord(200, { ok: true, van, tot, ritten }, origin, true);
}

async function zetStatus(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }
  if (!RIT_STATUSSEN.includes(body.status)) {
    return antwoord(400, { fout: 'Onbekende status' }, origin, true);
  }

  const velden = { [R.status]: body.status };
  /* Bij vertrek de tijd vastleggen, zodat je achteraf ziet hoe lang een rit
     werkelijk duurde. Alleen als hij nog leeg is: twee keer op Onderweg
     drukken mag de starttijd niet verschuiven. Dat kijken we hier na en niet
     op de telefoon — die kan het mis hebben of een oude lijst tonen. */
  if (body.status === 'Onderweg') {
    const nu = naarRit(await airtable(env, `${env.AIRTABLE_RITTEN}/${id}`));
    if (!nu.onderweg) { velden[R.onderweg] = new Date().toISOString(); }
  }

  const rit = naarRit(await patch(env, env.AIRTABLE_RITTEN, id, velden));
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* De handtekening bij aflevering. In deze volgorde, en dat is met opzet:
   eerst de naam en het tijdstip vastleggen en de rit op Uitgevoerd zetten,
   daarna pas de afbeelding uploaden. Mislukt de upload, dan klopt de
   administratie nog steeds en meldt het portaal dat de krabbel opnieuw moet.
   Andersom zou een gelukte upload bij een mislukte update een handtekening
   opleveren die nergens bij hoort. */
async function zetHandtekening(env, body, origin) {
  const id = recordId(body.id);
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

  const rit = naarRit(await patch(env, env.AIRTABLE_RITTEN, id, {
    [R.getekendD]: naam,
    [R.getekendO]: new Date().toISOString(),
    [R.status]:    'Uitgevoerd'
  }));

  let opgeslagen = true;
  let reden = '';
  try {
    await uploadBijlage(env, id, R.handtek, type, base64, 'handtekening.png');
  } catch (fout) {
    opgeslagen = false;
    reden = fout.message;
    console.log(`Handtekening niet opgeslagen bij ${id}: ${fout.message}`);
  }

  return antwoord(200, { ok: true, handtekening: opgeslagen, reden, rit }, origin, true);
}

async function zetNotitie(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }
  const tekst = String(body.tekst || '').slice(0, 2000);
  const rit = naarRit(await patch(env, env.AIRTABLE_RITTEN, id, { [R.opmerking]: tekst }));
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* Aanvraag accepteren. We zetten alleen het vinkje om; de automatisering in
   Airtable maakt de opdracht aan en zet de status. Dat werk hier overdoen
   zou twee plekken opleveren die hetzelfde doen en uiteen kunnen lopen. */
async function accepteerAanvraag(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig aanvraag-id' }, origin, true); }
  const aanvraag = naarAanvraag(
    await patch(env, env.AIRTABLE_AANVRAGEN, id, { [A.omzetten]: true })
  );
  return antwoord(200, { ok: true, aanvraag }, origin, true);
}

async function wijsAanvraagAf(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig aanvraag-id' }, origin, true); }
  const aanvraag = naarAanvraag(
    await patch(env, env.AIRTABLE_AANVRAGEN, id, { [A.status]: 'Afgewezen' })
  );
  return antwoord(200, { ok: true, aanvraag }, origin, true);
}

/* Van opdracht naar rit. Dit was de ontbrekende schakel: een aanvraag werd
   een opdracht, maar niets maakte daar een rit van, en het portaal toont
   ritten. Neemt klant, adressen en soort transport over. */
async function planRit(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig opdracht-id' }, origin, true); }

  const ritdatum = datum(body.datum);
  if (!ritdatum) {
    return antwoord(400, { fout: 'Geef een ritdatum als JJJJ-MM-DD' }, origin, true);
  }

  const ruw = await airtable(env, `${env.AIRTABLE_OPDRACHTEN}/${id}`);
  const opdracht = naarOpdracht(ruw);
  if (opdracht.ritten > 0 && !body.tochWel) {
    return antwoord(409, {
      fout: 'Bij deze opdracht staat al een rit. Wil je er een tweede bij, ' +
            'bevestig dat dan.'
    }, origin, true);
  }

  const f = ruw.fields || {};
  const velden = {
    [R.rit]:       (opdracht.naam || 'Rit') + ' — ' + nlDatum(ritdatum),
    [R.datum]:     ritdatum,
    [R.status]:    'Gepland',
    [R.opdracht]:  [id]
  };
  if (Array.isArray(f[O.klantlink]) && f[O.klantlink].length) {
    velden[R.klantlink] = f[O.klantlink].map((k) => (k && k.id) || k);
  }
  if (f[O.ophaal])    { velden[R.ophaal]    = f[O.ophaal]; }
  if (f[O.aflever])   { velden[R.aflever]   = f[O.aflever]; }
  if (f[O.opmerking]) { velden[R.opmerking] = f[O.opmerking]; }
  if (f[O.type])      { velden[R.type]      = keuze(f[O.type]); }
  if (body.km) {
    const km = Number(String(body.km).replace(',', '.'));
    if (isFinite(km) && km > 0) { velden[R.km] = km; }
  }

  const rit = naarRit(await maak(env, env.AIRTABLE_RITTEN, velden));

  /* De opdracht staat nu ingepland; dat hoort ook in de opdrachtstatus. */
  let opdrachtNa = opdracht;
  try {
    opdrachtNa = naarOpdracht(
      await patch(env, env.AIRTABLE_OPDRACHTEN, id, { [O.status]: 'Gepland' })
    );
  } catch (fout) {
    console.log(`Opdrachtstatus niet bijgewerkt bij ${id}: ${fout.message}`);
  }

  return antwoord(200, { ok: true, rit, opdracht: opdrachtNa }, origin, true);
}

/* Een geplande rit verzetten. Hoort bij de planning: een klant belt, het
   wordt een dag later. */
async function zetRitdatum(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }
  const nieuw = datum(body.datum);
  if (!nieuw) {
    return antwoord(400, { fout: 'Geef een datum als JJJJ-MM-DD' }, origin, true);
  }
  const rit = naarRit(await patch(env, env.AIRTABLE_RITTEN, id, { [R.datum]: nieuw }));
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* Een klant aan een opdracht hangen. Ook aan de ritten die er al onder
   hangen: anders staat de opdracht wel op naam en de rit niet, en dan komt
   er straks een factuur zonder klant uit. */
async function koppelKlant(env, body, origin) {
  const id = recordId(body.id);
  const klantId = recordId(body.klantId);
  if (!id || !klantId) {
    return antwoord(400, { fout: 'Ongeldig id' }, origin, true);
  }
  const opdracht = naarOpdracht(
    await patch(env, env.AIRTABLE_OPDRACHTEN, id, { [O.klantlink]: [klantId] })
  );
  await koppelKlantAanRitten(env, id, klantId);
  return antwoord(200, { ok: true, opdracht }, origin, true);
}

async function koppelKlantAanRitten(env, opdrachtId, klantId) {
  try {
    const ruw = await airtable(env, `${env.AIRTABLE_OPDRACHTEN}/${opdrachtId}`);
    const ritten = (ruw.fields || {})[O.ritten] || [];
    for (const r of ritten) {
      const rid = (r && r.id) || r;
      await patch(env, env.AIRTABLE_RITTEN, rid, { [R.klantlink]: [klantId] });
    }
  } catch (fout) {
    console.log(`Klant niet doorgezet naar de ritten van ${opdrachtId}: ${fout.message}`);
  }
}

/* Een nieuwe klant, en meteen aan de opdracht hangen. Adres hoort erbij:
   zonder adres kun je later geen factuur versturen. */
async function nieuweKlant(env, body, origin) {
  const naam = String(body.naam || '').trim().slice(0, 200);
  if (naam.length < 2) {
    return antwoord(400, { fout: 'Vul een klantnaam in' }, origin, true);
  }

  const velden = { [K.naam]: naam };
  if (body.adres)    { velden[K.adres]    = String(body.adres).slice(0, 500); }
  if (body.email)    { velden[K.email]    = String(body.email).slice(0, 200); }
  if (body.telefoon) { velden[K.telefoon] = String(body.telefoon).slice(0, 50); }
  const termijn = Number(body.termijn);
  if (isFinite(termijn) && termijn > 0) { velden[K.termijn] = Math.round(termijn); }

  const klant = naarKlant(await maak(env, env.AIRTABLE_KLANTEN, velden));

  /* Aan een opdracht koppelen mag, maar hoeft niet: je kunt ook gewoon een
     klant vastleggen zonder dat er al werk voor is. */
  let opdracht = null;
  const id = recordId(body.opdrachtId);
  if (id) {
    opdracht = naarOpdracht(
      await patch(env, env.AIRTABLE_OPDRACHTEN, id, { [O.klantlink]: [klant.id] })
    );
    await koppelKlantAanRitten(env, id, klant.id);
  }

  return antwoord(200, { ok: true, klant, opdracht }, origin, true);
}

/* ------------------------------------------------------------- ophalen */

async function rittenOphalen(env, van, tot) {
  const filter = `AND(
    IS_AFTER({${R.datum}}, DATEADD(DATETIME_PARSE('${van}', 'YYYY-MM-DD'), -1, 'days')),
    IS_BEFORE({${R.datum}}, DATEADD(DATETIME_PARSE('${tot}', 'YYYY-MM-DD'), 1, 'days'))
  )`;
  const zoek = new URLSearchParams();
  zoek.set('filterByFormula', filter);
  zoek.set('pageSize', '100');
  zoek.append('sort[0][field]', R.datum);
  zoek.append('sort[0][direction]', 'asc');
  const data = await airtable(env, `${env.AIRTABLE_RITTEN}?${zoek}`);
  return (data.records || []).map(naarRit);
}

/* Alleen aanvragen waar nog iets mee moet. Afgewezen en al omgezette
   aanvragen zijn afgehandeld en zouden de lijst alleen maar vervuilen. */
async function aanvragenOphalen(env) {
  const filter = `OR({${A.status}} = 'Nieuw', {${A.status}} = 'In behandeling')`;
  const zoek = new URLSearchParams();
  zoek.set('filterByFormula', filter);
  zoek.set('pageSize', '100');
  zoek.append('sort[0][field]', A.binnen);
  zoek.append('sort[0][direction]', 'desc');
  const data = await airtable(env, `${env.AIRTABLE_AANVRAGEN}?${zoek}`);
  return (data.records || []).map(naarAanvraag);
}

/* Opdrachten die nog ingepland moeten worden: er hangt nog geen rit aan en
   ze zijn niet geannuleerd of al voltooid. */
async function opdrachtenOphalen(env) {
  const filter = `AND(
    {${O.status}} != 'Geannuleerd',
    {${O.status}} != 'Voltooid',
    COUNTA({${O.ritten}}) = 0
  )`;
  const zoek = new URLSearchParams();
  zoek.set('filterByFormula', filter);
  zoek.set('pageSize', '100');
  zoek.append('sort[0][field]', O.datum);
  zoek.append('sort[0][direction]', 'asc');
  const data = await airtable(env, `${env.AIRTABLE_OPDRACHTEN}?${zoek}`);
  return (data.records || []).map(naarOpdracht);
}

async function klantenOphalen(env) {
  const zoek = new URLSearchParams();
  zoek.set('pageSize', '100');
  zoek.append('sort[0][field]', K.naam);
  zoek.append('sort[0][direction]', 'asc');
  const data = await airtable(env, `${env.AIRTABLE_KLANTEN}?${zoek}`);
  return (data.records || []).map(naarKlant);
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

function nlDatum(iso) {
  const d = iso.split('-');
  return `${d[2]}-${d[1]}-${d[0]}`;
}

function afstandInDagen(van, tot) {
  return Math.round((Date.parse(tot + 'T00:00:00Z') - Date.parse(van + 'T00:00:00Z')) / 86400000);
}

function recordId(w) {
  return /^rec[A-Za-z0-9]{14}$/.test(String(w || '')) ? String(w) : null;
}

/* Airtable geeft een opzoekveld als array terug, ook als er één waarde in
   staat. Voor de telefoon is dat onhandig, dus we pakken de eerste. */
function eerste(w) {
  return Array.isArray(w) ? (w.length ? w[0] : '') : (w === undefined ? '' : w);
}

/* Een keuzeveld komt soms als object {id, name} en soms als string terug. */
function keuze(w) {
  if (w && typeof w === 'object' && w.name) { return w.name; }
  return w || '';
}

function naarRit(record) {
  const f = record.fields || {};
  return {
    id:         record.id,
    naam:       f[R.rit] || '',
    datum:      f[R.datum] || '',
    type:       keuze(f[R.type]),
    status:     keuze(f[R.status]) || 'Gepland',
    ophaal:     f[R.ophaal] || '',
    aflever:    f[R.aflever] || '',
    km:         f[R.km] || 0,
    klant:      eerste(f[R.klant]),
    telefoon:   eerste(f[R.telefoon]),
    opmerking:  f[R.opmerking] || '',
    bedrag:     f[R.totaal] || 0,
    getekend:   f[R.getekendD] || '',
    getekendOp: f[R.getekendO] || '',
    onderweg:   f[R.onderweg] || '',
    handtekening: Array.isArray(f[R.handtek]) && f[R.handtek].length > 0
  };
}

function naarOpdracht(record) {
  const f = record.fields || {};
  return {
    id:         record.id,
    naam:       f[O.opdracht] || '',
    klant:      eerste(f[O.klant]),
    heeftKlant: Array.isArray(f[O.klantlink]) && f[O.klantlink].length > 0,
    datum:      f[O.datum] || '',
    tijd:       f[O.tijd] || '',
    ophaal:     f[O.ophaal] || '',
    aflever:    f[O.aflever] || '',
    referentie: f[O.referentie] || '',
    status:     keuze(f[O.status]) || '',
    opmerking:  f[O.opmerking] || '',
    type:       keuze(f[O.type]),
    ritten:     Array.isArray(f[O.ritten]) ? f[O.ritten].length : 0
  };
}

function naarAanvraag(record) {
  const f = record.fields || {};
  return {
    id:          record.id,
    naam:        f[A.aanvraag] || '',
    status:      keuze(f[A.status]) || '',
    dienst:      keuze(f[A.dienst]),
    tijdvak:     keuze(f[A.tijdvak]),
    ophaal:      f[A.ophaal] || '',
    ophaalpc:    f[A.ophaalpc] || '',
    aflever:     f[A.aflever] || '',
    afleverpc:   f[A.afleverpc] || '',
    datum:       f[A.datum] || '',
    tijd:        f[A.tijd] || '',
    stops:       f[A.stops] || '',
    omschrijving:f[A.omschrijving] || '',
    colli:       f[A.colli] || '',
    gewicht:     f[A.gewicht] || '',
    afmetingen:  f[A.afmetingen] || '',
    bedrijf:     f[A.bedrijf] || '',
    contact:     f[A.contact] || '',
    telefoon:    f[A.telefoon] || '',
    email:       f[A.email] || '',
    opmerking:   f[A.opmerking] || '',
    afstand:     f[A.afstand] || 0,
    prijs:       f[A.prijs] || 0,
    binnen:      f[A.binnen] || '',
    omgezet:     Array.isArray(f[A.opdracht]) && f[A.opdracht].length > 0
  };
}

function naarKlant(record) {
  const f = record.fields || {};
  return {
    id:       record.id,
    naam:     f[K.naam] || '',
    adres:    f[K.adres] || '',
    email:    f[K.email] || '',
    telefoon: f[K.telefoon] || '',
    termijn:  f[K.termijn] || 0,
    nummer:   f[K.nummer] || ''
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

function patch(env, tabel, id, velden) {
  return airtable(env, `${tabel}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: velden })
  });
}

async function maak(env, tabel, velden) {
  const data = await airtable(env, tabel, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields: velden }] })
  });
  return data.records[0];
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
