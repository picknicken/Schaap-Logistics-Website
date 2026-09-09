/* =========================================================================
   De derde kopie van de prijs: die in Airtable.

   De som staat op drie plekken. `assets/site.js` toont hem aan de bezoeker,
   `worker/aanvragen.js` bewaart hem bij de aanvraag, en de formule
   `Automatisch totaal excl. BTW` op de tabel Ritten bepaalt wat er werkelijk
   gefactureerd wordt. faal-zelfde-som.mjs bewaakt de eerste twee. Deze proef
   gaat over de derde, en dat is de gevaarlijkste van de drie: als de site
   €287 belooft en Airtable €310 factureert, merkt de klant het en jij niet.

   Wat hier gebeurt, in twee lagen:

   1. Zonder sleutel — altijd, ook in CI. De Airtable-formule staat hieronder
      overgeschreven in JavaScript, en die transcriptie wordt over alle
      combinaties tegen bereken() uit site.js gelegd. Verandert er een tarief
      in site.js en niet hier, dan valt hij om.

   2. Mét sleutel — als AIRTABLE_TOKEN in de omgeving staat. Dan wordt de
      werkelijke formule uit de base gehaald en gecontroleerd of de bedragen
      die site.js noemt er letterlijk in staan. Dat is de enige laag die merkt
      dat iemand de formule in Airtable zelf heeft aangepast; laag 1 kan dat
      per definitie niet zien.

   Draai laag 2 na elke tariefwijziging:
       AIRTABLE_TOKEN=pat... node faal-zelfde-som-airtable.mjs
   De sleutel hoort in je terminal en nergens anders — niet in dit bestand,
   niet in een workflow, niet in een appje.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.AIRTABLE_BASE || 'appLUKMbBBkJUagFs';
const TABEL = 'tblNH4BAVu9uRHZIS';                     /* Ritten */
const VELD_TOTAAL = 'fld7gepVbBomFTijj';               /* Automatisch totaal excl. BTW */
const VELD_TIJD = 'fldABWjJivQlBUsaS';                 /* Tijdtoeslag */

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 400) : '')); }
};

/* --- site.js draaien met een leeg schermpje eromheen --- */
const leeg = { addEventListener() {}, classList: { toggle() {} }, style: {},
               setAttribute() {}, removeAttribute() {}, querySelector: () => null,
               getAttribute: () => null, textContent: '', value: '' };
globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelectorAll: () => [],
  querySelector: () => null, addEventListener() {}, documentElement: leeg, body: leeg };
new Function(fs.readFileSync(path.join(hier, '../assets/site.js'), 'utf8'))();
const SL = globalThis.window.SL;

console.log('\n=== dezelfde som in Airtable als op de site ===');

/* =========================================================================
   Laag 1: de Airtable-formule, overgeschreven.

   Verandert de formule in de base, dan verandert deze transcriptie mee — en
   laag 2 hieronder is wat je eraan herinnert.
   ========================================================================= */
const R2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/* IF({Starttarief}, {Starttarief}, SWITCH({Type rit}, "Spoedtransport", 100,
      "Directe spoed", 125, "Internationaal transport", 150, 75)) */
function atStart(type, eigen) {
  if (eigen) { return eigen; }
  return { 'Spoedtransport': 100, 'Directe spoed': 125,
           'Internationaal transport': 150 }[type] ?? 75;
}
/* IF({Km-tarief}, {Km-tarief}, SWITCH({Type rit}, "Spoedtransport", 1.5,
      "Directe spoed", 2, "Internationaal transport", 2, 1)) */
function atKm(type, eigen) {
  if (eigen) { return eigen; }
  return { 'Spoedtransport': 1.5, 'Directe spoed': 2,
           'Internationaal transport': 2 }[type] ?? 1;
}
/* IF({Type rit} = "Internationaal transport", 200, 75) */
function atBodem(type) { return type === 'Internationaal transport' ? 200 : 75; }

/* Het veld Tijdtoeslag. Let op dat het percentage over de ritprijs ná het
   minimum gaat en niet over de stops: die hebben hun eigen tarief. */
function atTijdtoeslag(tijdvak, type, km, start, kmtar) {
  const basis = Math.max(atStart(type, start) + km * atKm(type, kmtar), atBodem(type));
  if (tijdvak === 'Avondrit (18:00-23:00)') { return Math.max(R2(basis * 0.20), 25); }
  if (tijdvak === 'Nacht- of weekendrit') { return Math.max(R2(basis * 0.40), 50); }
  return 0;
}
/* ROUNDUP(MAX(0, {Wachttijd (minuten)} - 15) / 15, 0) * 15 */
function atWachttijd(min) { return Math.ceil(Math.max(0, (min || 0) - 15) / 15) * 15; }

/* Het veld Automatisch totaal excl. BTW. */
function atTotaalExcl(v) {
  const { km, type, tijdvak, stops = 0, start = 0, kmtar = 0,
          extra = 0, korting = 0, wacht = 0 } = v;
  /* IF(NOT({Kilometers}), BLANK(), ...) — geen kilometers, geen bedrag. Met
     opzet: een half ingevulde rit hoort geen prijs te verzinnen. */
  if (!km) { return null; }
  const basis = Math.max(atStart(type, start) + km * atKm(type, kmtar), atBodem(type));
  return R2(Math.max(
    basis + (stops || 0) * 25 + atTijdtoeslag(tijdvak, type, km, start, kmtar)
          + atWachttijd(wacht) + (extra || 0) - (korting || 0), 0));
}
/* ROUND({Automatisch totaal excl. BTW} * 0.21, 2) */
const atBtw = (excl) => R2(excl * 0.21);

const TYPES = [['Standaard transport', 'standaard'], ['Spoedtransport', 'spoed'],
               ['Directe spoed', 'direct'], ['Internationaal transport', 'internationaal']];
const TIJDEN = [['Overdag', 'dag'], ['Avondrit (18:00-23:00)', 'avond'],
                ['Nacht- of weekendrit', 'nacht']];
const KMS = [1, 3, 7, 10, 25, 49, 50, 74, 75, 100, 137, 200, 300, 412, 1000, 0.5, 12.4, 137.5];

console.log('\nde formule tegen de rekenmachine');
let n = 0; const afw = [];
for (const [tn, tk] of TYPES) {
  for (const [vn, vk] of TIJDEN) {
    for (const stops of [0, 1, 2, 5, 20]) {
      for (const km of KMS) {
        const at = atTotaalExcl({ km, type: tn, tijdvak: vn, stops });
        const site = SL.bereken(tk, km, vk, stops);
        n++;
        if (at !== site.totaalExcl) {
          afw.push(`${tn}/${vn}/${stops}st/${km}km: airtable ${at} | site ${site.totaalExcl}`);
        }
      }
    }
  }
}
keur(n + ' combinaties geven in Airtable hetzelfde bedrag als op de site',
  afw.length === 0, afw.slice(0, 5).join(' ; '));

/* De btw erbij: het totaal inclusief hoort op te tellen, niet opnieuw te
   vermenigvuldigen. Dat is dezelfde regel als op de factuurpagina. */
let btwAfw = 0;
for (const [tn, tk] of TYPES) {
  for (const km of KMS) {
    const excl = atTotaalExcl({ km, type: tn, tijdvak: 'Overdag' });
    const site = SL.bereken(tk, km, 'dag', 0);
    if (atBtw(excl) !== site.btw) { btwAfw++; }
    if (R2(excl + atBtw(excl)) !== site.totaalIncl) { btwAfw++; }
  }
}
keur('de btw en het totaal inclusief sluiten aan op de site', btwAfw === 0, btwAfw);

/* De wachttijdtoeslag staat alleen in Airtable — de site kent hem niet, want
   je weet pas achteraf hoe lang je stond. Dan toetsen we hem tegen CONFIG. */
console.log('\nde wachttijd, die alleen op de factuur bestaat');
const w = SL.CONFIG.wachttijd;
keur('de eerste ' + w.gratis + ' minuten zijn gratis', atWachttijd(w.gratis) === 0);
keur('een minuut daarna kost een heel kwartier',
  atWachttijd(w.gratis + 1) === w.tarief, atWachttijd(w.gratis + 1));
keur('en 46 minuten kosten er drie',
  atWachttijd(46) === 3 * w.tarief, atWachttijd(46));
keur('een leeg veld kost niets', atWachttijd(0) === 0 && atWachttijd(null) === 0);

/* =========================================================================
   Laag 2: de werkelijke formule uit de base.

   Wat we hier vragen is niet "staat er dezelfde tekst als vorige keer" — dan
   klaagt hij bij elke opmaakwijziging. We vragen: staan de bedragen die
   site.js noemt er letterlijk in. Verhoog je een tarief op de site en vergeet
   je Airtable, dan zegt deze proef precies welk stukje hij miste.
   ========================================================================= */

/* De verwachting wordt uit CONFIG afgeleid en niet ingetikt: zo kan hij niet
   verouderen zonder dat site.js verandert. */
function verwachteStukjes() {
  const r = SL.CONFIG.ritten;
  const getal = (x) => String(x).replace(/\.0+$/, '');
  return [
    ['het starttarief voor spoed', `"${r.spoed.naam}", ${getal(r.spoed.start)}`],
    ['het starttarief voor directe spoed', `"${r.direct.naam}", ${getal(r.direct.start)}`],
    ['het starttarief internationaal', `"${r.internationaal.naam}", ${getal(r.internationaal.start)}`],
    ['het kilometertarief voor spoed', `"${r.spoed.naam}", ${getal(r.spoed.km)}`],
    ['het kilometertarief voor directe spoed', `"${r.direct.naam}", ${getal(r.direct.km)}`],
    ['het minimum internationaal', `"${r.internationaal.naam}", ${getal(r.internationaal.minimum)}`],
    ['de stoptoeslag', `* ${getal(SL.CONFIG.stoptoeslag)}`]
  ];
}

async function haalFormule(token, veld) {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE}/tables`,
    { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) { throw new Error('Airtable gaf ' + res.status); }
  const data = await res.json();
  const tabel = (data.tables || []).find((t) => t.id === TABEL);
  if (!tabel) { throw new Error('tabel Ritten niet gevonden'); }
  const f = (tabel.fields || []).find((x) => x.id === veld);
  if (!f) { throw new Error('veld ' + veld + ' niet gevonden'); }
  return String((f.options || {}).formula || '');
}

function toetsFormule(naam, formule) {
  const plat = formule.replace(/\s+/g, ' ');
  keur(naam + ': er staat een formule in', plat.length > 20, plat.length);
  for (const [wat, stuk] of verwachteStukjes()) {
    if (naam === 'Tijdtoeslag' && !/stoptoeslag|minimum/.test(wat)) { continue; }
    keur('  ' + wat + ' staat erin (' + stuk + ')', plat.includes(stuk), plat.slice(0, 200));
  }
}

console.log('\nde formule zoals hij werkelijk in de base staat');

/* Eerst de leescode zelf beproeven met een nagebootst antwoord — anders staat
   hier code die alleen bij jou op de laptop ooit draait, en die is net zo goed
   ongetest als geen code. */
{
  const echt = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    tables: [{ id: TABEL, fields: [{ id: VELD_TOTAAL, options: { formula: 'HALLO 42' } }] }]
  }), { status: 200 });
  const uit = await haalFormule('nep', VELD_TOTAAL).catch((e) => 'FOUT: ' + e.message);
  keur('de leescode haalt de formule uit een antwoord', uit === 'HALLO 42', uit);

  globalThis.fetch = async () => new Response('nee', { status: 401 });
  const stuk = await haalFormule('nep', VELD_TOTAAL).then(() => null).catch((e) => e.message);
  keur('en zegt het eerlijk als de sleutel niet deugt', stuk === 'Airtable gaf 401', stuk);

  globalThis.fetch = async () => new Response(JSON.stringify({ tables: [] }), { status: 200 });
  const weg = await haalFormule('nep', VELD_TOTAAL).then(() => null).catch((e) => e.message);
  keur('en als de tabel er niet meer is', weg === 'tabel Ritten niet gevonden', weg);

  globalThis.fetch = echt;
}

const token = process.env.AIRTABLE_TOKEN;
if (!token) {
  console.log('\n  overgeslagen: geen AIRTABLE_TOKEN in de omgeving.');
  console.log('  Laag 1 hierboven merkt een tariefwijziging in site.js, maar niet');
  console.log('  dat iemand de formule in Airtable zelf heeft veranderd. Draai na');
  console.log('  elke tariefwijziging eenmalig:');
  console.log('      AIRTABLE_TOKEN=pat... node faal-zelfde-som-airtable.mjs');
} else {
  try {
    toetsFormule('Automatisch totaal', await haalFormule(token, VELD_TOTAAL));
    const tijd = await haalFormule(token, VELD_TIJD);
    const plat = tijd.replace(/\s+/g, ' ');
    for (const [sleutel, t] of [['avond', SL.CONFIG.tijden.avond], ['nacht', SL.CONFIG.tijden.nacht]]) {
      keur('Tijdtoeslag: het percentage voor ' + sleutel + ' (' + t.deel + ')',
        plat.includes('* ' + t.deel), plat.slice(0, 200));
      keur('Tijdtoeslag: de bodem voor ' + sleutel + ' (' + t.bodem + ')',
        plat.includes(', ' + t.bodem + ' )') || plat.includes(', ' + t.bodem + ')'),
        plat.slice(0, 200));
    }
  } catch (fout) {
    keur('de formule uit de base halen', false, fout.message);
  }
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
