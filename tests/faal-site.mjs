/* =========================================================================
   Faaltest van de website en de factuurpagina.

   De factuurpagina is bijzonder: alles wat erop staat komt uit de adresregel.
   Dat betekent dat iedereen die een link kan maken, kan bepalen wat er op een
   factuur van Schaap Express Transport lijkt te staan. Wat kan daar dan uit
   komen — script, onzinbedragen, een negatief totaal dat er echt uitziet?
   ========================================================================= */
/* Playwright staat meestal globaal geinstalleerd en niet in dit project.
   Wijs er zo nodig naar met PLAYWRIGHT_PAD, net als bij het script dat de
   voorwaarden-PDF maakt. */
const PW = process.env.PLAYWRIGHT_PAD ||
  '/opt/node22/lib/node_modules/playwright/index.js';
const pw = (await import(PW)).default;
const { chromium } = pw;
const BASIS = process.env.SITE_ADRES || 'http://127.0.0.1:8097';

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1000, height: 1200 }, locale: 'nl-NL',
  timezoneId: 'Europe/Amsterdam' });
const p = await ctx.newPage();

let stuk = [];
p.on('pageerror', (e) => stuk.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') { stuk.push('console: ' + m.text()); } });
let popup = false;
p.on('dialog', async (d) => { popup = true; await d.dismiss(); });

const bedrag = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace('.', '').replace(',', '.'));

console.log('\n=== de factuurpagina met vijandige adresregels ===');

console.log('\nscript in de adresregel');
{
  const kwaad = '<img src=x onerror=alert(1)>';
  const q = new URLSearchParams({
    nr: kwaad, klant: kwaad, adres: kwaad, van: kwaad, naar: kwaad,
    oms: kwaad, ref: kwaad, opdracht: kwaad, debiteur: kwaad, klantbtw: kwaad,
    kortingoms: kwaad, toeslagoms: kwaad, tijdvak: kwaad, creditreden: kwaad,
    km: '10', kmtarief: '2', start: '75'
  });
  stuk = []; popup = false;
  await p.goto(BASIS + '/factuur/?' + q.toString(), { waitUntil: 'networkidle' });
  keur('er springt geen venster open', !popup);
  keur('er staat geen img-element in de factuur',
    (await p.locator('.vel img[src="x"]').count()) === 0);
  keur('de tekst staat er wel, als tekst',
    (await p.textContent('#v-nr')).includes('<img'), await p.textContent('#v-nr'));
  keur('geen javascriptfouten', stuk.length === 0, stuk.join(' | '));

  /* Een scriptblok en een sluitende tag: het klassieke geval waar innerHTML
     op struikelt. */
  stuk = []; popup = false;
  await p.goto(BASIS + '/factuur/?klant=' +
    encodeURIComponent('</p><script>alert(2)</scr' + 'ipt><p>') +
    '&km=10&kmtarief=2&start=75', { waitUntil: 'networkidle' });
  keur('een scriptblok wordt niet uitgevoerd', !popup);
  keur('en er staat geen script-element in de pagina',
    (await p.locator('.vel script').count()) === 0);
}

console.log('\nonzinbedragen');
{
  const proeven = [
    ['km=-500&kmtarief=2&start=75', 'negatieve kilometers'],
    ['km=1e400&kmtarief=2&start=75', 'oneindig veel kilometers'],
    ['km=abc&kmtarief=xyz&start=qqq', 'letters in plaats van getallen'],
    ['km=10&kmtarief=-99&start=-99', 'negatieve tarieven'],
    ['km=10&kmtarief=2&start=75&korting=999999', 'een korting groter dan de rit'],
    ['km=10&kmtarief=2&start=75&stops=-5&stoptarief=25', 'negatieve stops'],
    ['km=10&kmtarief=2&start=75&minimum=-1000', 'een negatief minimum'],
    ['km=99999999&kmtarief=99999&start=99999', 'astronomische bedragen']
  ];
  for (const [zoek, wat] of proeven) {
    stuk = [];
    await p.goto(BASIS + '/factuur/?' + zoek, { waitUntil: 'networkidle' });
    const totaal = await p.textContent('#v-totaal');
    const sub = await p.textContent('#v-subtotaal');
    const btw = await p.textContent('#v-btw');
    keur(wat + ' geeft geen NaN of Infinity op papier',
      !/NaN|Infinity|undefined|e\+/i.test(totaal + sub + btw), totaal + ' / ' + sub);
    keur(wat + ' laat de pagina niet omvallen', stuk.length === 0, stuk.join(' | '));
  }

  /* De btw hoort altijd op te tellen tot het totaal. Dat is de enige som die
     op een factuur echt moet kloppen. */
  await p.goto(BASIS + '/factuur/?km=137&kmtarief=1.5&start=100&stops=3&stoptarief=25' +
    '&tijdtoeslag=41.25&tijdvak=Avondrit&wacht=40&wachttoeslag=30&toeslag=12.35' +
    '&toeslagoms=Tol&korting=17.5&kortingoms=Coulance', { waitUntil: 'networkidle' });
  const sub = bedrag(await p.textContent('#v-subtotaal'));
  const btw = bedrag(await p.textContent('#v-btw'));
  const tot = bedrag(await p.textContent('#v-totaal'));
  keur('subtotaal plus btw is precies het totaal',
    Math.abs(sub + btw - tot) < 0.005, sub + ' + ' + btw + ' = ' + tot);
  keur('de btw is precies 21% van het subtotaal',
    Math.abs(btw - Math.round(sub * 21) / 100) < 0.005, btw + ' tegen ' + (sub * 0.21));

  /* En de regels moeten optellen tot het subtotaal. Een factuur waarvan de
     regels niet optellen is een factuur waar een klant op wijst. */
  const regels = await p.$$eval('#regels tr', (rijen) => rijen.map((r) =>
    r.children[r.children.length - 1].textContent));
  const som = regels.reduce((t, r) =>
    t + Number(String(r).replace(/[^\d,-]/g, '').replace('.', '').replace(',', '.')), 0);
  keur('de regels tellen op tot het subtotaal',
    Math.abs(som - sub) < 0.005, som + ' tegen ' + sub);

  /* En ze horen in de volgorde te staan waarin de prijs is opgebouwd: eerst
     het vaste starttarief, dan de kilometers, dan pas de toeslagen. Een
     factuur die met de kilometers begint leest alsof je halverwege de som
     instapt — daar vroeg Shane naar. */
  const omschrijvingen = await p.$$eval('#regels tr',
    (rijen) => rijen.map((r) => (r.children[1] || r.children[0]).textContent.trim()));
  const nStart = omschrijvingen.findIndex((t) => /Starttarief/.test(t));
  const nKm = omschrijvingen.findIndex((t) => /Transport/.test(t));
  const nStop = omschrijvingen.findIndex((t) => /Extra stop/.test(t));
  const nTijd = omschrijvingen.findIndex((t) => /Toeslag/.test(t));
  keur('het starttarief staat als eerste regel', nStart === 0,
    omschrijvingen.join(' | '));
  keur('de kilometers staan daar direct onder', nKm === nStart + 1,
    omschrijvingen.join(' | '));
  keur('en de toeslagen komen daarna', nStop > nKm && nTijd > nStop,
    omschrijvingen.join(' | '));
}

console.log('\nhet factuurnummer en waar de klant het moet vermelden');
{
  /* Een echte factuur: het nummer hoort op alle drie de plekken hetzelfde te
     staan. Lopen ze uiteen, dan betaalt de klant onder een ander kenmerk dan
     er in de boekhouding staat, en dan sluit de aflettering niet. */
  await p.goto(BASIS + '/factuur/?nr=SL-2026-0042&km=100&kmtarief=1.5&start=75',
    { waitUntil: 'networkidle' });
  const boven = (await p.textContent('#v-nr')).trim();
  keur('het factuurnummer staat bovenaan', boven === 'SL-2026-0042', boven);
  keur('en het label heet Factuurnr.',
    (await p.textContent('#v-nrlabel')).trim() === 'Factuurnr.',
    await p.textContent('#v-nrlabel'));

  const betaalzin = (await p.textContent('#v-betaalzin')).replace(/\s+/g, ' ');
  keur('de betaalzin noemt het nummer zelf en niet alleen "het factuurnummer"',
    betaalzin.includes('SL-2026-0042'), betaalzin);
  keur('en vraagt om het te vermelden',
    /vermelding van factuurnummer/i.test(betaalzin), betaalzin);

  /* En nog een keer bij de betaalgegevens: daar staat iemand het rekeningnummer
     over te tikken, en dan is dát de plek waar de omschrijving hoort. */
  keur('bij de betaalgegevens staat het er ook',
    await p.isVisible('#v-kenmerkregel'));
  keur('met hetzelfde nummer',
    (await p.textContent('#v-betaalnr2')).trim() === 'SL-2026-0042',
    await p.textContent('#v-betaalnr2'));

  /* Een concept heeft geen nummer maar wel een kenmerk. Een doorlopende
     nummering mag geen gaten hebben, dus een concept dat nooit een factuur
     wordt mag er geen opsouperen. */
  await p.goto(BASIS + '/factuur/?concept=1&kenmerk=CONCEPT-RIT-7&km=100' +
    '&kmtarief=1.5&start=75', { waitUntil: 'networkidle' });
  keur('een concept toont een kenmerk',
    (await p.textContent('#v-nr')).trim() === 'CONCEPT-RIT-7',
    await p.textContent('#v-nr'));
  keur('en noemt dat ook zo', (await p.textContent('#v-nrlabel')).trim() === 'Kenmerk',
    await p.textContent('#v-nrlabel'));
  keur('een concept vraagt niet om te betalen',
    !(await p.isVisible('#v-betaalzin')));
  keur('en zet er ook geen betaalkenmerk bij',
    !(await p.isVisible('#v-kenmerkregel')));
  const balk = (await p.textContent('#conceptbalk')).replace(/\s+/g, ' ');
  keur('de conceptbalk legt uit wanneer het nummer er wel komt',
    /factuurnummer/i.test(balk) && /vermeld/i.test(balk), balk.slice(0, 200));

  /* Zonder kenmerk in de adresregel valt hij terug op de datum: een vel zonder
     enig kenmerk is een vel waarvan niemand weet welk het is. */
  await p.goto(BASIS + '/factuur/?concept=1&ritdatum=2026-09-15&km=10' +
    '&kmtarief=1.5&start=75', { waitUntil: 'networkidle' });
  keur('zonder kenmerk komt er een uit de datum',
    (await p.textContent('#v-nr')).trim() === 'CONCEPT-20260915',
    await p.textContent('#v-nr'));

  /* Een creditnota vraagt niets, dus hoort er ook geen betaalkenmerk op. */
  await p.goto(BASIS + '/factuur/?credit=1&nr=SL-2026-0043&creditvan=SL-2026-0042' +
    '&km=10&kmtarief=1.5&start=75', { waitUntil: 'networkidle' });
  keur('een creditnota vraagt geen betaling onder vermelding van iets',
    !(await p.isVisible('#v-kenmerkregel')));
}

console.log('\nde offerte en het concept door elkaar');
{
  await p.goto(BASIS + '/factuur/?offerte=1&credit=1&concept=1&km=10&kmtarief=2&start=75' +
    '&creditvan=SL-1&creditbedrag=50', { waitUntil: 'networkidle' });
  const titel = await p.textContent('#v-titel');
  keur('alle drie tegelijk levert een van de drie op, geen mengsel',
    ['Offerte', 'Creditfactuur', 'Conceptfactuur'].includes(titel), titel);
  keur('en er wordt in geen geval om betaling gevraagd',
    !(await p.locator('#v-betaalzin').isVisible()));

  await p.goto(BASIS + '/factuur/?offerte=1&geldig=-5&km=10&kmtarief=2&start=75',
    { waitUntil: 'networkidle' });
  keur('een negatieve geldigheid geeft geen datum in het verleden',
    !/^\d{2}-\d{2}-\d{4}$/.test(await p.textContent('#v-geldig')) ||
    new Date((await p.textContent('#v-geldig')).split('-').reverse().join('-')) >= new Date(Date.now() - 86400000),
    await p.textContent('#v-geldig'));

  await p.goto(BASIS + '/factuur/?offerte=1&geldig=99999&km=10&kmtarief=2&start=75',
    { waitUntil: 'networkidle' });
  keur('een geldigheid van 99999 dagen geeft nog steeds een leesbare datum',
    /^\d{2}-\d{2}-\d{4,6}$/.test(await p.textContent('#v-geldig')),
    await p.textContent('#v-geldig'));

  await p.goto(BASIS + '/factuur/?offerte=1&datum=onzin&km=10&kmtarief=2&start=75',
    { waitUntil: 'networkidle' });
  keur('een onleesbare datum geeft geen "NaN-NaN-NaN"',
    !/NaN/.test(await p.textContent('#v-geldig')), await p.textContent('#v-geldig'));
  keur('en geen "Invalid Date"',
    !/Invalid/.test(await p.textContent('#v-geldig')), await p.textContent('#v-geldig'));
}

console.log('\nde beheerstrook lekt niet naar de klant');
{
  await p.goto(BASIS + '/factuur/?nr=SL-1&km=10&kmtarief=2&start=75',
    { waitUntil: 'networkidle' });
  keur('zonder beheer=1 staat de PDF-uitleg er niet',
    !(await p.locator('#balk').isVisible()));
  await p.goto(BASIS + '/factuur/?nr=SL-1&beheer=0&km=10&kmtarief=2&start=75',
    { waitUntil: 'networkidle' });
  keur('en met beheer=0 ook niet', !(await p.locator('#balk').isVisible()));
  await p.goto(BASIS + '/factuur/?nr=SL-1&beheer=ja&km=10&kmtarief=2&start=75',
    { waitUntil: 'networkidle' });
  keur('en met beheer=ja ook niet', !(await p.locator('#balk').isVisible()));
}

console.log('\n=== de rekenmachine op de homepage ===');
{
  stuk = [];
  await p.goto(BASIS + '/', { waitUntil: 'networkidle' });
  /* Rechtstreeks in het veld zetten en zelf een input-gebeurtenis afvuren.
     Typen kan niet: een veld van het type number weigert letters, en dat is
     op zich al een slot. Maar plakken, een oude browser en een pagina die
     zichzelf invult komen wel langs dit pad. */
  const zetKm = async (w) => {
    await p.evaluate((waarde) => {
      const veld = document.getElementById('kmInput');
      veld.value = waarde;
      veld.dispatchEvent(new Event('input', { bubbles: true }));
      veld.dispatchEvent(new Event('blur', { bubbles: true }));
    }, String(w));
    await p.waitForTimeout(80);
    return (await p.textContent('#rowTotal')) + ' / ' + (await p.textContent('#rowVat'));
  };
  for (const w of ['-100', '0', '999999999', 'abc', '1e400', '1,5', '  ', '0.0000001']) {
    const uit = await zetKm(w);
    keur('km = "' + w + '" geeft geen onzin',
      !/NaN|Infinity|undefined|e\+/i.test(uit), uit);
  }

  /* De postcodevelden. Daar mag alles in, en er hoort nooit iets uit te
     komen dat op een prijs lijkt terwijl het dat niet is. */
  for (const [van, naar, wat] of [
    ['0000', '9999', 'postcodes die niet bestaan'],
    ['<script>', '<script>', 'script in het postcodeveld'],
    ['3011', '', 'maar een van de twee'],
    ['99999999', '3011', 'een veel te lang getal'],
    ['3011 AA', '5611 AB', 'gewone postcodes met letters']
  ]) {
    await p.fill('#pcVan', van);
    await p.fill('#pcNaar', naar);
    await p.waitForTimeout(120);
    const melding = await p.textContent('#pcStatus');
    keur(wat + ' geeft een leesbare melding',
      melding.trim().length > 0 && !/NaN|undefined/.test(melding), melding);
  }
  keur('de rekenmachine valt nergens om', stuk.length === 0, stuk.join(' | '));

  /* De knop naar het aanvraagformulier draagt de keuzes mee. Daar mag geen
     script in kunnen sluipen. */
  await p.fill('#pcVan', '"><img src=x onerror=alert(3)>');
  await p.waitForTimeout(120);
  const href = await p.getAttribute('#calcCta', 'href');
  keur('de knop naar het formulier bevat geen ruwe tekens',
    !/[<>"]/.test(href || ''), href);
}

console.log('\n=== het aanvraagformulier ===');
{
  stuk = []; popup = false;
  await p.goto(BASIS + '/aanvragen/?dienst=<script>alert(4)</script>&tijd=x&stops=-9' +
    '&van=' + encodeURIComponent('"><img src=x onerror=alert(5)>') + '&naar=99',
    { waitUntil: 'networkidle' });
  keur('een vijandige adresregel opent geen venster', !popup);
  keur('en zet geen img in de pagina',
    (await p.locator('main img[src="x"]').count()) === 0);
  keur('het formulier staat er gewoon', await p.isVisible('#r-bedrijf'));
  keur('geen javascriptfouten', stuk.length === 0, stuk.join(' | '));

  /* Versturen zonder iets in te vullen hoort niet stil te mislukken. */
  await p.goto(BASIS + '/aanvragen/', { waitUntil: 'networkidle' });
  const knoppen = await p.locator('button').count();
  keur('er zijn knoppen om mee verder te gaan', knoppen > 0);
}

console.log('\n=== pagina’s die er niet zijn ===');
{
  const res = await p.goto(BASIS + '/bestaatniet/', { waitUntil: 'domcontentloaded' });
  keur('een onbekend adres geeft 404 of de 404-pagina',
    res.status() === 404 || (await p.title()).length > 0, res.status());
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
await b.close();
process.exit(fouten ? 1 : 0);
