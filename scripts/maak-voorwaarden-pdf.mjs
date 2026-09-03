/* =========================================================================
   Maakt voorwaarden/algemene-voorwaarden-schaap-logistics.pdf uit de pagina
   /voorwaarden/.

   Waarom die PDF bestaat: algemene voorwaarden binden een klant alleen als hij
   ze krijgt aangeboden in een vorm die hij kan opslaan en later terugkijken.
   Een webpagina die morgen anders kan zijn is dat niet.

   Draaien, met een webserver op de map van het project:

     node scripts/maak-voorwaarden-pdf.mjs http://127.0.0.1:8080

   Doe dit opnieuw zodra je iets aan de voorwaarden verandert, en pas dan ook
   de versiedatum aan op drie plekken: voorwaarden/index.html,
   CONFIG.voorwaardenVersie in assets/site.js, en VOORWAARDEN_VERSIE in
   worker/aanvragen.js. Lopen die uiteen, dan weigert de tussenlaag aanvragen.
   ========================================================================= */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Playwright hoeft niet in dit project te staan; een globale installatie is
   genoeg. Staat hij ergens anders, wijs er dan naar met PLAYWRIGHT_PAD. */
const pw = await import(process.env.PLAYWRIGHT_PAD || 'playwright')
  .catch(() => {
    console.error('Playwright niet gevonden. Installeer hem (npm i -D playwright) of\n' +
                  'zet PLAYWRIGHT_PAD op het pad naar de globale installatie, bijvoorbeeld:\n' +
                  '  PLAYWRIGHT_PAD=/usr/lib/node_modules/playwright/index.js node ' +
                  'scripts/maak-voorwaarden-pdf.mjs http://127.0.0.1:8080');
    process.exit(1);
  });
/* Een globale installatie komt binnen als CommonJS; dan zit alles in .default. */
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const basis = process.argv[2] || 'http://127.0.0.1:8080';
const uit = join(dirname(fileURLToPath(import.meta.url)), '..', 'voorwaarden',
                 'algemene-voorwaarden-schaap-logistics.pdf');

const browser = await chromium.launch();
const pagina = await browser.newPage();
await pagina.goto(basis + '/voorwaarden/', { waitUntil: 'networkidle' });

/* De menubalk, de voettekst en de downloadknop horen niet in een PDF: die
   verwijzen naar dingen waar je op papier niet op kunt klikken. */
await pagina.addStyleTag({ content: `
  header, footer, .vw-versie__pdf { display: none !important; }
  .section { padding-top: 0 !important; }
  body { background: #fff; }
` });

await pagina.pdf({
  path: uit,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size:8px;color:#6f7c94;width:100%;padding:0 16mm">' +
                  'Schaap Logistics &mdash; algemene voorwaarden</div>',
  footerTemplate: '<div style="font-size:8px;color:#6f7c94;width:100%;padding:0 16mm;text-align:right">' +
                  'Pagina <span class="pageNumber"></span> van <span class="totalPages"></span></div>'
});

await browser.close();
console.log('Geschreven: ' + uit);
