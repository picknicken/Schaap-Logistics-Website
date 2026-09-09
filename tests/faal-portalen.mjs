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

  const naarTab = async (naam) => {
    await p.click('#tabmenu-knop');
    await p.click('#tabmenu button:has-text("' + naam + '")');
    await p.waitForTimeout(200);
  };
  await naarTab('Aanvragen');
  keur('de aanvragen ook niet stuk', !(await geraakt()) && !popup());
  await naarTab('Klanten');
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
     'een status die niet bestaat'],
    /* Het wijzigverzoek van een klant. Deze velden zijn tekst, maar het blok
       roept er toLowerCase() op aan — en dat bestaat niet op een getal. Eén
       verkeerd type en de hele ritkaart valt weg. */
    [{ ok: true, dag, ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag,
       status: 'Gepland', km: 10, wijzigStand: 42, wijzigSoort: 7,
       wijzigverzoek: { niet: 'tekst' }, wijzigOp: 'gisteren' }],
      aanvragen: [], opdrachten: [], klanten: [] },
     'een wijzigverzoek met verkeerde types'],
    [{ ok: true, dag, ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag,
       status: 'Gepland', km: 10, wijzigStand: 'Open',
       wijzigverzoek: XSS, wijzigSoort: XSS }],
      aanvragen: [], opdrachten: [], klanten: [] },
     'script in een wijzigverzoek'],
    /* Ingelogd als eigenaar. Zonder dit blijft `ik` leeg, en dan slaat het
       portaal elke tak over die alleen voor de eigenaar bedoeld is — de
       verwijderknop bijvoorbeeld. Precies daar zat een fout die geen enkele
       proef zag: hij stond hoger in de functie dan waar de knoppenrij wordt
       aangemaakt, en gaf 'undefined is not an object' bij het tekenen van
       elke rit. De proeven bleven groen omdat die regel nooit werd bereikt. */
    [{ ok: true, dag, ik: { rol: 'Eigenaar', naam: 'Eigenaar' },
       ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag,
         status: 'Gepland', km: 10, klant: 'Klant BV', ophaal: 'A', aflever: 'B' }],
       aanvragen: [], opdrachten: [], klanten: [] },
     'ingelogd als eigenaar'],
    [{ ok: true, dag, ik: { rol: 'Eigenaar', naam: 'Eigenaar' },
       ritten: [
         { id: 'recAAAAAAAAAAAAAA', naam: 'A', datum: dag, status: 'Gepland', km: 10 },
         { id: 'recBBBBBBBBBBBBBB', naam: 'B', datum: dag, status: 'Onderweg', km: 20,
           chauffeur: 'Piet' },
         { id: 'recCCCCCCCCCCCCCC', naam: 'C', datum: dag, status: 'Uitgevoerd', km: 30,
           klant: 'K', handtekening: '' },
         { id: 'recDDDDDDDDDDDDDD', naam: 'D', datum: dag, status: 'Geannuleerd', km: 5 }
       ], aanvragen: [], opdrachten: [], klanten: [] },
     'als eigenaar met elke ritstatus'],
    [{ ok: true, dag, ik: { rol: 'Chauffeur', naam: 'Piet' },
       ritten: [
         { id: 'recAAAAAAAAAAAAAA', naam: 'vrij', datum: dag, status: 'Gepland', km: 10 },
         { id: 'recBBBBBBBBBBBBBB', naam: 'mijn', datum: dag, status: 'Gepland', km: 20,
           chauffeur: 'Piet' }
       ], aanvragen: [], opdrachten: [], klanten: [] },
     'als chauffeur met een vrije en een eigen rit']
  ];
  for (const [antwoord, wat] of gek) {
    const { ctx, p, stuk } = await opent(antwoord);
    const open = await p.isVisible('#app').catch(() => false);
    keur(wat + ' laat het portaal open', open, 'app zichtbaar: ' + open);
    keur(wat + ' levert geen javascriptfout op', stuk.length === 0, stuk.join(' | '));

    /* Kijken naar pageerror alleen is niet genoeg, en dat is hier op een
       vervelende manier gebleken. Een fout binnen het tekenen van de ritten
       valt in de .catch() van haalDag en komt als rode melding op het scherm —
       geen pageerror, dus de proef bleef groen terwijl het portaal in de
       praktijk een lege lijst met een foutmelding liet zien.

       Dus: staat er een melding, dan is dat een fout. En zijn er ritten
       meegestuurd, dan horen er ook kaarten te staan. */
    const melding = await p.evaluate(() => {
      const m = document.getElementById('app-melding');
      return m && !m.hidden ? (m.textContent || '').trim() : '';
    }).catch(() => '');
    keur(wat + ' geeft geen foutmelding op het scherm', melding === '', melding);

    /* Alleen de ritten van de dag die op het scherm staat. Het portaal toont
       één dag; een rit met een andere datum, of zonder datum, hoort er terecht
       niet te staan. Zonder dit onderscheid rekent de proef die eruit als een
       fout, en dan wijst hij naar iets dat juist goed gaat. */
    const verwacht = Array.isArray(antwoord.ritten)
      ? antwoord.ritten.filter((r) => r && r.datum === dag).length
      : 0;
    if (verwacht) {
      const kaarten = await p.locator('#lijst .rit').count().catch(() => 0);
      keur(wat + ' tekent de ' + verwacht + ' rit(ten) werkelijk',
        kaarten === verwacht, kaarten + ' kaarten');
    }
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

/* =========================================================================
   Welke knoppen er op een ritkaart horen te staan.

   Dit blok bestaat omdat er drie dingen doorheen zijn geglipt die niemand zag:
   de knop 'Ik rijd hem' bleef bij de eigenaar staan waar 'Onderweg' hoorde te
   komen (naarRit gaf het veld chauffeur niet mee, dus leek elke rit vrij), en
   het tijdvak toonde een toeslag van 15 euro terwijl de regel allang een
   percentage was.

   Kijken of het portaal openblijft is daarvoor niet genoeg. Je moet kijken
   welke knoppen er staan.
   ========================================================================= */
console.log('\n=== de knoppen op een ritkaart ===');
{
  const knoppenVan = async (p) => p.$$eval('#lijst .rit button, #lijst .rit a',
    (l) => l.map((k) => (k.textContent || '').trim()));

  /* Als eigenaar hoort een geplande rit gewoon op Onderweg te kunnen. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Eigenaar', naam: 'Eigenaar' },
      ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag, status: 'Gepland',
        km: 55, klant: 'K', ophaal: 'A', aflever: 'B' }],
      aanvragen: [], opdrachten: [], klanten: [] });
    const k = await knoppenVan(p);
    keur('de eigenaar kan een geplande rit op Onderweg zetten',
      k.some((t) => t === 'Onderweg'), k.join(' | '));
    /* En hij kan hem ook zelf claimen, zodat zijn naam erop komt in plaats van
       niemand. Beide knoppen dus: claimen hoeft niet om te kunnen vertrekken,
       maar het mag wel — een chauffeur moet weten wie er rijdt, en jijzelf
       later ook. */
    keur('en kan hem ook zelf claimen, met zijn naam erop',
      k.some((t) => /Ik rijd hem/.test(t)), k.join(' | '));
    await ctx.close();
  }

  /* Een chauffeur wél, bij een rit die nog vrij ligt. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Chauffeur', naam: 'Piet' },
      ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'vrij', datum: dag,
        status: 'Gepland', km: 20 }],
      aanvragen: [], opdrachten: [], klanten: [] });
    const k = await knoppenVan(p);
    keur('een chauffeur kan een vrije rit oppakken',
      k.some((t) => /Ik rijd hem/.test(t)), k.join(' | '));
    keur('en kan er nog niet mee vertrekken',
      !k.some((t) => t === 'Onderweg'), k.join(' | '));
    await ctx.close();
  }

  /* Staat de rit op zijn naam, dan is oppakken klaar en mag hij weg. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Chauffeur', naam: 'Piet' },
      ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'mijn', datum: dag,
        status: 'Gepland', km: 20, chauffeur: 'Piet' }],
      aanvragen: [], opdrachten: [], klanten: [] });
    const k = await knoppenVan(p);
    keur('een rit op zijn eigen naam kan wel op Onderweg',
      k.some((t) => t === 'Onderweg'), k.join(' | '));
    keur('en kan hij weer loslaten',
      k.some((t) => /Toch niet rijden/.test(t)), k.join(' | '));
    await ctx.close();
  }

  /* En het tijdvak: het label hoort de werkelijke toeslag te noemen. Stond er
     een vast bedrag ingetikt, dan gaat het bij de eerste tariefwijziging liegen
     en ga je een rekenfout zoeken die er niet is. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Eigenaar', naam: 'Eigenaar' },
      ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag, status: 'Gepland',
        km: 55, klant: 'K', tijdvak: 'Avondrit (18:00-23:00)' }],
      aanvragen: [], opdrachten: [], klanten: [] });
    const opties = await p.$$eval('#lijst .rit select option',
      (l) => l.map((o) => (o.textContent || '').trim()));
    const avond = opties.find((t) => /Avond/.test(t)) || '';
    keur('het tijdvak noemt een percentage en geen vast bedrag',
      /%/.test(avond) && !/\+ € 15\b/.test(avond), avond);
    keur('met de ondergrens erbij', /min\. € 25/.test(avond), avond);
    await ctx.close();
  }
}

/* =========================================================================
   Het menu. Er is geen schuifbalk meer, dus dit is de enige manier om van
   tabblad te wisselen — en daarmee is elke fout erin een portaal waar je
   vastzit op het tabblad waar je toevallig staat.

   Het moet dus alles tonen wat je mag zien, zeggen waar je nu bent, en
   werkelijk bovenop liggen: de dagbalk eronder plakt ook bovenaan en zou het
   anders overdekken.
   ========================================================================= */
console.log('\n=== het menu ===');
{
  const alsEigenaar = () => opent({ ok: true, dag,
    ik: { rol: 'Eigenaar', naam: 'Shane' },
    ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'R', datum: dag, status: 'Gepland',
      km: 55, klant: 'K' }],
    aanvragen: [{ id: 'recQQQQQQQQQQQQQQ', naam: 'A', datum: dag, status: 'Nieuw' },
                { id: 'recRRRRRRRRRRRRRR', naam: 'B', datum: dag, status: 'Nieuw' }],
    opdrachten: [], klanten: [] });

  {
    const { ctx, p } = await alsEigenaar();
    keur('de menuknop staat er voor de eigenaar',
      await p.isVisible('#tabmenu-knop'));
    keur('en het menu is dicht tot je erop drukt',
      !(await p.isVisible('#tabmenu')));

    await p.click('#tabmenu-knop');
    keur('drukken opent het menu', await p.isVisible('#tabmenu'));
    keur('en de knop zegt dat het openstaat',
      await p.getAttribute('#tabmenu-knop', 'aria-expanded') === 'true');

    const regels = await p.$$eval('#tabmenu button',
      (l) => l.map((k) => (k.textContent || '').trim()));
    /* Alle zeven, ook de drie die buiten de balk vallen. */
    ['Ritten', 'Aanvragen', 'Prijs', 'Planning', 'Meldingen', 'Klanten',
     'Chauffeurs'].forEach((naam) => {
      keur('het menu noemt ' + naam,
        regels.some((t) => t.indexOf(naam) === 0), regels.join(' | '));
    });
    keur('de teller van Aanvragen staat er ook in',
      regels.some((t) => /^Aanvragen/.test(t) && /2/.test(t)), regels.join(' | '));

    const nu = await p.$$eval('#tabmenu button[aria-current="true"]',
      (l) => l.map((k) => (k.textContent || '').trim()));
    keur('en het tabblad waar je nu bent is aangevinkt',
      nu.length === 1 && /^Ritten/.test(nu[0]), nu.join(' | '));

    /* Het menu moet ook echt aanraakbaar zijn. Klopt de stapeling niet, dan
       staat het er wel maar zit de dagbalk eroverheen en gebeurt er niets. */
    const bovenop = await p.evaluate(() => {
      const menu = document.getElementById('tabmenu');
      const knop = menu && menu.querySelector('button');
      if (!knop) { return 'geen knop'; }
      const r = knop.getBoundingClientRect();
      const raak = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return raak === knop || knop.contains(raak) ? true : (raak && raak.className) || 'niets';
    });
    keur('het open menu ligt bovenop en niet onder de dagbalk',
      bovenop === true, bovenop);
    await ctx.close();
  }

  /* Kiezen brengt je naar dat tabblad en ruimt het menu op. Blijft het staan,
     dan sta je op het nieuwe tabblad tegen een dichtgeklapt gordijn te kijken. */
  {
    const { ctx, p } = await alsEigenaar();
    await p.click('#tabmenu-knop');
    await p.click('#tabmenu button:has-text("Chauffeurs")');
    keur('kiezen sluit het menu', !(await p.isVisible('#tabmenu')));
    keur('en de balk zegt waar je nu bent',
      (await p.textContent('#tabbalk-nu')).trim() === 'Chauffeurs',
      await p.textContent('#tabbalk-nu'));
    keur('het paneel erbij staat open',
      await p.isVisible('#paneel-chauffeurs'));
    keur('en het oude paneel is weg',
      !(await p.isVisible('#paneel-ritten')));
    await ctx.close();
  }

  /* Ergens anders drukken hoort het menu te sluiten. */
  {
    const { ctx, p } = await alsEigenaar();
    await p.click('#tabmenu-knop');
    await p.click('body', { position: { x: 30, y: 700 } });
    keur('ergens anders drukken sluit het menu',
      !(await p.isVisible('#tabmenu')));
    await p.click('#tabmenu-knop');
    await p.keyboard.press('Escape');
    keur('Escape ook', !(await p.isVisible('#tabmenu')));
    await ctx.close();
  }

  /* Een chauffeur houdt Ritten en Prijs over. Twee is meer dan een, dus hij
     heeft het menu nodig: zonder balk is dit de enige manier om te wisselen. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Chauffeur', naam: 'Piet' },
      ritten: [{ id: 'recAAAAAAAAAAAAAA', naam: 'mijn', datum: dag,
        status: 'Gepland', km: 20, chauffeur: 'Piet' }],
      aanvragen: [], opdrachten: [], klanten: [] });
    keur('een chauffeur krijgt de menuknop ook', await p.isVisible('#tabmenu-knop'));
    await p.click('#tabmenu-knop');
    const regels = await p.$$eval('#tabmenu button',
      (l) => l.map((k) => (k.textContent || '').trim()));
    keur('met alleen wat hij mag zien',
      regels.length === 2 && /^Ritten/.test(regels[0]) && /^Prijs/.test(regels[1]),
      regels.join(' | '));
    keur('en Klanten staat er niet tussen',
      !regels.some((t) => /Klanten|Chauffeurs|Meldingen|Aanvragen/.test(t)),
      regels.join(' | '));
    await ctx.close();
  }

  /* Er is geen schuifbalk meer. Stond die er nog, dan zouden er twee manieren
     zijn om hetzelfde te doen en zou de menuknop op een breed scherm weer
     kunnen verdwijnen. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Eigenaar', naam: 'Shane' },
      ritten: [], aanvragen: [], opdrachten: [], klanten: [] });
    keur('er staat geen schuifbalk met tabbladen meer',
      (await p.$$('.tabs, [role="tablist"]')).length === 0);
    await p.setViewportSize({ width: 1200, height: 900 });
    await p.waitForTimeout(120);
    keur('en op een breed scherm blijft de menuknop staan',
      await p.isVisible('#tabmenu-knop'));
    await p.setViewportSize({ width: 390, height: 900 });
    await p.waitForTimeout(120);
    keur('op een smal scherm ook', await p.isVisible('#tabmenu-knop'));
    await ctx.close();
  }

  /* Het belletje op de knop. Zonder balk zie je de tellers pas als je het menu
     opent — dan moet de knop zelf zeggen dát er iets ligt.

     Twee nieuwe aanvragen leveren twee meldingen op. De knop hoort er dus 2 te
     zeggen en niet 4: een aanvraag is al een melding, en die twee bij elkaar
     optellen telt dezelfde twee dingen dubbel. */
  {
    const { ctx, p } = await alsEigenaar();
    const bel = await p.textContent('#tabmenu-bel');
    keur('de knop draagt het aantal ongelezen meldingen',
      (await p.isVisible('#tabmenu-bel')) && bel.trim() === '2', bel);

    /* Sta je er zelf op, dan is het geen nieuws meer. */
    await p.click('#tabmenu-knop');
    await p.click('#tabmenu button:has-text("Meldingen")');
    await p.waitForTimeout(300);
    keur('en zwijgt zodra je op Meldingen staat',
      !(await p.isVisible('#tabmenu-bel')),
      await p.textContent('#tabmenu-bel'));
    await ctx.close();
  }

  /* Een chauffeur mag geen aanvragen zien, dus mag hij er ook geen belletje
     over krijgen. Anders wijst een rood bolletje naar een tabblad dat voor hem
     niet bestaat. */
  {
    const { ctx, p } = await opent({ ok: true, dag,
      ik: { rol: 'Chauffeur', naam: 'Piet' },
      ritten: [], klanten: [], opdrachten: [],
      aanvragen: [{ id: 'recQQQQQQQQQQQQQQ', naam: 'A', datum: dag, status: 'Nieuw' }] });
    keur('een chauffeur krijgt geen belletje',
      !(await p.isVisible('#tabmenu-bel')));
    await ctx.close();
  }
}

/* =========================================================================
   Het tabblad Chauffeurs, met jezelf erin.

   Je logt in met je eigen persoonlijke code in plaats van met de hoofdsleutel.
   Dan sta je zelf in de lijst, en dan moet die lijst twee dingen doen: laten
   zien welke rij van jou is, en je niet de knop aanbieden die je bij de
   volgende oproep buiten je eigen portaal zet.
   ========================================================================= */
console.log('\n=== jezelf in het tabblad Chauffeurs ===');
{
  const antwoord = { ok: true, dag,
    ik: { rol: 'Eigenaar', naam: 'Shane', id: 'recSHANEDEBAAS001' },
    ritten: [], aanvragen: [], opdrachten: [], klanten: [],
    chauffeurs: [
      { id: 'recSHANEDEBAAS001', naam: 'Shane', rol: 'Eigenaar', actief: true,
        heeftCode: true },
      { id: 'recPIETRIJDER0001', naam: 'Piet', rol: 'Chauffeur', actief: true,
        heeftCode: true }
    ] };

  const { ctx, p } = await opent(antwoord);
  await p.click('#tabmenu-knop');
  await p.click('#tabmenu button:has-text("Chauffeurs")');
  await p.waitForSelector('#lijst-chauffeurs .klantkaart', { timeout: 5000 })
    .catch(() => {});

  const kaarten = await p.$$eval('#lijst-chauffeurs .klantkaart', (l) => l.map((k) => ({
    naam: (k.querySelector('.klantkaart__naam') || {}).textContent || '',
    merk: (k.querySelector('.klantkaart__soort') || {}).textContent || '',
    knoppen: Array.from(k.querySelectorAll('.klantkaart__knoppen button, .klantkaart__knoppen a'))
      .map((b) => (b.textContent || '').trim())
  })));
  keur('beide chauffeurs staan er', kaarten.length === 2,
    JSON.stringify(kaarten.map((k) => k.naam)));

  const ik = kaarten.find((k) => k.naam === 'Shane') || { merk: '', knoppen: [] };
  const ander = kaarten.find((k) => k.naam === 'Piet') || { merk: '', knoppen: [] };

  keur('je eigen rij is als zodanig gemerkt', ik.merk === 'Jij', ik.merk);
  keur('en die van een ander niet', ander.merk !== 'Jij', ander.merk);

  keur('op je eigen rij staat geen non-actiefknop',
    !ik.knoppen.some((t) => /non-actief|Weer actief/.test(t)), ik.knoppen.join(' | '));
  keur('bij een ander wel', ander.knoppen.some((t) => /Op non-actief/.test(t)),
    ander.knoppen.join(' | '));
  keur('en je eigen code opvragen kan nog steeds',
    ik.knoppen.some((t) => /Code tonen/.test(t)), ik.knoppen.join(' | '));
  await ctx.close();
}

/* Met de hoofdsleutel is er geen eigen rij: dan hoort niemand als "Jij" te
   staan en horen alle knoppen er gewoon te zijn. */
{
  const { ctx, p } = await opent({ ok: true, dag,
    ik: { rol: 'Eigenaar', naam: 'Shane', id: null },
    ritten: [], aanvragen: [], opdrachten: [], klanten: [],
    chauffeurs: [{ id: 'recSHANEDEBAAS001', naam: 'Shane', rol: 'Eigenaar',
                   actief: true, heeftCode: true }] });
  await p.click('#tabmenu-knop');
  await p.click('#tabmenu button:has-text("Chauffeurs")');
  await p.waitForSelector('#lijst-chauffeurs .klantkaart', { timeout: 5000 })
    .catch(() => {});
  const merk = await p.textContent('#lijst-chauffeurs .klantkaart__soort');
  keur('met de hoofdsleutel staat er niemand als Jij', merk.trim() !== 'Jij', merk);
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
      /* Het wijzigverzoek is de eigen tekst van de klant en komt dus zo terug.
         Een tussenlaag die is overgenomen kan er iets anders in stoppen. */
      magWijzigen: true, wijzigStand: XSS, wijzigSoort: XSS,
      wijzigverzoek: XSS, wijzigOp: XSS,
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
