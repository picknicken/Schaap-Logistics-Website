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
     AIRTABLE_FACTUREN    tblDA2m46PWhhiFnC
     TOEGESTANE_ORIGIN    https://schaaplogistics.nl,https://picknicken.github.io

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
  stops:      'Extra stops',
  tijdvak:    'Tijdvak',
  tijd:       'Ophaaltijd',
  brandstof:  'Brandstofkosten',
  tol:        'Tol en parkeren',
  overig:     'Overige ritkosten',
  kosten:     'Totale ritkosten',
  winst:      'Winst',
  bevestigd:  'Bevestiging verstuurd op',
  wachttijd:  'Wachttijd (minuten)',
  doorbereken:'Extra kosten',
  korting:    'Korting',
  kortingRe:  'Reden korting',
  klant:      'Klantnaam',
  telefoon:   'Klant telefoon',
  opmerking:  'Opmerkingen',
  totaal:     'Automatisch totaal excl. BTW',
  handtek:    'Handtekening',
  getekendD:  'Getekend door',
  getekendO:  'Getekend op',
  onderweg:   'Onderweg sinds',
  annulDoor:  'Geannuleerd door klant',
  annulOp:    'Geannuleerd op',
  annulReden: 'Reden annulering'
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
  km:         'Kilometers',
  stops:      'Extra stops',
  tijdvak:    'Tijdvak',
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
  nummer:    'Klantnummer',
  code:      'Portaalcode',
  uitnodigen:'Uitnodiging versturen',
  uitgenodigd:'Uitnodiging verstuurd op'
};

/* Precies de statussen die in Airtable bestaan. Een status die de telefoon
   verzint mag nooit doorgeschreven worden. */
const RIT_STATUSSEN = ['Gepland', 'Onderweg', 'Uitgevoerd', 'Geannuleerd'];

const MAX_BODY_MB    = 4;    /* een handtekening is een paar kB; dit is ruim */
const MAX_HANDTEK_KB = 800;
const MAX_DAGEN      = 31;   /* hoeveel dagen je in één keer mag opvragen */

/* ------------------------------------------------------------------ de rem

   Achter dit adres zitten klantnamen, telefoonnummers, bedragen en de
   handtekeningen. De codes zijn lang genoeg om niet te raden, maar zonder rem
   mag iemand het wel eindeloos proberen. Een foute code kost nu een halve
   seconde; vijftien foute codes achter elkaar kosten je vijf minuten.

   Alleen mislukte pogingen tellen mee, zodat jij en je klanten er nooit last
   van hebben. De teller staat in het geheugen van de Worker; dat is geen
   sluitende bewaking (Cloudflare draait meerdere exemplaren naast elkaar),
   maar het kost niets en het haalt de lucht uit een aanhoudende poging. */
const REM_VENSTER = 5 * 60 * 1000;
const REM_MAX     = 15;
const remTeller   = new Map();

function opWacht(ip) {
  const nu = Date.now();
  for (const [sleutel, rij] of remTeller) {
    if (nu - rij.begin > REM_VENSTER) { remTeller.delete(sleutel); }
  }
  const rij = remTeller.get(ip);
  return !!rij && rij.aantal > REM_MAX;
}

function telMislukking(ip) {
  const nu = Date.now();
  const rij = remTeller.get(ip);
  if (!rij || nu - rij.begin > REM_VENSTER) {
    remTeller.set(ip, { begin: nu, aantal: 1 });
    return;
  }
  rij.aantal += 1;
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
    const ip = verzoek.headers.get('CF-Connecting-IP') || 'onbekend';
    if (opWacht(ip)) {
      return antwoord(429, {
        fout: 'Te veel pogingen. Probeer het over een paar minuten opnieuw.'
      }, origin, true);
    }
    const code = verzoek.headers.get('X-Portaal-Code') || '';

    let body;
    try {
      body = await verzoek.json();
    } catch {
      return antwoord(400, { fout: 'Ongeldige JSON' }, origin, true);
    }

    /* ------------------------------------------------------------------
       Hier splitst het. Boven de streep hoort de chauffeurscode, daaronder
       een klantcode. Die twee komen elkaar nergens tegen: de klantacties
       staan in een eigen functie met een eigen lijst, dus een klantcode kan
       een chauffeursactie niet eens bereiken. Dat is met opzet zo gebouwd en
       niet met een reeks controles per actie — dan vergeet je er een.
       ------------------------------------------------------------------ */
    if (!gelijk(code, env.PORTAAL_CODE)) {
      try {
        const uit = await klantPoort(env, code, body, origin);
        if (uit.status === 401) { telMislukking(ip); }
        return uit;
      } catch (fout) {
        console.log('Klantportaal: ' + fout.message);
        return antwoord(502, { fout: fout.message }, origin, true);
      }
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
        case 'nieuwerit':    return await nieuweRit(env, body, origin);
        case 'ritdatum':     return await zetRitdatum(env, body, origin);
        case 'ritkm':        return await zetRitKm(env, body, origin);
        case 'ritkosten':    return await zetRitKosten(env, body, origin);
        case 'koppelklant':  return await koppelKlant(env, body, origin);
        case 'nieuweklant':  return await nieuweKlant(env, body, origin);
        case 'uitnodiging':  return await stuurUitnodiging(env, body, origin);
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
  /* Kilometers: wat je in het portaal invult gaat voor, anders de schatting
     die met de aanvraag is meegekomen. Zonder kilometers valt de factuur
     terug op het minimumtarief, en dat merk je pas als de factuur er ligt. */
  const km = kilometers(body.km !== undefined && body.km !== '' ? body.km : f[O.km]);
  if (km !== null) { velden[R.km] = km; }

  /* Extra stops op dezelfde manier: elke stop is een vast bedrag op de
     factuur, dus die moet met de rit meereizen en niet in de aanvraag
     blijven hangen. */
  const stops = heelGetal(body.stops !== undefined && body.stops !== '' ? body.stops : f[O.stops]);
  if (stops !== null) { velden[R.stops] = stops; }

  /* En het tijdvak, want daar hangt de avond- of nachttoeslag aan. */
  const tijdvak = tijdvakUit(body.tijdvak !== undefined && body.tijdvak !== ''
    ? body.tijdvak : keuze(f[O.tijdvak]));
  if (tijdvak) { velden[R.tijdvak] = tijdvak; }

  /* Hoe laat je er bent. Bij spoed is dat het enige wat de klant wil weten, en
     het gaat in de bevestigingsmail die Airtable stuurt zodra deze rit bestaat.
     Zonder eigen opgave nemen we de gewenste tijd van de klant over. */
  const tijd = klokTijd(body.tijd !== undefined && body.tijd !== '' ? body.tijd : f[O.tijd]);
  if (tijd) { velden[R.tijd] = tijd; }

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

/* Een rit die niet uit de website komt. Iemand belt, je rijdt, en het moet
   toch gefactureerd worden. Er zit dan geen aanvraag en geen opdracht onder;
   de rit staat op zichzelf en gaat verder precies dezelfde weg als alle andere:
   dezelfde prijsformule, dezelfde bevestiging aan de klant, dezelfde factuur
   zodra hij op Uitgevoerd gaat.

   De klant koppelen mag hier meteen, want zonder klant kun je niet factureren.
   Het hoeft niet — dat kan later met Klant koppelen — maar dan staat de rit wel
   met een waarschuwing in je portaal. */
async function nieuweRit(env, body, origin) {
  const ritdatum = datum(body.datum);
  if (!ritdatum) {
    return antwoord(400, { fout: 'Geef een ritdatum als JJJJ-MM-DD' }, origin, true);
  }
  const soort = ritSoort(body.type);
  if (!soort) {
    return antwoord(400, { fout: 'Kies wat voor rit dit is' }, origin, true);
  }
  const ophaal = adresTekst(body.ophaal);
  const aflever = adresTekst(body.aflever);
  if (!ophaal || !aflever) {
    return antwoord(400, {
      fout: 'Vul in waar je ophaalt en waar je bezorgt'
    }, origin, true);
  }

  const velden = {
    [R.rit]:     (adresKort(ophaal) + ' → ' + adresKort(aflever)) + ' — ' + nlDatum(ritdatum),
    [R.datum]:   ritdatum,
    [R.status]:  'Gepland',
    [R.type]:    soort,
    [R.ophaal]:  ophaal,
    [R.aflever]: aflever
  };

  const klantId = recordId(body.klantId);
  if (klantId) { velden[R.klantlink] = [klantId]; }

  const km = kilometers(body.km);
  if (km !== null) { velden[R.km] = km; }
  const stops = heelGetal(body.stops);
  if (stops !== null) { velden[R.stops] = stops; }
  const tijdvak = tijdvakUit(body.tijdvak);
  if (tijdvak) { velden[R.tijdvak] = tijdvak; }
  const tijd = klokTijd(body.tijd);
  if (tijd) { velden[R.tijd] = tijd; }
  const opmerking = String(body.opmerking || '').trim().slice(0, 2000);
  if (opmerking) { velden[R.opmerking] = opmerking; }

  const rit = naarRit(await maak(env, env.AIRTABLE_RITTEN, velden));
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* De vier diensten zoals ze in Airtable en op de website heten. Een verzonnen
   naam zou in Airtable een nieuwe keuze aanmaken die stilletjes geen tarief
   heeft — dezelfde reden waarom het tijdvak een vaste lijst is. */
const RITSOORTEN = [
  'Standaard transport',
  'Spoedtransport',
  'Directe spoed',
  'Internationaal transport'
];
function ritSoort(w) {
  const naam = String(w || '').trim();
  return RITSOORTEN.includes(naam) ? naam : null;
}

function adresTekst(w) {
  return String(w || '').trim().slice(0, 300);
}

/* Voor de naam van de rit is de hele straat te lang; de eerste regel volstaat
   om hem in een lijst terug te vinden. */
function adresKort(adres) {
  return String(adres).split(',')[0].trim().slice(0, 60);
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

  /* Koppelen kan aan een opdracht of rechtstreeks aan een rit. Dat tweede is
     nodig voor een rit die is ingepland voordat er een klant bij stond. */
  if (body.soort === 'rit') {
    const rit = naarRit(
      await patch(env, env.AIRTABLE_RITTEN, id, { [R.klantlink]: [klantId] })
    );
    return antwoord(200, { ok: true, rit }, origin, true);
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

  const velden = { [K.naam]: naam, [K.code]: verzinCode() };
  if (body.adres)    { velden[K.adres]    = String(body.adres).slice(0, 500); }
  if (body.email)    { velden[K.email]    = String(body.email).slice(0, 200); }
  if (body.telefoon) { velden[K.telefoon] = String(body.telefoon).slice(0, 50); }
  const termijn = Number(body.termijn);
  if (isFinite(termijn) && termijn > 0) { velden[K.termijn] = Math.round(termijn); }

  const klant = naarKlant(await maak(env, env.AIRTABLE_KLANTEN, velden));

  /* Aan een opdracht of rit koppelen mag, maar hoeft niet: je kunt ook gewoon
     een klant vastleggen zonder dat er al werk voor is. */
  let opdracht = null;
  let rit = null;

  const opdrachtId = recordId(body.opdrachtId);
  if (opdrachtId) {
    opdracht = naarOpdracht(
      await patch(env, env.AIRTABLE_OPDRACHTEN, opdrachtId, { [O.klantlink]: [klant.id] })
    );
    await koppelKlantAanRitten(env, opdrachtId, klant.id);
  }

  const ritId = recordId(body.ritId);
  if (ritId) {
    rit = naarRit(
      await patch(env, env.AIRTABLE_RITTEN, ritId, { [R.klantlink]: [klant.id] })
    );
  }

  return antwoord(200, { ok: true, klant, opdracht, rit }, origin, true);
}

/* Wat de rit jou heeft gekost. Airtable rekent daar Totale ritkosten, Winst en
   Winst per km uit, maar tot nu toe kon je die bedragen alleen achter een
   laptop invullen — en dus bleef het staan, en bleef je winstcijfer leeg.
   Dit hoort op de telefoon, meteen na de rit, met de bon nog in je hand. */
async function zetRitKosten(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }

  const velden = {};
  const posten = [['brandstof', R.brandstof], ['tol', R.tol], ['overig', R.overig]];
  for (const [naam, veld] of posten) {
    const bedrag = euroBedrag(body[naam]);
    if (bedrag !== null) { velden[veld] = bedrag; }
  }
  if (Object.keys(velden).length === 0) {
    return antwoord(400, { fout: 'Vul minstens een bedrag in' }, origin, true);
  }

  const rit = naarRit(await patch(env, env.AIRTABLE_RITTEN, id, velden));
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* Een klant uitnodigen voor zijn eigen portaal. De mail gaat niet vanaf hier
   de deur uit: deze Worker zet alleen het vinkje om, en een automatisering in
   Airtable verstuurt hem. Dat scheelt een verzenddienst en nog een sleutel, en
   de portaalcode hoeft dan nergens langs de telefoon.

   Een klant die nog geen code heeft krijgt er hier een. Anders zou de knop
   voor iedereen van voor het klantportaal niets doen, en dat is precies de
   groep die je wilt uitnodigen. */
async function stuurUitnodiging(env, body, origin) {
  const id = recordId(body.klantId);
  if (!id) { return antwoord(400, { fout: 'Ongeldig klant-id' }, origin, true); }

  const record = await airtable(env, `${env.AIRTABLE_KLANTEN}/${id}`);
  const f = record.fields || {};
  if (!f[K.email]) {
    return antwoord(400, {
      fout: 'Deze klant heeft geen e-mailadres. Vul dat eerst in bij de klant.'
    }, origin, true);
  }

  const velden = { [K.uitnodigen]: true };
  if (!f[K.code]) { velden[K.code] = verzinCode(); }

  const klant = naarKlant(await patch(env, env.AIRTABLE_KLANTEN, id, velden));
  return antwoord(200, { ok: true, klant, email: f[K.email] }, origin, true);
}

/* De werkelijk gereden kilometers. De schatting van de website komt van
   postcode naar postcode maal een wegfactor; wat er op de teller staat is iets
   anders, en dat is wat op de factuur hoort. */
async function zetRitKm(env, body, origin) {
  const id = recordId(body.id);
  if (!id) { return antwoord(400, { fout: 'Ongeldig rit-id' }, origin, true); }
  const km = kilometers(body.km);
  if (km === null) {
    return antwoord(400, { fout: 'Vul een aantal kilometers in' }, origin, true);
  }
  const velden = { [R.km]: km };

  /* De stops gaan mee met dezelfde knop. Ze staan naast de kilometers op het
     scherm en horen bij hetzelfde antwoord op dezelfde vraag: wat is er
     werkelijk gereden? Laat je het veld leeg, dan blijft het zoals het was. */
  const stops = heelGetal(body.stops);
  if (stops !== null) { velden[R.stops] = stops; }

  const tijdvak = tijdvakUit(body.tijdvak);
  if (tijdvak) { velden[R.tijdvak] = tijdvak; }

  /* Wachttijd en wat je aan de klant doorberekent horen bij dezelfde vraag:
     wat is er onderweg werkelijk gebeurd? Vandaar dezelfde knop. */
  const wacht = heelGetal(body.wachttijd, 1440);   /* een hele dag wachten is de bovengrens */
  if (wacht !== null) { velden[R.wachttijd] = wacht; }
  const doorbereken = euroBedrag(body.doorbereken);
  if (doorbereken !== null) { velden[R.doorbereken] = doorbereken; }

  /* Korting is het enige bedrag hier dat de prijs omlaag brengt, dus de reden
     hoort erbij: die komt op de factuur te staan. De reden is vrije tekst van
     jou, geen klant, maar hij gaat wel naar buiten — vandaar een lengtegrens. */
  const korting = euroBedrag(body.korting);
  if (korting !== null) { velden[R.korting] = korting; }
  if (body.kortingRe !== undefined) {
    velden[R.kortingRe] = String(body.kortingRe || '').trim().slice(0, 120);
  }

  const rit = naarRit(await patch(env, env.AIRTABLE_RITTEN, id, velden));
  return antwoord(200, { ok: true, rit }, origin, true);
}

/* ==========================================================================
   HET KLANTPORTAAL

   Alles hieronder wordt bekeken door iemand buiten het bedrijf. Twee regels
   gelden hier, en ze staan los van elkaar:

   1. Een klant ziet alleen zijn eigen records. Dat wordt afgedwongen door de
      zoekopdracht aan Airtable, niet door filteren achteraf.
   2. Een klant ziet alleen velden die op de lijst hieronder staan. Wat er
      niet op staat verlaat de server niet — dus ook niet verstopt in het
      antwoord waar iemand het uit kan vissen. Je brandstof, tol, overige
      kosten en je winst staan er bewust niet op.
   ========================================================================== */

/* Een klantcode gaat rechtstreeks een Airtable-formule in. Alles behalve
   letters, cijfers en streepjes wordt geweigerd, zodat er nooit een
   aanhalingsteken in kan staan waarmee je die formule kunt omschrijven. */
function schoneCode(w) {
  const c = String(w || '');
  return /^[A-Za-z0-9-]{12,64}$/.test(c) ? c : null;
}

function verzinCode() {
  const tekens = 'abcdefghijkmnopqrstuvwxyz23456789';
  const ruw = new Uint8Array(24);
  crypto.getRandomValues(ruw);
  let uit = '';
  for (let i = 0; i < ruw.length; i++) {
    if (i > 0 && i % 6 === 0) { uit += '-'; }
    uit += tekens[ruw[i] % tekens.length];
  }
  return uit;
}

const KLANT_ACTIES = ['klantoverzicht', 'klantannuleer'];

async function klantPoort(env, code, body, origin) {
  const schoon = schoneCode(code);
  if (!schoon || !KLANT_ACTIES.includes(body.actie)) {
    await new Promise((r) => setTimeout(r, 700));
    return antwoord(401, { fout: 'Onjuiste toegangscode' }, origin, true);
  }

  const klant = await klantBijCode(env, schoon);
  if (!klant) {
    await new Promise((r) => setTimeout(r, 700));
    return antwoord(401, { fout: 'Onjuiste toegangscode' }, origin, true);
  }

  if (body.actie === 'klantannuleer') {
    const uit = await klantAnnuleert(env, klant, body);
    if (uit.fout) { return antwoord(uit.code || 400, { fout: uit.fout }, origin, true); }
  }

  const [ritten, facturen] = await Promise.all([
    klantRitten(env, klant.id),
    klantFacturen(env, klant.id)
  ]);

  return antwoord(200, {
    ok: true,
    klant: { naam: klant.naam, nummer: klant.nummer },
    ritten,
    facturen
  }, origin, true);
}

/* Een klant mag zijn eigen rit afzeggen, en alleen die. Daarom zoeken we de
   rit niet op het nummer dat hij meestuurt, maar in de lijst die aan hém
   hangt: staat de sleutel daar niet tussen, dan bestaat de rit voor hem niet.
   Een klant die met de sleutel van een ander komt, komt dus nergens.

   Alleen een rit die nog op Gepland staat. Zijn we al onderweg, dan kost het
   geld (artikel 9 van de voorwaarden) en hoort daar een telefoontje bij, geen
   knop op een website waar niemand naar kijkt. */
async function klantAnnuleert(env, klant, body) {
  const sleutel = String(body.rit || '');
  if (!/^[a-f0-9]{16}$/.test(sleutel)) { return { code: 400, fout: 'Onbekende zending' }; }

  const ids = await klantRitIds(env, klant.id);
  const id = ids.find((r) => ritSleutel(r) === sleutel);
  if (!id) { return { code: 404, fout: 'Onbekende zending' }; }

  const rit = await airtable(env, `${env.AIRTABLE_RITTEN}/${id}`);
  const status = keuze((rit.fields || {})[R.status]) || 'Gepland';
  if (status === 'Geannuleerd') { return { code: 409, fout: 'Deze zending is al geannuleerd.' }; }
  if (status !== 'Gepland') {
    return {
      code: 409,
      fout: 'Wij zijn al onderweg met deze zending. Bel ons even, dan regelen ' +
            'wij het samen.'
    };
  }

  const velden = {
    [R.status]:    'Geannuleerd',
    [R.annulDoor]: true,
    [R.annulOp]:   new Date().toISOString()
  };
  const reden = String(body.reden || '').trim().slice(0, 500);
  if (reden) { velden[R.annulReden] = reden; }
  await patch(env, env.AIRTABLE_RITTEN, id, velden);
  return {};
}

async function klantBijCode(env, code) {
  const zoek = new URLSearchParams();
  zoek.set('filterByFormula', `{${K.code}} = '${code}'`);
  zoek.set('pageSize', '2');
  const data = await airtable(env, `${env.AIRTABLE_KLANTEN}?${zoek}`);
  const gevonden = data.records || [];
  /* Twee klanten met dezelfde code is een fout in de administratie. Dan
     niemand binnenlaten in plaats van gokken wie het is. */
  if (gevonden.length !== 1) { return null; }
  return naarKlant(gevonden[0]);
}

/* Niet zoeken in alle ritten en dan filteren, maar de klant zelf vragen welke
   ritten aan hem hangen en alleen die ophalen. Zo kan een fout in een filter
   nooit een rit van iemand anders opleveren: die staat simpelweg niet in de
   lijst waar we mee beginnen. */
async function klantRecords(env, klantId, koppelveld, tabel, omzetter) {
  const ids = await klantLinkIds(env, klantId, koppelveld);
  if (!ids.length) { return []; }

  const uit = [];
  for (const brok of inBrokken(ids, 20)) {
    const q = new URLSearchParams();
    q.set('filterByFormula',
      'OR(' + brok.map((id) => `RECORD_ID() = '${id}'`).join(',') + ')');
    q.set('pageSize', '100');
    const data = await airtable(env, `${tabel}?${q}`);
    (data.records || []).forEach((r) => uit.push(omzetter(r)));
  }
  uit.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  return uit;
}

async function klantLinkIds(env, klantId, koppelveld) {
  const klant = await airtable(env, `${env.AIRTABLE_KLANTEN}/${klantId}`);
  return ((klant.fields || {})[koppelveld] || [])
    .map((r) => (r && r.id) || r)
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(String(id)));
}

function klantRitten(env, klantId) {
  return klantRecords(env, klantId, 'Ritten', env.AIRTABLE_RITTEN, naarKlantRit);
}

function klantRitIds(env, klantId) {
  return klantLinkIds(env, klantId, 'Ritten');
}

/* Een klant krijgt nooit een record-id van ons te zien; die horen bij de
   binnenkant van de administratie. Om toch een knop te kunnen maken die
   zegt "annuleer déze rit", krijgt elke rit een vaste, betekenisloze sleutel.
   Wij rekenen hem terug door de sleutels van zijn eigen ritten uit te rekenen
   en te kijken welke past — er hoeft dus niets ontcijferd te worden, en een
   sleutel op zichzelf opent niets. */
function ritSleutel(id) {
  const tekst = 'schaap-rit:' + String(id);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < tekst.length; i++) {
    a = Math.imul(a ^ tekst.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + tekst.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function klantFacturen(env, klantId) {
  return klantRecords(env, klantId, 'Facturen', env.AIRTABLE_FACTUREN, naarKlantFactuur);
}

function inBrokken(lijst, maat) {
  const uit = [];
  for (let i = 0; i < lijst.length; i += maat) { uit.push(lijst.slice(i, i + maat)); }
  return uit;
}

/* Precies dit, en niets meer. Brandstof, tol, overige ritkosten, totale
   ritkosten, winst en winst per km staan er bewust niet bij: dat is jouw
   bedrijfsvoering en niet die van je klant. */
function naarKlantRit(record) {
  const f = record.fields || {};
  const status = keuze(f[R.status]) || 'Gepland';
  return {
    /* Geen record-id, maar de betekenisloze sleutel. Genoeg om er een knop
       aan te hangen, te weinig om iets mee te doen. */
    sleutel:    ritSleutel(record.id),
    magAnnuleren: status === 'Gepland',
    geannuleerdOp: f[R.annulOp] || '',
    datum:      f[R.datum] || '',
    type:       keuze(f[R.type]),
    status:     status,
    ophaal:     f[R.ophaal] || '',
    aflever:    f[R.aflever] || '',
    km:         f[R.km] || 0,
    bedrag:     f[R.totaal] || 0,
    getekend:   f[R.getekendD] || '',
    getekendOp: f[R.getekendO] || '',
    afgeleverd: Array.isArray(f[R.handtek]) && f[R.handtek].length > 0,
    /* De klant mag zijn eigen afleverbewijs zien. Het is het bewijs dat zijn
       zending is aangekomen; daar hoeft hij ons niet voor te bellen. */
    krabbel:    bijlageUrl(f[R.handtek])
  };
}

function naarKlantFactuur(record) {
  const f = record.fields || {};
  const pdf = Array.isArray(f['PDF']) && f['PDF'].length ? f['PDF'][0] : null;
  return {
    nummer:     f['Factuurnummer'] || '',
    datum:      f['Factuurdatum'] || '',
    vervalt:    f['Vervaldatum'] || f['Vervaldatum berekend'] || '',
    totaal:     f['Totaal'] || 0,
    betaald:    f['Betaald'] || 0,
    openstaand: f['Openstaand'] || 0,
    status:     keuze(f['Status']) || '',
    /* De beheerbalk boven de factuur ("sleep de PDF in Airtable") is voor ons.
       De klant krijgt dezelfde pagina zonder die schakelaar erin. */
    link:       zonderBeheer(f['Factuurlink']),
    pdf:        pdf ? (pdf.url || '') : ''
  };
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

/* Een komma als decimaalteken is wat je op een Nederlandse telefoon typt.
   Negatief of onzin wordt geweigerd; nul mag, dat betekent "nog niet bekend". */
function kilometers(w) {
  if (w === undefined || w === null || w === '') { return null; }
  const km = Number(String(w).replace(',', '.'));
  if (!isFinite(km) || km < 0 || km > 100000) { return null; }
  return Math.round(km * 10) / 10;
}

/* Het tijdvak bepaalt de avond- of nachttoeslag, dus een verzonnen naam mag er
   niet in: die zou in Airtable een nieuwe keuze aanmaken en stilletjes geen
   toeslag opleveren. Alleen deze drie bestaan. */
const TIJDVAKKEN = ['Overdag', 'Avondrit (18:00-23:00)', 'Nacht- of weekendrit'];
function tijdvakUit(w) {
  return TIJDVAKKEN.includes(String(w || '')) ? String(w) : null;
}

/* Een bedrag in euro's. Nul is een geldig antwoord — "deze rit kostte niets
   aan tol" is iets anders dan "nog niet ingevuld" — dus leeg blijft leeg. */
function euroBedrag(w) {
  if (w === undefined || w === null || w === '') { return null; }
  const n = Number(String(w).replace(',', '.'));
  if (!isFinite(n) || n < 0 || n > 100000) { return null; }
  return Math.round(n * 100) / 100;
}

/* Een tijd zoals 14:30. Wat de telefoon uit een tijdveld geeft is al zo, maar
   wat uit Airtable komt is vrije tekst en kan van alles zijn. */
function klokTijd(w) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(w || ''));
  if (!m) { return null; }
  const uur = Number(m[1]);
  const min = Number(m[2]);
  if (uur > 23 || min > 59) { return null; }
  return String(uur).padStart(2, '0') + ':' + m[2];
}

/* Een aantal dat je telt, geen bedrag: extra stops. Leeg blijft leeg, zodat
   "niets ingevuld" iets anders is dan "nul stops". */
function heelGetal(w, maximum) {
  if (w === undefined || w === null || w === '') { return null; }
  const n = Number(String(w).trim());
  if (!isFinite(n) || n < 0 || n > (maximum || 50)) { return null; }
  return Math.round(n);
}

/* Het adres van de eerste bijlage. Airtable geeft die links een houdbaarheid
   mee, dus hij is niet eeuwig geldig — precies goed voor iets wat je opent op
   het moment dat je ernaar kijkt. */
function bijlageUrl(veld) {
  if (!Array.isArray(veld) || !veld.length) { return ''; }
  const eerste = veld[0] || {};
  return String(eerste.url || '');
}

function zonderBeheer(link) {
  return String(link || '').replace(/([?&])beheer=1&?/, '$1').replace(/[?&]$/, '');
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
    stops:      f[R.stops] || 0,
    tijdvak:    keuze(f[R.tijdvak]) || '',
    tijd:       f[R.tijd] || '',
    /* De kosten en de winst zijn alleen voor deze kant. Het klantportaal heeft
       een eigen lijst met velden en die staan daar niet op. */
    brandstof:  f[R.brandstof] || 0,
    tol:        f[R.tol] || 0,
    overig:     f[R.overig] || 0,
    kosten:     f[R.kosten] || 0,
    winst:      f[R.winst] || 0,
    bevestigd:  f[R.bevestigd] || '',
    wachttijd:  f[R.wachttijd] || 0,
    doorbereken:f[R.doorbereken] || 0,
    korting:    f[R.korting] || 0,
    kortingRe:  f[R.kortingRe] || '',
    klant:      eerste(f[R.klant]),
    telefoon:   eerste(f[R.telefoon]),
    opmerking:  f[R.opmerking] || '',
    bedrag:     f[R.totaal] || 0,
    getekend:   f[R.getekendD] || '',
    getekendOp: f[R.getekendO] || '',
    onderweg:   f[R.onderweg] || '',
    /* Heeft de klant zelf afgezegd, dan wil je dat op de ritkaart zien staan,
       met zijn reden erbij. Anders sta je te raden waarom die rit weg is. */
    afgezegdDoorKlant: f[R.annulDoor] === true,
    afgezegdOp: f[R.annulOp] || '',
    afzegreden: f[R.annulReden] || '',
    handtekening: Array.isArray(f[R.handtek]) && f[R.handtek].length > 0,
    /* De krabbel zelf. Zonder deze link kun je hem nergens terugzien behalve
       in Airtable, en dan is het geen afleverbewijs dat je even laat zien. */
    krabbel:      bijlageUrl(f[R.handtek])
  };
}

function naarOpdracht(record) {
  const f = record.fields || {};
  return {
    id:         record.id,
    naam:       f[O.opdracht] || '',
    klant:      eerste(f[O.klant]),
    heeftKlant: Array.isArray(f[O.klantlink]) && f[O.klantlink].length > 0,
    /* Het id van de gekoppelde klant, zodat het portaal die klant kan
       uitnodigen zonder hem eerst op naam te moeten terugzoeken. */
    klantId:    (Array.isArray(f[O.klantlink]) && f[O.klantlink].length
                  ? (f[O.klantlink][0].id || f[O.klantlink][0]) : ''),
    datum:      f[O.datum] || '',
    tijd:       f[O.tijd] || '',
    ophaal:     f[O.ophaal] || '',
    aflever:    f[O.aflever] || '',
    referentie: f[O.referentie] || '',
    status:     keuze(f[O.status]) || '',
    opmerking:  f[O.opmerking] || '',
    type:       keuze(f[O.type]),
    km:         f[O.km] || 0,
    stops:      f[O.stops] || 0,
    tijdvak:    keuze(f[O.tijdvak]) || '',
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
    nummer:   f[K.nummer] || '',
    /* Wanneer deze klant voor het laatst een uitnodiging kreeg. De portaalcode
       zelf blijft hier bewust buiten: die hoeft de telefoon niet te weten. */
    uitgenodigd: f[K.uitgenodigd] || ''
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
