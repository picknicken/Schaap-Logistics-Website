/* =========================================================================
   Rekent de som op de server na tegen de som in de browser.

   De prijs staat op twee plekken: `assets/site.js` toont hem aan de bezoeker,
   `worker/aanvragen.js` bewaart hem. Twee kopieën van dezelfde som is een
   bewuste keuze — een Worker en een browserscript delen geen module zonder
   bouwstap, en die staat er met opzet niet — maar dan moet wel bewezen zijn
   dat ze hetzelfde doen. Anders ziet de klant een ander bedrag dan er in de
   administratie belandt, en dat merk je pas bij de factuur.

   Deze proef vergelijkt alle vier de diensten, alle drie de tijdvakken, nul
   tot vier stops en een reeks postcodes tegen elkaar: ruim zestienhonderd
   combinaties. Wijkt er één cent af, dan valt hij hier om.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));

/* --- de browserkant: site.js draaien met een leeg schermpje eromheen --- */
const leeg = { addEventListener() {}, classList: { toggle() {} }, style: {},
               setAttribute() {}, removeAttribute() {}, querySelector: () => null,
               getAttribute: () => null, textContent: '', value: '' };
globalThis.window = globalThis;
globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener() {},
  documentElement: leeg,
  body: leeg
};
new Function(fs.readFileSync(path.join(hier, '../assets/site.js'), 'utf8'))();
const SL = globalThis.window.SL;

/* --- de serverkant: de Worker laden en zijn eigen berekening uitlokken --- */
const worker = (await import('../worker/aanvragen.js')).default;
const env = { AIRTABLE_TOKEN: 'x', AIRTABLE_BASE: 'appX', AIRTABLE_TABEL: 'tblX',
              TOEGESTANE_ORIGIN: 'https://schaaplogistics.nl' };
let laatste = null;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.airtable.com')) {
    laatste = JSON.parse(opts.body).records[0].fields;
  }
  return new Response(JSON.stringify({ records: [{ id: 'recTEST0000000001' }] }), { status: 200 });
};

let ip = 0;
async function viaWorker(velden) {
  laatste = null;
  await worker.fetch(new Request('https://w.dev/', {
    method: 'POST',
    headers: { Origin: 'https://schaaplogistics.nl', 'Content-Type': 'application/json',
               'CF-Connecting-IP': '10.1.' + Math.floor(ip / 250) + '.' + (ip++ % 250) },
    body: JSON.stringify({
      velden: { Bedrijf: 'B', Contactpersoon: 'C', Telefoon: '06', 'E-mail': 'a@b.nl',
                ...velden },
      voorwaarden: true, voorwaardenVersie: '2026-09-08'
    })
  }), env);
  return laatste || {};
}

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + extra : '')); }
};

console.log('\n=== dezelfde som op de server en in de browser ===');

const DIENSTEN = [
  ['Standaard transport', 'standaard'],
  ['Spoedtransport', 'spoed'],
  ['Directe spoed', 'direct']
];
const TIJDVAKKEN = [
  ['Overdag', 'dag'],
  ['Avondrit (18:00-23:00)', 'avond'],
  ['Nacht- of weekendrit', 'nacht']
];
const POSTCODES = ['1011', '2011', '3011', '4011', '5611', '6811', '7511', '8011',
                   '9711', '1234', '5911', '6411'];

let vergeleken = 0, afwijkingen = [];
for (const [naam, sleutel] of DIENSTEN) {
  for (const [tvNaam, tvSleutel] of TIJDVAKKEN) {
    for (const stops of [0, 1, 2, 4]) {
      for (const van of POSTCODES.slice(0, 4)) {
        for (const naarPc of POSTCODES) {
          if (van === naarPc && stops > 0) { continue; }
          const kmSite = SL.schatAfstand(van, naarPc);
          const site = SL.bereken(sleutel, kmSite, tvSleutel, stops);
          const server = await viaWorker({
            Dienst: naam, Tijdvak: tvNaam, Ophaalpostcode: van,
            Afleverpostcode: naarPc, 'Extra stops': String(stops)
          });
          vergeleken++;
          if (server['Geschatte afstand km'] !== kmSite ||
              server['Prijsindicatie excl btw'] !== site.totaalExcl) {
            afwijkingen.push(`${naam}/${tvNaam}/${stops} stops ${van}->${naarPc}: ` +
              `site ${kmSite}km ${site.totaalExcl} | server ` +
              `${server['Geschatte afstand km']}km ${server['Prijsindicatie excl btw']}`);
          }
        }
      }
    }
  }
}

keur(vergeleken + ' combinaties geven aan beide kanten hetzelfde bedrag',
  afwijkingen.length === 0, afwijkingen.slice(0, 5).join(' ; '));

/* En de gevallen waarin de site geen prijs toont, hoort de server er ook geen
   te bewaren. */
const kmIntl = SL.schatAfstand('3011', '5611');
const intl = await viaWorker({ Dienst: 'Internationaal transport', Tijdvak: 'Overdag',
  Ophaalpostcode: '3011', Afleverpostcode: '5611' });
keur('internationaal krijgt aan beide kanten geen automatische prijs',
  !('Prijsindicatie excl btw' in intl) && SL.CONFIG.ritten.internationaal.buitenland === true,
  JSON.stringify(intl['Prijsindicatie excl btw']));

/* De afstandsschatting zelf, los van de prijs. */
let afstandFout = 0;
for (const a of POSTCODES) {
  for (const b of POSTCODES) {
    const server = await viaWorker({ Dienst: 'Standaard transport', Tijdvak: 'Overdag',
      Ophaalpostcode: a, Afleverpostcode: b });
    if (server['Geschatte afstand km'] !== SL.schatAfstand(a, b)) { afstandFout++; }
  }
}
keur('de afstandsschatting is aan beide kanten gelijk', afstandFout === 0,
  afstandFout + ' afwijkingen');

/* De tarieven zelf: staan ze op beide plekken op hetzelfde bedrag? Dit is de
   controle die aanslaat als iemand er maar één bijwerkt. */
const uitSite = Object.values(SL.CONFIG.ritten)
  .map((r) => r.naam + ' ' + r.start + '/' + r.km + '/' + (r.minimum || SL.CONFIG.minimum))
  .sort().join(' | ');
const server5 = await viaWorker({ Dienst: 'Standaard transport', Tijdvak: 'Overdag',
  Ophaalpostcode: '3011', Afleverpostcode: '3011' });
keur('het minimumtarief is aan beide kanten 75',
  SL.CONFIG.minimum === 75 && server5['Prijsindicatie excl btw'] >= 75, uitSite);
keur('de stoptoeslag is aan beide kanten 25', SL.CONFIG.stoptoeslag === 25);

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
process.exit(fouten ? 1 : 0);
