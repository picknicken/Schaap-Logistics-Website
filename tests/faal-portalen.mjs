/* =========================================================================
   Faaltest van de twee portalen in een echte browser.

   Hier doen we alsof de tussenlaag is overgenomen of gewoon kapot is. Wat de
   Worker terugstuurt is voor het portaal een gegeven; de vraag is wat het
   portaal ermee doet als dat gegeven niet deugt. Script in een klantnaam, een
   javascript:-adres bij een foto, een veld dat er niet is, een tekst van
   honderdduizend tekens, en een geheugen van de telefoon vol rommel.
   ========================================================================= */
/* Playwright staat meestal globaal geinstalleerd en niet in dit project.
   Wijs er zo nodig naar met PLAYWRIGHT_PAD, net als bij het script dat de
   voorwaarden-PDF maakt. */
const PW = process.env.PLAYWRIGHT_PAD ||
  '/opt/node22/lib/node_modules/playwright/index.js';
const pw = (await import(PW)).default;
const { chromium } = pw;
const BASIS = process.env.SITE_ADRES || 'http://127.0.0.1:8097';
const WORKER = 'https://schaap-portaal.rt5twh6n7h.workers.dev';

let fouten = 0;
const keur = (naam, goed, extra) => {
  if (goed) { console.log('  ok   ' + naam); }
  else { fouten++; console.log('  FOUT ' + naam + (extra !== undefined ? ' -> ' + String(extra).slice(0, 300) : '')); }
};

const b = await chromium.launch();
const XSS = '<img src=x onerror="window.__geraakt=1">';
const JS  = 'javascript:window.__geraakt=1';

/* Een venster met een eigen antwoord van de tussenlaag. Alles wat het portaal
   binnenkrijgt komt hiervandaan, dus dit is precies de plek om te liegen. */
async function opent(antwoord, { pad = '/portaal/', code = 'test-code-123',
                                 vooraf } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 },
    locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', hasTouch: true });
  const p = await ctx.newPage();
  const stuk = [];
  p.on('pageerror', (e) => stuk.push(String(e)));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('401') && !t.includes('422')) {
      stuk.push('console: ' + t);
    }
  });
  let popup = false;
  p.on('dialog', async (d) => { popup = true; await d.dismiss(); });

  await p.route(WORKER + '/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: typeof antwoord === 'string' ? antwoord : JSON.stringify(antwoord) }));

  if (vooraf) { await p.addInitScript(vooraf); }
  await p.goto(BASIS + pad, { waitUntil: 'domcontentloaded' });
  await p.click('#zetop-weg').catch(() => {});
  await p.fill('#slot-code', code);
  await p.click('#slot-form button');
  await p.waitForSelector('#app:not([hidden])', { timeout: 8000 }).catch(() => {});
  return { ctx, p, stuk, geraakt: () => p.evaluate(() => !!window.__geraakt),
           popup: () => popup };
}

const dag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' })
  .format(new Date());

console.log('\n=== het chauffeursportaal met vijandige gegevens ===');

console.log('\nscript in elk veld dat op het scherm komt');
{
  const rit = {
    /* Uitgevoerd en afgetekend, anders tekent het portaal de krabbel en de
       foto's helemaal niet en slaagt de proef omdat er niets stond. */
    id: 'recAAAAAAAAAAAAAA', naam: XSS, datum: dag, type: XSS, status: 'Uitgevoerd',
    handtekening: true, getekendOp: new Date().toISOString(),
    ophaal: XSS, aflever: XSS, km: 10, stops: 0, tijdvak: XSS, tijd: XSS,
    klant: XSS, telefoon: XSS, contact: XSS, contactTel: XSS, opmerking: XSS,
    bedrag: 100, kortingRe: XSS, getekend: XSS, krabbel: JS,
    fotos: [{ naam: XSS, url: JS, klein: JS }]
  };
  const { ctx, p, stuk, geraakt, popup } = await opent({
    ok: true, dag, ritten: [rit], aanvragen: [{ id: 'recQQQQQQQQQQQQQQ', naam: XSS,
      bedrijf: XSS, contact: XSS, telefoon: XSS, email: XSS, opmerking: XSS,
      status: 'Nieuw', dienst: XSS, ophaal: XSS, aflever: XSS }],
    opdrachten: [], klanten: [{ id: 'recKKKKKKKKKKKKKK', naam: XSS, nummer: 1,
      adres: XSS, email: XSS, telefoon: XSS, soort: 'Vaste klant', ritten: 1 }],
    rol: 'Eigenaar'
  });

  keur('er springt geen venster open', !popup());
  keur('en er wordt geen script uitgevoerd', !(await geraakt()));
  keur('de ritkaart staat er gewoon', (await p.locator('#lijst .rit').count()) > 0);
  keur('en de krabbel en de foto worden werkelijk getekend',
    (await p.locator('#lijst .rit .fotos a').count()) > 0,
    'fotolinks: ' + (await p.locator('#lijst .rit .fotos a').count()));
  keur('de tekst staat er als tekst, niet als element',
    (await p.locator('#lijst .rit').first().textContent()).includes('<img'));
  keur('er staat geen img uit de gegevens in de pagina',
    (await p.locator('img[src="x"]').count()) === 0);

  /* Adressen die uit de gegevens komen mogen nooit javascript: worden. */
  const hrefs = await p.$$eval('a[href]', (l) => l.map((a) => a.getAttribute('href')));
  const srcs = await p.$$eval('img[src]', (l) => l.map((i) => i.getAttribute('src')));
  keur('geen enkel adres op de pagina begint met javascript:',
    !hrefs.some((h) => /^\s*javascript:/i.test(h || '')), hrefs.filter((h) => /javascript/i.test(h || '')).join(' '));
  keur('en geen enkele afbeelding ook niet',
    !srcs.some((s) => /^\s*javascript:/i.test(s || '')), srcs.filter((s) => /javascript/i.test(s || '')).join(' '));

  await p.click('#tab-aanvragen');
  await p.waitForTimeout(200);
  keur('de aanvragen ook niet stuk', !(await geraakt()) && !popup());
  await p.click('#tab-klanten');
  await p.waitForTimeout(200);
  keur('de klanten ook niet', !(await geraakt()) && !popup());

  keur('geen javascriptfouten', stuk.length === 0, stuk.join(' | '));
  await ctx.close();
}

console.log('\nvelden die er niet zijn, of het verkeerde type hebben');
{
  const gek = [
    [{ ok: true, dag, ritten: [{}], aanvragen: [], opdrachten: [], klanten: [] },
     'een rit zonder enig veld'],
    [{ ok: true, dag, ritten: [{ id: 1, naam: null, status: null, km: 'veel',
       fotos: 'geen lijst', datum: 42 }], aanvragen: [], opdrachten: [], klanten: [] },
     'een rit met verkeerde types'],
    [{ ok: true, dag, ritten: null, aanvragen: null, opdrachten: null, klanten: null },
     'lijsten die null zijn'],
    [{ ok: true, dag, ritten: 'geen lijst', aanvragen: {}, opdrachten: 7, klanten: true },
     'lijsten die geen lijst zijn'],
    [{ ok: true }, 'een antwoord zonder enige lijst'],
    [{ ok: true, dag, ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag,
       status: 'Bestaatniet', km: 10 }], aanvragen: [], opdrachten: [], klanten: [] },
     'een status die niet bestaat']
  ];
  for (const [antwoord, wat] of gek) {
    const { ctx, p, stuk } = await opent(antwoord);
    const open = await p.isVisible('#app').catch(() => false);
    keur(wat + ' laat het portaal open', open, 'app zichtbaar: ' + open);
    keur(wat + ' levert geen javascriptfout op', stuk.length === 0, stuk.join(' | '));
    await ctx.close();
  }
}

console.log('\neen antwoord dat helemaal geen antwoord is');
{
  for (const [lading, wat] of [
    ['<html>fout 502</html>', 'html in plaats van json'],
    ['', 'een leeg antwoord'],
    ['{"ok":true,', 'afgebroken json'],
    ['null', 'de letterlijke null'],
    ['[]', 'een lijst']
  ]) {
    const { ctx, p, stuk } = await opent(lading);
    const melding = await p.textContent('#slot-melding').catch(() => '');
    const open = await p.isVisible('#app').catch(() => false);
    keur(wat + ' geeft een leesbare melding of een open portaal',
      (melding && melding.trim().length > 0) || open,
      'melding "' + melding + '", app ' + open);
    keur(wat + ' laat niets stukvallen',
      !stuk.some((s) => /TypeError|ReferenceError/.test(s)), stuk.join(' | '));
    await ctx.close();
  }
}

console.log('\neen tekst van honderdduizend tekens');
{
  const lang = 'A'.repeat(100000);
  const { ctx, p, stuk } = await opent({ ok: true, dag, aanvragen: [], opdrachten: [],
    klanten: [], ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: lang, datum: dag,
      status: 'Gepland', ophaal: lang, aflever: lang, opmerking: lang, km: 10 }] });
  keur('het portaal opent nog', await p.isVisible('#app'));
  const breed = await p.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 2);
  keur('en de pagina schuift niet zijwaarts weg', breed,
    await p.evaluate(() => document.documentElement.scrollWidth + ' tegen ' + window.innerWidth));
  keur('geen javascriptfouten', stuk.length === 0, stuk.join(' | '));
  await ctx.close();
}

console.log('\nhet geheugen van de telefoon vol rommel');
{
  /* De echte sleutels, zoals ze bovenaan portaal/portaal.js staan: de
     wachtrij heet sl-portaal-rij en het dagoverzicht sl-portaal-dag- met de
     datum erachter. Een proef op een verzonnen sleutel bewijst niets. */
  const rommel = [
    ['sl-portaal-rij', 'geen json'],
    ['sl-portaal-rij', '{"niet":"een lijst"}'],
    ['sl-portaal-rij', '[{"actie":"onzin"},null,42,{"actie":"status"}]'],
    ['sl-portaal-rij', '[' + '{"actie":"status"},'.repeat(500).slice(0, -1) + ']'],
    ['sl-portaal-dag-' + dag, 'geen json'],
    ['sl-portaal-dag-' + dag, '[]'],
    ['sl-portaal-dag-' + dag, '{"ritten":"geen lijst"}'],
    ['sl-portaal-dag-' + dag, '{"ritten":[{}],"tijd":"onzin"}']
  ];
  for (const [sleutel, waarde] of rommel) {
    const { ctx, p, stuk } = await opent(
      { ok: true, dag, ritten: [], aanvragen: [], opdrachten: [], klanten: [] },
      { vooraf: `try { localStorage.setItem(${JSON.stringify(sleutel)}, ${JSON.stringify(waarde)}); } catch (e) {}` });
    const open = await p.isVisible('#app').catch(() => false);
    keur(sleutel + ' met "' + waarde.slice(0, 20) + '" laat het portaal open', open);
    keur('en levert geen javascriptfout op', stuk.length === 0, stuk.join(' | '));
    await ctx.close();
  }

  /* localStorage helemaal dicht — privémodus, of de gebruiker heeft opslag
     uitgezet. Het portaal hoort dan gewoon te werken, alleen zonder geheugen. */
  const { ctx, p, stuk } = await opent(
    { ok: true, dag, ritten: [], aanvragen: [], opdrachten: [], klanten: [] },
    { vooraf: `Object.defineProperty(window, 'localStorage', {
        get() { throw new Error('opslag staat uit'); } });` });
  keur('met opslag die helemaal weigert opent het portaal ook',
    await p.isVisible('#app').catch(() => false));
  keur('en zonder javascriptfout', stuk.length === 0, stuk.join(' | '));
  await ctx.close();
}

console.log('\n=== het klantportaal met vijandige gegevens ===');
{
  const { ctx, p, stuk, geraakt, popup } = await opent({
    ok: true, klant: { naam: XSS, nummer: XSS },
    ritten: [{ datum: dag, type: XSS, status: 'Onderweg', sleutel: 'aaaaaaaabbbbbbbb',
      magAnnuleren: true, geannuleerdOp: '', ophaal: XSS, aflever: XSS, km: 10,
      tijd: XSS, bedrag: 100, getekend: XSS, getekendOp: XSS, afgeleverd: true,
      bevestigdOp: '', onderwegOp: new Date().toISOString(), krabbel: JS,
      fotos: [{ naam: XSS, url: JS, klein: JS }] }],
    facturen: [{ nummer: XSS, datum: dag, vervalt: dag, totaal: 100, betaald: 0,
      openstaand: 100, status: XSS, link: JS, pdf: JS }]
  }, { pad: '/klant/', code: 'abcdef-ghijkl-mnopqr-stuvwx' });

  keur('er springt geen venster open', !popup());
  keur('en er wordt geen script uitgevoerd', !(await geraakt()));
  keur('de zendingen staan er', (await p.locator('.kaart').count()) > 0);

  const hrefs = await p.$$eval('a[href]', (l) => l.map((a) => a.getAttribute('href')));
  keur('geen adres op de pagina begint met javascript:',
    !hrefs.some((h) => /^\s*javascript:/i.test(h || '')),
    hrefs.filter((h) => /javascript/i.test(h || '')).join(' '));

  await p.click('#tab-facturen');
  await p.waitForTimeout(200);
  const fhrefs = await p.$$eval('a[href]', (l) => l.map((a) => a.getAttribute('href')));
  keur('ook niet bij de facturen',
    !fhrefs.some((h) => /^\s*javascript:/i.test(h || '')),
    fhrefs.filter((h) => /javascript/i.test(h || '')).join(' '));
  keur('en er wordt nog steeds geen script uitgevoerd', !(await geraakt()));
  keur('geen javascriptfouten', stuk.length === 0, stuk.join(' | '));
  await ctx.close();
}

console.log('\nhet klantportaal met kapotte gegevens');
{
  for (const [antwoord, wat] of [
    [{ ok: true, klant: null, ritten: [{}], facturen: [{}] }, 'lege zending en factuur'],
    [{ ok: true, klant: {}, ritten: null, facturen: null }, 'lijsten die null zijn'],
    [{ ok: true, klant: {}, ritten: 'x', facturen: 7 }, 'lijsten die geen lijst zijn'],
    [{ ok: true }, 'een antwoord zonder lijsten'],
    [{ ok: true, klant: {}, facturen: [], ritten: [{ datum: 'onzin', km: 'veel',
       tijd: 'kwart over', status: 'Gepland', sleutel: 'x' }] }, 'onleesbare datums']
  ]) {
    const { ctx, p, stuk } = await opent(antwoord,
      { pad: '/klant/', code: 'abcdef-ghijkl-mnopqr-stuvwx' });
    const open = await p.isVisible('#app').catch(() => false);
    keur(wat + ' laat het klantportaal open', open);
    keur(wat + ' levert geen javascriptfout op', stuk.length === 0, stuk.join(' | '));
    await ctx.close();
  }
}

console.log(fouten ? '\n' + fouten + ' fout(en)\n' : '\nalles goed\n');
await b.close();
process.exit(fouten ? 1 : 0);
