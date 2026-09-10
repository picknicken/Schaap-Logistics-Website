/* =========================================================================
   Het factuurnummer moet permanent zijn.

   Eén factuur, één nummer, en dat nummer verandert nooit meer. Dat klinkt
   vanzelfsprekend maar was het niet: de formule nam het jaartal uit
   `Factuurdatum`, en dat veld blijft bewerkbaar. Corrigeerde je in januari de
   datum van een factuur die je in december verstuurde, dan werd SL-2026-0043
   stilzwijgend SL-2027-0043 — op een papier dat al bij de klant lag.

   Het jaartal is er daarom uit. Wat overblijft is `SL-` plus `Volgnummer`, en
   dat volgnummer is een autoNumber: Airtable kent het eenmalig toe, hergebruikt
   het nooit en niemand kan het wijzigen.

   Deze proef bestaat omdat die beslissing over een jaar niet meer voor zichzelf
   spreekt. Iemand — ik, een volgende sessie, jijzelf in Airtable — kan de
   formule "verbeteren" door het jaartal terug te zetten. Dan valt dit om.

   Twee lagen, net als bij faal-zelfde-som-airtable:

   1. Zonder sleutel — altijd, ook in CI. De formule staat hieronder
      overgeschreven in JavaScript en wordt op zijn eigenschappen getoetst.

   2. Mét sleutel — als AIRTABLE_TOKEN in de omgeving staat. Dan wordt gekeken
      wat er wérkelijk in de base staat: klopt het nummer van elke bestaande
      factuur met SL- plus zijn volgnummer, en staat er geen datumfunctie meer
      in de formule. Laag 1 kan dat per definitie niet zien.

          AIRTABLE_TOKEN=pat... node tests/faal-factuurnummer.mjs

   De sleutel hoort in je terminal en nergens anders.
   ========================================================================= */
const BASE = process.env.AIRTABLE_BASE || 'appLUKMbBBkJUagFs';
const TABEL = 'tblDA2m46PWhhiFnC';                 /* Facturen */
const VELD_NUMMER = 'fldqvOr33z4aZrTnP';           /* Factuurnummer */
const VELD_VOLG = 'fldiJUbvPkRIvUTuW';             /* Volgnummer */
const VELD_DATUM = 'fldhtTQrKb7oOxGn0';            /* Factuurdatum */

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

console.log('\n=== het factuurnummer staat vast ===');

/* =========================================================================
   Laag 1: de formule, overgeschreven.

   IF(
     AND({Factuurdatum}, {Volgnummer}),
     "SL-" & IF({Volgnummer} < 10000, RIGHT("000" & {Volgnummer}, 4), {Volgnummer} & ""),
     BLANK()
   )

   De datum staat er nog wel in, maar alleen als poort: hij bepaalt óf er een
   nummer is, niet wélk. Dat onderscheid is de hele wijziging.
   ========================================================================= */
function factuurnummer(volgnummer, factuurdatum) {
  const volg = Number(volgnummer);
  if (!factuurdatum || !volg) { return ''; }
  return 'SL-' + (volg < 10000 ? String(volg).padStart(4, '0') : String(volg));
}

console.log('\nde datum bepaalt het nummer niet');
{
  /* Dezelfde factuur, elke denkbare datum. Het nummer hoort er niet van te
     bewegen — ook niet over een jaargrens heen, want daar ging het mis. */
  const datums = ['2026-01-01', '2026-09-09', '2026-12-31', '2027-01-01',
                  '2027-01-02', '2030-06-15', '2099-12-31'];
  const nummers = datums.map((d) => factuurnummer(43, d));
  keur('43 geeft altijd SL-0043, welke datum er ook staat',
    nummers.every((n) => n === 'SL-0043'), nummers.join(' | '));

  /* Het scenario waar het werkelijk misging: december factureren, in januari
     de datum corrigeren. */
  const voor = factuurnummer(43, '2026-12-31');
  const na = factuurnummer(43, '2027-01-02');
  keur('een correctie van december naar januari verandert niets',
    voor === na && voor === 'SL-0043', voor + ' werd ' + na);

  /* En het jaartal hoort er niet meer in te staan. Zou iemand het terugzetten,
     dan is dít de regel die het zegt. */
  keur('er zit geen jaartal in het nummer',
    !/20\d\d/.test(factuurnummer(43, '2026-09-09')), factuurnummer(43, '2026-09-09'));
}

console.log('\nde datum is nog wel de poort');
{
  keur('zonder factuurdatum is er geen nummer',
    factuurnummer(43, '') === '', factuurnummer(43, ''));
  keur('zonder volgnummer ook niet',
    factuurnummer(0, '2026-09-09') === '', factuurnummer(0, '2026-09-09'));

  /* Dit is waarom de poort mag blijven: hij komt identiek terug. Onder de oude
     formule kwam hij anders terug, en dat was het probleem. */
  keur('en na het terugzetten van de datum komt hetzelfde nummer terug',
    factuurnummer(43, '2027-03-01') === 'SL-0043',
    factuurnummer(43, '2027-03-01'));
}

console.log('\nde opvulling tot vier cijfers');
{
  const proef = [[1, 'SL-0001'], [8, 'SL-0008'], [42, 'SL-0042'],
                 [999, 'SL-0999'], [9999, 'SL-9999'],
                 /* Hier kapte RIGHT("000" & n, 4) af: 10000 werd 0000, en
                    daarna kreeg elke factuur hetzelfde nummer. */
                 [10000, 'SL-10000'], [10001, 'SL-10001'],
                 [123456, 'SL-123456']];
  proef.forEach(([volg, verwacht]) => {
    const uit = factuurnummer(volg, '2026-09-09');
    keur(volg + ' geeft ' + verwacht, uit === verwacht, uit);
  });

  /* En het belangrijkste van alles: twee facturen mogen nooit hetzelfde nummer
     krijgen. Bij de oude opvulling gebeurde dat vanaf 10000 wél. */
  const gezien = new Set();
  let dubbel = null;
  for (let n = 1; n <= 12000; n++) {
    const nr = factuurnummer(n, '2026-09-09');
    if (gezien.has(nr)) { dubbel = nr; break; }
    gezien.add(nr);
  }
  keur('twaalfduizend facturen leveren twaalfduizend verschillende nummers op',
    dubbel === null && gezien.size === 12000, dubbel || gezien.size);
}

/* =========================================================================
   Laag 2: wat er werkelijk in de base staat.
   ========================================================================= */
const token = process.env.AIRTABLE_TOKEN;
if (!token) {
  console.log('\nde werkelijke base wordt overgeslagen (geen AIRTABLE_TOKEN)');
  console.log('  Laag 1 kan niet zien dat iemand de formule in Airtable heeft');
  console.log('  aangepast. Draai hem daarom na elke wijziging aan die formule:');
  console.log('      AIRTABLE_TOKEN=pat... node tests/faal-factuurnummer.mjs');
} else {
  console.log('\nde nummers van de werkelijke facturen');
  try {
    const zoek = new URLSearchParams();
    zoek.set('pageSize', '100');
    ['fldqvOr33z4aZrTnP', 'fldiJUbvPkRIvUTuW', 'fldhtTQrKb7oOxGn0']
      .forEach((v) => zoek.append('fields[]', v));
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${TABEL}?${zoek}`,
      { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { throw new Error('Airtable gaf ' + res.status); }
    const rijen = (await res.json()).records || [];
    keur('er zijn facturen om na te kijken', rijen.length > 0, rijen.length);

    /* Elk werkelijk nummer moet zijn wat de formule hoort te geven. Dit is de
       controle die geen schemarechten nodig heeft en toch merkt dat de formule
       in Airtable is veranderd. */
    const scheef = rijen.filter((r) => {
      const f = r.fields || {};
      return (f[VELD_NUMMER] || '') !== factuurnummer(f[VELD_VOLG], f[VELD_DATUM]);
    });
    keur('elk factuurnummer klopt met zijn volgnummer', scheef.length === 0,
      scheef.map((r) => (r.fields || {})[VELD_NUMMER]).join(' | '));

    const nummers = rijen.map((r) => (r.fields || {})[VELD_NUMMER]).filter(Boolean);
    keur('en geen twee facturen delen een nummer',
      new Set(nummers).size === nummers.length, nummers.join(' | '));
    keur('geen enkel nummer draagt een jaartal',
      !nummers.some((n) => /20\d\d/.test(n)), nummers.join(' | '));
  } catch (fout) {
    keur('de facturen konden worden opgehaald', false, fout.message);
  }

  console.log('\nde formule zelf');
  try {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`,
      { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) { throw new Error('Airtable gaf ' + res.status); }
    const tabel = ((await res.json()).tables || []).find((t) => t.id === TABEL);
    const veld = ((tabel || {}).fields || []).find((f) => f.id === VELD_NUMMER);
    const formule = String(((veld || {}).options || {}).formula || '');
    keur('de formule is leesbaar', formule.length > 10, formule.length);

    /* De enige manier waarop de datum weer in het nummer kan sluipen is via een
       datumfunctie of een letterlijk jaartal. */
    keur('er staat geen datumopmaak in de formule',
      !/DATETIME_FORMAT|YEAR\s*\(/i.test(formule), formule.slice(0, 200));
    keur('en geen letterlijk jaartal', !/YYYY|20\d\d/.test(formule),
      formule.slice(0, 200));
    /* Airtable geeft een formule terug met veld-id's, maar wie hem in de
       gebruikersomgeving overtikt kan er namen in zetten. Allebei goed. */
    keur('het volgnummer staat er wel in',
      formule.includes(VELD_VOLG) || /\{Volgnummer\}/.test(formule),
      formule.slice(0, 200));
    keur('en de datum nog als poort',
      formule.includes(VELD_DATUM) || /\{Factuurdatum\}/.test(formule),
      formule.slice(0, 200));
    keur('de opvulling kapt niet meer af boven 9999',
      /10000/.test(formule), formule.slice(0, 200));
  } catch (fout) {
    console.log('  (overgeslagen: ' + fout.message + ')');
    console.log('  Deze sleutel mag het schema niet lezen. De controle op de');
    console.log('  nummers hierboven is dan de vangnet.');
  }
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
