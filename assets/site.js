/* =========================================================================
   Gedeelde basis. Wordt op iedere pagina geladen, vóór de pagina-specifieke
   bestanden. Zet CONFIG en de reken- en verzendfuncties klaar onder window.SL,
   en regelt het mobiele menu en het jaartal in de footer.
   ========================================================================= */
(function () {
  'use strict';

  /* =======================================================================
     BEDRIJFSGEGEVENS EN TARIEVEN — hier aanpassen, niet verderop in de code.
     Let op: de bedragen in de tariefkaarten en tabellen staan óók als tekst
     in de HTML. Wijzig je hier iets, pas die dan ook aan.
     ======================================================================= */
  var CONFIG = {
    email: 'info@schaaplogistics.nl',   /* PLACEHOLDER */
    minimum: 75,                         /* minimumtarief per opdracht */
    btw: 0.21,
    /* Per dienst een starttarief en een kilometerprijs. Een dienst mag een
       eigen minimum hebben; staat dat er niet, dan geldt CONFIG.minimum.
       Internationaal heeft een hoger minimum omdat de kortste rit over de
       grens al gauw een halve dag kost: heen, lossen, en leeg terug. */
    ritten: {
      standaard:     { naam: 'Standaard transport',    start: 75,  km: 1.50 },
      spoed:         { naam: 'Spoedtransport',         start: 100, km: 2.00, spoed: true },
      direct:        { naam: 'Directe spoed',          start: 125, km: 2.50, spoed: true },
      internationaal:{ naam: 'Internationaal transport', start: 150, km: 2.00, minimum: 200,
                       buitenland: true }
    },
    tijden: {
      dag:   { naam: 'Overdag',                toeslag: 0  },
      avond: { naam: 'Avondrit (18:00-23:00)', toeslag: 15 },
      nacht: { naam: 'Nacht- of weekendrit',   toeslag: 35 }
    },
    /* Toeslag per extra adres onderweg. Een stop is omrijden plus laden en
       lossen; dat zit niet in het kilometertarief. */
    stoptoeslag: 25,
    /* Wachten bij laden of lossen. De eerste vijftien minuten zijn inbegrepen;
       daarna per begonnen kwartier. Wordt niet vooraf geschat — je weet pas
       achteraf hoe lang je stond — dus dit telt alleen mee op de factuur. */
    wachttijd: { gratis: 15, blok: 15, tarief: 15 },
    /* Omrekenfactor van hemelsbrede afstand naar werkelijke rijafstand. */
    wegfactor: 1.25,

    /* Waar de aanvraag heen gaat.
       Leeg     — het e-mailprogramma van de bezoeker opent met de aanvraag erin.
                  Werkt zonder server, en dus prima op GitHub Pages.
       Ingevuld — de aanvraag gaat als JSON naar deze URL, die hem in Airtable
                  zet. Dat is de Cloudflare Worker uit worker/aanvragen.js;
                  zie AIRTABLE.md voor het installeren ervan.
       Zet hier nooit een Airtable-sleutel neer: alles in dit bestand is voor
       iedere bezoeker leesbaar. Daarom staat de sleutel in de Worker. */
    webhookUrl: 'https://schaap-aanvragen.rt5twh6n7h.workers.dev',

    /* Grenzen voor de foto's bij een aanvraag. */
    foto: {
      maxAantal: 5,
      maxMb: 10
    }
  };

  /* Middelpunten van de Nederlandse postcoderegio's (eerste twee cijfers).
     Genoeg voor een prijsindicatie; niet voor navigatie. */
  var REGIO = {
    10:[52.37,4.90], 11:[52.31,4.95], 12:[52.22,5.17], 13:[52.37,5.22], 14:[52.28,5.16],
    15:[52.44,4.83], 16:[52.64,5.06], 17:[52.80,4.79], 18:[52.63,4.75], 19:[52.47,4.63],
    20:[52.38,4.64], 21:[52.29,4.58], 22:[52.20,4.42], 23:[52.16,4.49], 24:[52.13,4.66],
    25:[52.08,4.31], 26:[52.01,4.36], 27:[52.06,4.49], 28:[52.01,4.71], 29:[51.93,4.58],
    30:[51.92,4.48], 31:[51.91,4.35], 32:[51.85,4.33], 33:[51.81,4.67], 34:[52.03,5.09],
    35:[52.09,5.12], 36:[52.14,5.04], 37:[52.09,5.23], 38:[52.16,5.39], 39:[52.02,5.56],
    40:[51.89,5.43], 41:[51.93,5.10], 42:[51.83,4.97], 43:[51.63,3.95], 44:[51.50,3.75],
    45:[51.32,3.75], 46:[51.49,4.29], 47:[51.53,4.47], 48:[51.59,4.78], 49:[51.64,4.86],
    50:[51.56,5.09], 51:[51.69,5.07], 52:[51.70,5.30], 53:[51.81,5.25], 54:[51.68,5.57],
    55:[51.43,5.40], 56:[51.44,5.48], 57:[51.48,5.66], 58:[51.53,5.90], 59:[51.37,6.17],
    60:[51.25,5.71], 61:[51.10,5.87], 62:[50.85,5.69], 63:[50.87,5.83], 64:[50.92,5.95],
    65:[51.84,5.86], 66:[51.81,5.72], 67:[52.02,5.66], 68:[51.98,5.91], 69:[51.96,6.08],
    70:[51.97,6.29], 71:[51.97,6.60], 72:[52.14,6.20], 73:[52.21,5.97], 74:[52.25,6.16],
    75:[52.23,6.85], 76:[52.36,6.66], 77:[52.58,6.62], 78:[52.78,6.90], 79:[52.72,6.40],
    80:[52.51,6.09], 81:[52.39,6.28], 82:[52.52,5.47], 83:[52.71,5.75], 84:[52.82,6.10],
    85:[52.96,5.86], 86:[53.03,5.66], 87:[53.10,5.50], 88:[53.19,5.54], 89:[53.20,5.79],
    90:[53.18,5.83], 91:[53.32,5.99], 92:[53.10,6.10], 93:[53.14,6.42], 94:[53.00,6.56],
    95:[53.05,6.90], 96:[53.15,6.85], 97:[53.22,6.57], 98:[53.28,6.40], 99:[53.32,6.86]
  };

  var euro = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
  });

  /* ===================== afstand op postcode ===================== */

  /* Haalt de eerste 4 cijfers uit een ingevulde locatie ("3011 AA 12, Rotterdam"). */
  function postcodeUit(tekst) {
    var m = String(tekst || '').match(/\b(\d{4})\b/);
    return m ? m[1] : null;
  }

  function regioVan(pc) {
    return pc ? REGIO[parseInt(pc.slice(0, 2), 10)] : null;
  }

  function hemelsbreed(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad;
    var dLon = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a[0] * rad) * Math.cos(b[0] * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* Schat de rijafstand tussen twee postcodes. null als er iets niet klopt. */
  function schatAfstand(pcA, pcB) {
    var a = regioVan(pcA), b = regioVan(pcB);
    if (!a || !b) { return null; }
    var km = Math.round(hemelsbreed(a, b) * CONFIG.wegfactor);
    return Math.max(5, km);   /* binnen dezelfde regio blijft er altijd een rit over */
  }

  /* ===================== prijsberekening ===================== */

  /* Ritprijs = starttarief + kilometers. Ligt die onder het minimumtarief,
     dan geldt het minimum. Toeslagen — tijdvak en extra stops — komen daar
     bovenop, net als in de factuurberekening in Airtable. */
  function bereken(soort, km, tijd, stops) {
    var r = CONFIG.ritten[soort];
    if (!r) { return null; }
    var t = CONFIG.tijden[tijd] || CONFIG.tijden.dag;
    var n = stopsUit(stops);
    var kmSom = km * r.km;
    var stopSom = n * CONFIG.stoptoeslag;
    var ritprijs = r.start + kmSom;
    var bodem = r.minimum || CONFIG.minimum;
    var correctie = Math.max(0, bodem - ritprijs);
    return {
      tarief: r, tijdstip: t, kmSom: kmSom, correctie: correctie,
      stops: n, stopSom: stopSom,
      totaal: ritprijs + correctie + t.toeslag + stopSom
    };
  }

  /* Wat er als aantal stops binnenkomt is soms een getal, soms een leeg veld
     en soms iets als "2 adressen". Alleen een heel getal telt mee. */
  function stopsUit(w) {
    var n = parseInt(String(w === undefined || w === null ? '' : w).trim(), 10);
    if (isNaN(n) || n < 0) { return 0; }
    return Math.min(n, 20);
  }

  /* Bij spoed kiest de klant geen tijdvak: spoed is per definitie zo snel
     mogelijk. Het tijdvak volgt dan uit het moment waarop de zending
     klaarstaat, zodat een avond- of nachtrit toch zijn toeslag krijgt.
     Zaterdag en zondag tellen als weekend, ongeacht het uur. */
  function tijdvakUit(datum, tijd) {
    var d = /^\d{4}-\d{2}-\d{2}$/.test(datum || '') ? new Date(datum + 'T12:00:00') : null;
    if (d && (d.getDay() === 0 || d.getDay() === 6)) { return 'nacht'; }
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(tijd || ''));
    if (!m) { return 'dag'; }
    var uur = Number(m[1]);
    if (uur >= 23 || uur < 6) { return 'nacht'; }
    if (uur >= 18) { return 'avond'; }
    return 'dag';
  }

  /* ===================== e-mail ===================== */

  /* Opent het e-mailprogramma met een ingevuld bericht. `wat` bepaalt hoe het
     in de bevestiging heet: 'de aanvraag' of 'het bericht'. */
  function verstuurViaMail(onderwerp, regels, noot, wat) {
    wat = wat || 'het bericht';
    window.location.href = 'mailto:' + CONFIG.email +
      '?subject=' + encodeURIComponent(onderwerp) +
      '&body='    + encodeURIComponent(regels.join('\n'));
    noot.textContent = 'Uw e-mailprogramma wordt geopend met ' + wat + ' erin. ' +
                       'Verstuur de mail om ' + wat + ' af te ronden.';
    noot.style.color = '#12a15c';
    noot.style.fontWeight = '600';
  }

  /* Alles wat de pagina-specifieke bestanden nodig hebben. */
  window.SL = {
    CONFIG: CONFIG,
    euro: euro,
    postcodeUit: postcodeUit,
    regioVan: regioVan,
    schatAfstand: schatAfstand,
    bereken: bereken,
    stopsUit: stopsUit,
    tijdvakUit: tijdvakUit,
    verstuurViaMail: verstuurViaMail
  };

  /* ===================== mobiel menu ===================== */

  var toggle = document.getElementById('navToggle');
  var links  = document.getElementById('navLinks');

  if (toggle && links) {
    function zetMenu(open) {
      links.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      var woord = toggle.querySelector('.nav__toggle-tekst');
      if (woord) { woord.textContent = open ? 'Sluiten' : 'Menu'; }
    }

    toggle.addEventListener('click', function () {
      zetMenu(!links.classList.contains('is-open'));
    });

    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) { zetMenu(false); }
    });

    /* Buiten het menu tikken sluit het ook. Zonder dit moet je terug naar
       precies die ene knop, en dat is op een telefoon net te veel gedoe. */
    document.addEventListener('click', function (e) {
      if (!links.classList.contains('is-open')) { return; }
      if (e.target.closest('#navLinks') || e.target.closest('#navToggle')) { return; }
      zetMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('is-open')) {
        zetMenu(false);
        toggle.focus();
      }
    });
  }

  var jaar = document.getElementById('jaar');
  if (jaar) { jaar.textContent = new Date().getFullYear(); }
})();
