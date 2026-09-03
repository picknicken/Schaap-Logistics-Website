/* =========================================================================
   Het chauffeursportaal. Draait alleen op /portaal/ en praat met de Worker
   uit worker-portaal/portaal.js — nooit rechtstreeks met Airtable, want de
   sleutel daarvoor hoort niet in een bestand dat iedereen kan opvragen.

   De toegangscode wordt op de telefoon bewaard, zodat je hem niet elke rit
   opnieuw hoeft in te typen. Verlies je je telefoon, wijzig dan de code in
   Cloudflare: dan is dit apparaat er meteen uit.
   ========================================================================= */
(function () {
  'use strict';

  var CONFIG = {
    /* Het adres van de portaal-Worker. Laat je dit leeg, dan vraagt het
       inlogscherm er zelf om en onthoudt de telefoon het — dan hoef je na het
       uitrollen niets meer in de code te veranderen. Vul je het hier wel in,
       dan gaat dat voor en verdwijnt het veld. */
    portaalUrl: 'https://schaap-portaal.rt5twh6n7h.workers.dev',
    sleutel: 'sl-portaal-code',
    sleutelAdres: 'sl-portaal-adres'
  };

  var euro = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  });
  var euroCent = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
  });

  var el = function (id) { return document.getElementById(id); };

  var code = '';
  var adres = '';
  var dag = vandaag();
  var ritten = [];
  var aanvragen = [];
  var opdrachten = [];
  var klanten = [];
  /* Klant-ids waarvoor deze zitting een uitnodiging is aangevraagd. Airtable
     zet het moment pas neer als de mail werkelijk weg is, en dat kan een
     tel duren; zonder dit zou de knop meteen weer staan alsof je niets deed. */
  var uitnodigingen = {};
  var tabblad = 'ritten';
  var klantVoor = null;
  var tekentVoor = null;

  /* ------------------------------------------------------------- datums */

  /* Bewust niet via toISOString: die rekent naar UTC, en dan valt een rit van
     's ochtends vroeg of 's avonds laat op de verkeerde dag. */
  function alsDatum(d) {
    var m = String(d.getMonth() + 1);
    var g = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (g.length < 2 ? '0' + g : g);
  }
  function vandaag() { return alsDatum(new Date()); }
  function verschuif(datum, dagen) {
    var d = new Date(datum + 'T12:00:00');
    d.setDate(d.getDate() + dagen);
    return alsDatum(d);
  }
  function dagNaam(datum) {
    if (datum === vandaag()) { return 'Vandaag'; }
    if (datum === verschuif(vandaag(), 1)) { return 'Morgen'; }
    if (datum === verschuif(vandaag(), -1)) { return 'Gisteren'; }
    var naam = new Date(datum + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' });
    return naam.charAt(0).toUpperCase() + naam.slice(1);
  }
  function datumLang(datum) {
    return new Date(datum + 'T12:00:00')
      .toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function datumKort(iso) {
    if (!iso) { return ''; }
    return new Date(iso + 'T12:00:00')
      .toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function klok(iso) {
    if (!iso) { return ''; }
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  /* ------------------------------------------------------- communicatie */

  function waarheen() {
    return CONFIG.portaalUrl || adres;
  }

  function verstuur(actie, gegevens) {
    if (!waarheen()) {
      return Promise.reject(new Error(
        'Vul eerst het adres van het portaal in.'
      ));
    }
    var lading = Object.assign({ actie: actie }, gegevens || {});
    return fetch(waarheen(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portaal-Code': code },
      body: JSON.stringify(lading)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          vergeetCode();
          throw new Error('Je toegangscode klopt niet meer. Voer hem opnieuw in.');
        }
        /* Een Worker van voor deze versie kent de nieuwe opdrachten niet en
           antwoordt met "Onbekende actie". Dat zegt niets over wat je moet
           doen, dus vertalen we het naar de echte oorzaak. */
        if (data.fout === 'Onbekende actie') {
          throw new Error(
            'Het tussenstukje bij Cloudflare is een oude versie en kent deze ' +
            'knop nog niet. Rol de Worker opnieuw uit; daarna werkt dit scherm.'
          );
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.fout || ('Er ging iets mis (' + res.status + ')'));
        }
        return data;
      });
    }, function () {
      throw new Error(
        'Geen verbinding. Controleer je bereik en probeer het opnieuw — er is niets verstuurd.'
      );
    });
  }

  /* ------------------------------------------------------------ toegang */

  /* Het adres blijft staan als je uitlogt. Alleen de code raak je kwijt —
     anders moet je bij elke keer sluiten ook die hele workers.dev-URL weer
     overtypen, en dat is precies het soort werk dat niemand volhoudt. */
  function vergeetCode() {
    code = '';
    try { localStorage.removeItem(CONFIG.sleutel); } catch (e) { /* privémodus */ }
    el('app').hidden = true;
    el('slot').hidden = false;
    vulSlotIn();
  }

  function onthoud(nieuweCode, nieuwAdres) {
    code = nieuweCode;
    adres = nieuwAdres;
    try {
      localStorage.setItem(CONFIG.sleutel, nieuweCode);
      if (!CONFIG.portaalUrl) { localStorage.setItem(CONFIG.sleutelAdres, nieuwAdres); }
    } catch (e) { /* privémodus */ }
  }

  /* Het adresveld staat er alleen als het niet al in de code is ingevuld. */
  function vulSlotIn() {
    var veld = el('slot-adres-veld');
    veld.hidden = !!CONFIG.portaalUrl;
    if (!veld.hidden) { el('slot-adres').value = adres; }
  }

  function meldSlot(tekst) {
    var m = el('slot-melding');
    m.textContent = tekst || '';
    m.hidden = !tekst;
  }

  function meldApp(tekst) {
    var m = el('app-melding');
    m.textContent = tekst || '';
    m.hidden = !tekst;
  }

  el('slot-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ingetypteCode = el('slot-code').value.trim();
    var ingetyptAdres = CONFIG.portaalUrl ||
      el('slot-adres').value.trim().replace(/\/+$/, '');

    if (!ingetypteCode) { return; }
    if (!ingetyptAdres) {
      meldSlot('Vul het adres van het portaal in. Dat begint met https:// en ' +
               'eindigt op .workers.dev.');
      el('slot-adres').focus();
      return;
    }
    /* Alleen https, en geen willekeurige tekst. De code gaat naar dit adres toe,
       dus een typefout mag geen wachtwoord ergens anders naartoe sturen. */
    if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(ingetyptAdres)) {
      meldSlot('Dat is geen geldig adres. Het hoort te beginnen met https:// — ' +
               'neem het over zoals je het van Cloudflare kreeg.');
      el('slot-adres').focus();
      return;
    }

    var knop = e.target.querySelector('button');
    knop.disabled = true;
    knop.textContent = 'Even kijken…';
    code = ingetypteCode;
    adres = ingetyptAdres;

    verstuur('overzicht', { dag: dag }).then(function (data) {
      onthoud(ingetypteCode, ingetyptAdres);
      meldSlot('');
      el('slot').hidden = true;
      el('app').hidden = false;
      el('slot-code').value = '';
      toon(data);
    }).catch(function (fout) {
      code = '';
      meldSlot(fout.message);
    }).then(function () {
      knop.disabled = false;
      knop.textContent = 'Openen';
    });
  });

  el('uitloggen').addEventListener('click', function () {
    vergeetCode();
    meldSlot('');
  });

  /* --------------------------------------------------------------- dag */

  el('dag-vorige').addEventListener('click', function () { gaNaar(verschuif(dag, -1)); });
  el('dag-volgende').addEventListener('click', function () { gaNaar(verschuif(dag, 1)); });
  el('dag-vandaag').addEventListener('click', function () { gaNaar(vandaag()); });

  function gaNaar(nieuweDag) {
    dag = nieuweDag;
    haalDag();
  }

  function haalDag() {
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
    el('lijst').innerHTML = '<div class="leeg">Ophalen…</div>';
    meldApp('');
    verstuur('overzicht', { dag: dag })
      .then(toon)
      .catch(function (fout) {
        meldApp(fout.message);
        el('lijst').innerHTML = '';
      });
  }

  function toon(data) {
    ritten = data.ritten || [];
    /* Bij een dagwissel komen aanvragen en opdrachten mee; bij een losse
       rittenoproep niet. Dan houden we wat we al hadden. */
    if (data.aanvragen)  { aanvragen = data.aanvragen; }
    if (data.opdrachten) { opdrachten = data.opdrachten; }
    if (data.klanten)    {
      klanten = data.klanten;
      /* Verse klantgegevens uit Airtable: daar staat nu in wanneer een
         uitnodiging werkelijk verstuurd is. Ons eigen "zojuist aangevraagd"
         heeft dan afgedaan en moet weg, anders blijft die melding staan bij
         een klant die inmiddels gewoon een datum heeft. */
      uitnodigingen = {};
    }
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
    tekenAlles();
  }

  function tekenAlles() {
    tekenTegels();
    tekenLijst();
    tekenAanvragen();
    tekenPlanning();
    tekenBadges();
  }

  /* -------------------------------------------------------- tabbladen */

  function tekenBadges() {
    var open = ritten.filter(function (r) {
      return r.status === 'Gepland' || r.status === 'Onderweg';
    }).length;
    badge('badge-ritten', open);
    badge('badge-aanvragen', aanvragen.length);
    badge('badge-planning', opdrachten.length);
  }

  function badge(id, aantal) {
    var b = el(id);
    b.textContent = aantal;
    b.hidden = !aantal;
  }

  function kiesTab(naam) {
    tabblad = naam;
    ['ritten', 'aanvragen', 'planning'].forEach(function (t) {
      el('tab-' + t).setAttribute('aria-selected', String(t === naam));
      el('paneel-' + t).hidden = (t !== naam);
    });
    window.scrollTo(0, 0);
  }

  ['ritten', 'aanvragen', 'planning'].forEach(function (t) {
    el('tab-' + t).addEventListener('click', function () { kiesTab(t); });
  });

  function tekenTegels() {
    var open = ritten.filter(function (r) {
      return r.status === 'Gepland' || r.status === 'Onderweg';
    }).length;
    var km = ritten.reduce(function (t, r) {
      return r.status === 'Geannuleerd' ? t : t + (Number(r.km) || 0);
    }, 0);
    var omzet = ritten.reduce(function (t, r) {
      return r.status === 'Geannuleerd' ? t : t + (Number(r.bedrag) || 0);
    }, 0);

    el('t-ritten').textContent = ritten.length;
    el('t-open').textContent = open;
    el('t-km').textContent = Math.round(km);
    el('t-omzet').textContent = omzet ? euro.format(omzet) : '–';
  }

  /* -------------------------------------------------------------- lijst */

  function maak(soort, klasse, tekst) {
    var e = document.createElement(soort);
    if (klasse) { e.className = klasse; }
    if (tekst !== undefined) { e.textContent = tekst; }
    return e;
  }

  /* Opent de kaartenapp met deze bestemming. Werkt op Android en iOS zonder
     sleutel of account; staat de app niet op de telefoon, dan opent de site. */
  function routeNaar(adres) {
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
           encodeURIComponent(adres);
  }

  /* De hele route van ophalen naar bezorgen. Hiermee lees je de kortste
     afstand af en tik je hem hieronder in. Automatisch overnemen kan niet:
     daar is een betaalde sleutel bij Google voor nodig, en die hoort niet in
     een pagina te staan die iedereen kan openen. */
  function routeVan(van, naar) {
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' +
           encodeURIComponent(van) + '&destination=' + encodeURIComponent(naar);
  }

  /* Een genummerd invoerveld met een label erboven. Kwam op drie plekken voor
     en zag er telkens net anders uit; nu niet meer. */
  function getalVeld(naam, waarde) {
    var veld = maak('label', 'veld');
    veld.style.margin = '0';
    veld.appendChild(maak('span', '', naam));
    var invoer = document.createElement('input');
    invoer.type = 'number';
    invoer.inputMode = 'decimal';
    invoer.min = '0';
    invoer.step = '1';
    invoer.value = waarde || '';
    invoer.placeholder = '0';
    veld.appendChild(invoer);
    veld.invoer = invoer;
    return veld;
  }

  /* Een bedrag in euro's. Twee decimalen, want je typt een bonnetje over. */
  function euroVeld(naam, waarde) {
    var veld = getalVeld(naam, waarde);
    veld.invoer.step = '0.01';
    veld.invoer.placeholder = '0,00';
    return veld;
  }

  /* Hetzelfde, maar met een keuzelijst. De drie tijdvakken staan hier bewust
     letterlijk: het zijn dezelfde namen als in Airtable en op de website, en
     aan elk hangt een bedrag. */
  var TIJDVAKKEN = [
    ['Overdag', 'Overdag — geen toeslag'],
    ['Avondrit (18:00-23:00)', 'Avond 18:00-23:00 — + € 15'],
    ['Nacht- of weekendrit', 'Nacht of weekend — + € 35']
  ];

  function tijdvakVeld(gekozen) {
    var veld = maak('label', 'veld');
    veld.style.margin = '0';
    veld.appendChild(maak('span', '', 'Tijdvak'));
    var keuze = document.createElement('select');
    TIJDVAKKEN.forEach(function (t) {
      var optie = document.createElement('option');
      optie.value = t[0];
      optie.textContent = t[1];
      keuze.appendChild(optie);
    });
    keuze.value = gekozen || 'Overdag';
    veld.appendChild(keuze);
    veld.invoer = keuze;
    return veld;
  }

  /* Een tekstlink onder een invoerveld, voor iets wat je opzoekt en daarna
     zelf invult. */
  function afstandLink(van, naar) {
    if (!van || !naar) { return null; }
    var a = maak('a', 'veldlink', 'Kortste route opzoeken in Maps');
    a.href = routeVan(van, naar);
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function tekenLijst() {
    var lijst = el('lijst');
    lijst.innerHTML = '';

    if (!ritten.length) {
      lijst.appendChild(maak('div', 'leeg',
        dag === vandaag() ? 'Geen ritten vandaag.' : 'Geen ritten op deze dag.'));
      return;
    }

    ritten.forEach(function (rit) {
      lijst.appendChild(tekenRit(rit));
    });
  }

  function tekenRit(rit) {
    var klaar = rit.status === 'Uitgevoerd' || rit.status === 'Geannuleerd';

    /* Er is iets mis als een rit geen klant heeft, of uitgevoerd is zonder
       handtekening. In beide gevallen kun je later niet factureren of niets
       aantonen — dus die kaart klapt open, ook als de rit al afgerond is.
       Een waarschuwing die je moet opendoen om te zien, zie je niet. */
    var aandacht = (!rit.klant && rit.status !== 'Geannuleerd') ||
                   (!rit.km && rit.status !== 'Geannuleerd') ||
                   (rit.status === 'Uitgevoerd' && !rit.handtekening);
    var kaart = maak('details', 'rit' + (klaar && !aandacht ? ' rit--klaar' : ''));
    kaart.open = !klaar || aandacht;

    /* --- kop --- */
    var kop = maak('summary', 'rit__kop');
    kop.appendChild(maak('span', 'rit__tijd s-' + rit.status.toLowerCase(), rit.status));

    var hoofd = maak('div', 'rit__hoofd');
    hoofd.appendChild(maak('div', 'rit__klant', rit.klant || rit.naam || 'Rit'));
    hoofd.appendChild(maak('div', 'rit__route',
      (rit.ophaal || '?') + '  →  ' + (rit.aflever || '?')));
    kop.appendChild(hoofd);

    var pijl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pijl.setAttribute('class', 'rit__pijl');
    pijl.setAttribute('width', '16');
    pijl.setAttribute('height', '16');
    pijl.setAttribute('viewBox', '0 0 24 24');
    pijl.setAttribute('fill', 'none');
    pijl.setAttribute('stroke', 'currentColor');
    pijl.setAttribute('stroke-width', '2.5');
    pijl.setAttribute('stroke-linecap', 'round');
    pijl.setAttribute('stroke-linejoin', 'round');
    var pad = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pad.setAttribute('d', 'm9 18 6-6-6-6');
    pijl.appendChild(pad);
    kop.appendChild(pijl);
    kaart.appendChild(kop);

    /* --- lijf --- */
    var lijf = maak('div', 'rit__lijf');

    var dl = maak('dl', 'paar');
    function regel(naam, waarde) {
      if (!waarde && waarde !== 0) { return; }
      dl.appendChild(maak('dt', '', naam));
      dl.appendChild(maak('dd', '', waarde));
    }
    regel('Rit', rit.naam);
    regel('Soort', rit.type);
    regel('Ophalen', rit.ophaal);
    regel('Bezorgen', rit.aflever);
    if (rit.km) { regel('Afstand', Math.round(rit.km) + ' km'); }
    if (rit.tijd) { regel('Ophalen om', rit.tijd); }
    if (rit.wachttijd) { regel('Wachttijd', rit.wachttijd + ' min'); }
    if (rit.tijdvak && rit.tijdvak !== 'Overdag') { regel('Tijdvak', rit.tijdvak); }
    if (rit.bedrag) { regel('Bedrag', euroCent.format(rit.bedrag) + ' excl. btw'); }
    if (rit.onderweg) { regel('Vertrokken', klok(rit.onderweg)); }
    regel('Opmerking', rit.opmerking);
    if (dl.children.length) { lijf.appendChild(dl); }

    /* --- afleverbewijs --- */
    if (rit.status === 'Uitgevoerd') {
      var bewijs = maak('div', 'bewijs' + (rit.handtekening ? '' : ' bewijs--mist'));
      var tekst = maak('div');
      if (rit.handtekening) {
        tekst.appendChild(maak('b', '', 'Afgetekend'));
        tekst.appendChild(document.createTextNode(
          (rit.getekend || 'onbekend') + (rit.getekendOp ? ' om ' + klok(rit.getekendOp) : '')
        ));
      } else {
        tekst.appendChild(maak('b', '', 'Geen handtekening'));
        tekst.appendChild(document.createTextNode(
          'Deze rit staat op uitgevoerd, maar er is niets afgetekend. Kun je later niet aantonen.'
        ));
      }
      bewijs.appendChild(tekst);
      lijf.appendChild(bewijs);

      /* En de krabbel zelf, want anders kun je hem alleen in Airtable terugzien
         en is het geen bewijs dat je onderweg even laat zien. */
      if (rit.krabbel) {
        var vak = maak('a', 'krabbel');
        vak.href = rit.krabbel;
        vak.target = '_blank';
        vak.rel = 'noopener';
        var afb = document.createElement('img');
        afb.src = rit.krabbel;
        afb.alt = 'Handtekening van ' + (rit.getekend || 'de ontvanger');
        afb.loading = 'lazy';
        vak.appendChild(afb);
        lijf.appendChild(vak);
      }
    }

    /* Zonder kilometers rekent de factuur alleen het starttarief en valt hij
       terug op het minimum. Dat zie je pas als de factuur er ligt, en dan is
       hij al de deur uit — dus hier, nu. */
    if (!rit.km && rit.status !== 'Geannuleerd') {
      var geenKm = maak('div', 'bewijs bewijs--mist');
      var gkm = maak('div');
      gkm.appendChild(maak('b', '', 'Geen kilometers'));
      gkm.appendChild(document.createTextNode(
        'De factuur rekent nu alleen het starttarief en vult aan tot ' +
        '\u20ac 75. Vul de gereden kilometers in.'));
      geenKm.appendChild(gkm);
      lijf.appendChild(geenKm);
    }

    if (rit.status !== 'Geannuleerd') {
      var cijferRij = maak('div', 'velrij');
      var kmVeldRit = getalVeld('Gereden km', rit.km);
      var stopVeldRit = getalVeld('Extra stops', rit.stops);
      cijferRij.appendChild(kmVeldRit);
      cijferRij.appendChild(stopVeldRit);
      lijf.appendChild(cijferRij);

      var ritLink = afstandLink(rit.ophaal, rit.aflever);
      if (ritLink) { lijf.appendChild(ritLink); }

      var tvVeldRit = tijdvakVeld(rit.tijdvak);
      lijf.appendChild(tvVeldRit);

      /* Wachttijd en doorberekende kosten: wat er onderweg werkelijk gebeurd
         is en wat de klant daarvoor betaalt. Beide gaan de factuur op. */
      var extraRij = maak('div', 'velrij');
      var wachtVeld = getalVeld('Wachttijd (min)', rit.wachttijd);
      var doorVeld = euroVeld('Doorberekenen', rit.doorbereken);
      extraRij.appendChild(wachtVeld);
      extraRij.appendChild(doorVeld);
      lijf.appendChild(extraRij);
      lijf.appendChild(maak('div', 'terzijde',
        'Eerste 15 minuten wachten inbegrepen, daarna € 15 per kwartier. ' +
        'Onder Doorberekenen zet je tol, parkeren of veerpont die de klant betaalt; ' +
        'dat komt als losse regel op de factuur. Brandstof niet: die zit al in het ' +
        'kilometertarief. Jouw eigen kosten horen hieronder.'));

      var kmKnop = maak('button', 'knop knop--rand', 'Gegevens van de rit opslaan');
      kmKnop.type = 'button';
      kmKnop.addEventListener('click', function () {
        bezig(kmKnop, 'Opslaan…', function (klaar) {
          verstuur('ritkm', {
            id: rit.id,
            km: kmVeldRit.invoer.value,
            stops: stopVeldRit.invoer.value,
            tijdvak: tvVeldRit.invoer.value,
            wachttijd: wachtVeld.invoer.value,
            doorbereken: doorVeld.invoer.value
          }).then(function (data) {
            ververs(data.rit);
            meldApp('');
            klaar(true);
          }).catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      lijf.appendChild(kmKnop);

      lijf.appendChild(kostenBlok(rit));
    }

    /* Een rit zonder klant kun je rijden, maar niet factureren. Dat moet je
       zien voordat de rit voorbij is, niet als je de factuur wilt maken. */
    if (!rit.klant && rit.status !== 'Geannuleerd') {
      var geenKlant = maak('div', 'bewijs bewijs--mist');
      var gk = maak('div');
      gk.appendChild(maak('b', '', 'Geen klant aan deze rit'));
      gk.appendChild(document.createTextNode(
        'Rijden kan, factureren niet. Koppel er een klant aan.'));
      geenKlant.appendChild(gk);
      lijf.appendChild(geenKlant);

      var koppelRit = maak('button', 'knop knop--rand', 'Klant koppelen');
      koppelRit.type = 'button';
      koppelRit.addEventListener('click', function () { openKlantblad(rit, 'rit'); });
      lijf.appendChild(koppelRit);
    }

    /* --- knoppen --- */
    var knoppen = maak('div', 'knoppen');

    if (rit.status === 'Gepland' || rit.status === 'Onderweg') {
      var doel = rit.status === 'Gepland' ? rit.ophaal : rit.aflever;
      if (doel) {
        var nav = maak('a', 'knop knop--rand',
          rit.status === 'Gepland' ? 'Route naar ophaaladres' : 'Route naar afleveradres');
        nav.href = routeNaar(doel);
        nav.target = '_blank';
        nav.rel = 'noopener';
        knoppen.appendChild(nav);
      }
    }

    if (rit.telefoon) {
      var bel = maak('a', 'knop knop--rand', 'Bel ' + (rit.klant || 'de klant'));
      bel.href = 'tel:' + String(rit.telefoon).replace(/[^\d+]/g, '');
      knoppen.appendChild(bel);
    }

    if (rit.status === 'Gepland') {
      var vertrek = maak('button', 'knop knop--blauw', 'Onderweg');
      vertrek.type = 'button';
      vertrek.addEventListener('click', function () {
        wijzigStatus(rit, 'Onderweg', vertrek);
      });
      knoppen.appendChild(vertrek);
    }

    if (rit.status === 'Onderweg' || (rit.status === 'Uitgevoerd' && !rit.handtekening)) {
      var tekenen = maak('button', 'knop knop--groen',
        rit.status === 'Onderweg' ? 'Afleveren en laten tekenen' : 'Handtekening alsnog zetten');
      tekenen.type = 'button';
      tekenen.addEventListener('click', function () { openTekenblad(rit); });
      knoppen.appendChild(tekenen);
    }

    if (rit.status === 'Gepland' || rit.status === 'Onderweg') {
      var afblazen = maak('button', 'knop knop--stil', 'Rit annuleren');
      afblazen.type = 'button';
      afblazen.addEventListener('click', function () {
        if (window.confirm('Deze rit op geannuleerd zetten?')) {
          wijzigStatus(rit, 'Geannuleerd', afblazen);
        }
      });
      knoppen.appendChild(afblazen);
    }

    if (knoppen.children.length) { lijf.appendChild(knoppen); }
    kaart.appendChild(lijf);
    return kaart;
  }

  /* Vervangt één rit in de lijst en tekent alles opnieuw, zodat de tegels
     bovenaan meteen kloppen met wat je net hebt aangeklikt. */
  function ververs(nieuw) {
    ritten = ritten.map(function (r) { return r.id === nieuw.id ? nieuw : r; });
    tekenTegels();
    tekenLijst();
    tekenBadges();
  }

  function wijzigStatus(rit, status, knop) {
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig…';
    meldApp('');
    verstuur('status', { id: rit.id, status: status })
      .then(function (data) { ververs(data.rit); })
      .catch(function (fout) {
        meldApp(fout.message);
        knop.disabled = false;
        knop.textContent = oud;
      });
  }

  /* ------------------------------------------------------- aanvragen */

  /* Het soort transport bepaalt de kleur van het label. Een directe spoed
     hoort er tussen twintig regels uit te springen. */
  function merkKlasse(soort) {
    if (/directe/i.test(soort))       { return ' m-direct'; }
    if (/spoed/i.test(soort))         { return ' m-spoed'; }
    if (/internationaal/i.test(soort)){ return ' m-intl'; }
    return '';
  }

  function kort(soort) {
    if (/directe/i.test(soort))        { return 'Direct'; }
    if (/spoed/i.test(soort))          { return 'Spoed'; }
    if (/internationaal/i.test(soort)) { return 'Intl'; }
    if (/standaard/i.test(soort))      { return 'Standaard'; }
    return soort || '—';
  }

  function paarLijst(rijen) {
    var dl = maak('dl', 'paar');
    rijen.forEach(function (r) {
      if (!r[1] && r[1] !== 0) { return; }
      dl.appendChild(maak('dt', '', r[0]));
      dl.appendChild(maak('dd', '', r[1]));
    });
    return dl.children.length ? dl : null;
  }

  function tekenAanvragen() {
    var lijst = el('lijst-aanvragen');
    lijst.innerHTML = '';

    if (!aanvragen.length) {
      lijst.appendChild(maak('div', 'leeg',
        'Geen openstaande aanvragen. Alles is afgehandeld.'));
      return;
    }
    aanvragen.forEach(function (a) { lijst.appendChild(tekenAanvraag(a)); });
  }

  function tekenAanvraag(a) {
    var kaart = maak('details', 'kaart');
    var kop = maak('summary', 'kaart__kop');
    kop.appendChild(maak('span', 'kaart__merk' + merkKlasse(a.dienst), kort(a.dienst)));

    var hoofd = maak('div', 'kaart__hoofd');
    hoofd.appendChild(maak('div', 'kaart__titel', a.bedrijf || a.contact || 'Aanvraag'));
    hoofd.appendChild(maak('div', 'kaart__regel',
      (a.ophaal || a.ophaalpc || '?') + '  \u2192  ' + (a.aflever || a.afleverpc || '?')));
    if (a.datum) {
      hoofd.appendChild(maak('div', 'kaart__regel',
        'Gewenst: ' + datumKort(a.datum) + (a.tijd ? ' om ' + a.tijd : '')));
    }
    kop.appendChild(hoofd);
    kaart.appendChild(kop);

    var lijf = maak('div', 'kaart__lijf');

    if (a.prijs) {
      var p = maak('div', 'prijs');
      p.appendChild(maak('span', '', 'Indicatie'));
      p.appendChild(maak('b', '', euroCent.format(a.prijs) + ' excl. btw'));
      lijf.appendChild(p);
    }

    var dl = paarLijst([
      ['Contact', a.contact],
      ['Tijdvak', a.tijdvak],
      ['Ophalen', a.ophaal],
      ['Bezorgen', a.aflever],
      ['Stops', a.stops],
      ['Afstand', a.afstand ? Math.round(a.afstand) + ' km' : ''],
      ['Zending', a.omschrijving],
      ['Colli', a.colli],
      ['Gewicht', a.gewicht],
      ['Afmeting', a.afmetingen],
      ['Opmerking', a.opmerking]
    ]);
    if (dl) { lijf.appendChild(dl); }

    var knoppen = maak('div', 'knoppen');

    if (a.telefoon) {
      var bel = maak('a', 'knop knop--rand', 'Bel ' + (a.contact || a.bedrijf || 'de klant'));
      bel.href = 'tel:' + String(a.telefoon).replace(/[^\d+]/g, '');
      knoppen.appendChild(bel);
    }
    if (a.email) {
      var mail = maak('a', 'knop knop--rand', 'Mail');
      mail.href = 'mailto:' + a.email;
      knoppen.appendChild(mail);
    }

    var ja = maak('button', 'knop knop--groen', 'Aannemen');
    ja.type = 'button';
    ja.addEventListener('click', function () { accepteer(a, ja); });
    knoppen.appendChild(ja);

    var nee = maak('button', 'knop knop--stil', 'Afwijzen');
    nee.type = 'button';
    nee.addEventListener('click', function () {
      if (window.confirm('Deze aanvraag afwijzen?')) { wijsAf(a, nee); }
    });
    knoppen.appendChild(nee);

    lijf.appendChild(knoppen);
    kaart.appendChild(lijf);
    return kaart;
  }

  /* Aannemen zet alleen het vinkje om; de automatisering in Airtable maakt
     de opdracht. Die verschijnt daarna in Planning — niet altijd meteen,
     want Airtable heeft er een paar seconden voor nodig. */
  function accepteer(a, knop) {
    bezig(knop, 'Aannemen…', function (klaar) {
      verstuur('accepteer', { id: a.id }).then(function () {
        aanvragen = aanvragen.filter(function (x) { return x.id !== a.id; });
        tekenAanvragen();
        tekenBadges();
        meldApp('Aangenomen. De opdracht verschijnt zo bij Planning — ' +
                'ververs even als je hem nog niet ziet.');
        klaar(true);
      }).catch(function (fout) { meldApp(fout.message); klaar(false); });
    });
  }

  function wijsAf(a, knop) {
    bezig(knop, 'Bezig…', function (klaar) {
      verstuur('afwijzen', { id: a.id }).then(function () {
        aanvragen = aanvragen.filter(function (x) { return x.id !== a.id; });
        tekenAanvragen();
        tekenBadges();
        klaar(true);
      }).catch(function (fout) { meldApp(fout.message); klaar(false); });
    });
  }

  /* -------------------------------------------------------- planning */

  function tekenPlanning() {
    var lijst = el('lijst-planning');
    lijst.innerHTML = '';

    if (!opdrachten.length) {
      lijst.appendChild(maak('div', 'leeg',
        'Niets in te plannen. Elke opdracht heeft een rit.'));
      return;
    }
    opdrachten.forEach(function (o) { lijst.appendChild(tekenOpdracht(o)); });
  }

  /* Wat de rit jou kostte. Ingeklapt, want het hoeft niet in de weg te staan
     tijdens het rijden — maar wel bij de hand als je met de bon in je hand
     naast de bus staat. Vul je het niet in, dan blijft je winstcijfer leeg en
     weet je aan het eind van de maand niet wat een rit werkelijk opleverde. */
  function kostenBlok(rit) {
    var blok = maak('details', 'kosten');
    blok.open = false;

    var kop = maak('summary', 'kosten__kop');
    kop.appendChild(maak('span', '', 'Kosten van deze rit'));
    kop.appendChild(maak('b', '', rit.kosten
      ? euroCent.format(rit.kosten)
      : 'nog niet ingevuld'));
    blok.appendChild(kop);

    var lijf = maak('div', 'kosten__lijf');

    var rij1 = maak('div', 'velrij');
    var brandstof = euroVeld('Brandstof', rit.brandstof);
    var tol = euroVeld('Tol en parkeren', rit.tol);
    rij1.appendChild(brandstof);
    rij1.appendChild(tol);
    lijf.appendChild(rij1);

    var rij2 = maak('div', 'velrij');
    var overig = euroVeld('Overig', rit.overig);
    rij2.appendChild(overig);
    if (rit.winst) {
      var winstVak = maak('div', 'winst');
      winstVak.appendChild(maak('span', '', 'Winst'));
      winstVak.appendChild(maak('b', '', euroCent.format(rit.winst)));
      rij2.appendChild(winstVak);
    }
    lijf.appendChild(rij2);

    var knop = maak('button', 'knop knop--rand', 'Kosten opslaan');
    knop.type = 'button';
    knop.addEventListener('click', function () {
      bezig(knop, 'Opslaan…', function (klaar) {
        verstuur('ritkosten', {
          id: rit.id,
          brandstof: brandstof.invoer.value,
          tol: tol.invoer.value,
          overig: overig.invoer.value
        }).then(function (data) {
          ververs(data.rit);
          meldApp('');
          klaar(true);
        }).catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    lijf.appendChild(knop);

    blok.appendChild(lijf);
    return blok;
  }

  function tekenOpdracht(o) {
    var kaart = maak('details', 'kaart');
    kaart.open = true;

    var kop = maak('summary', 'kaart__kop');
    kop.appendChild(maak('span', 'kaart__merk' + merkKlasse(o.type), kort(o.type)));

    var hoofd = maak('div', 'kaart__hoofd');
    hoofd.appendChild(maak('div', 'kaart__titel', o.klant || o.naam || 'Opdracht'));
    hoofd.appendChild(maak('div', 'kaart__regel',
      (o.ophaal || '?') + '  \u2192  ' + (o.aflever || '?')));
    if (o.datum) {
      hoofd.appendChild(maak('div', 'kaart__regel',
        'Gewenst: ' + datumKort(o.datum) + (o.tijd ? ' om ' + o.tijd : '')));
    }
    kop.appendChild(hoofd);
    kaart.appendChild(kop);

    var lijf = maak('div', 'kaart__lijf');

    var dl = paarLijst([
      ['Opdracht', o.naam],
      ['Referentie', o.referentie],
      ['Ophalen', o.ophaal],
      ['Bezorgen', o.aflever],
      ['Opmerking', o.opmerking]
    ]);
    if (dl) { lijf.appendChild(dl); }

    if (!o.heeftKlant) {
      var waarschuwing = maak('div', 'bewijs bewijs--mist');
      var t = maak('div');
      t.appendChild(maak('b', '', 'Nog geen klant gekoppeld'));
      t.appendChild(document.createTextNode(
        'Inplannen mag, maar zonder klant komt er later geen factuur uit.'));
      waarschuwing.appendChild(t);
      lijf.appendChild(waarschuwing);

      var koppel = maak('button', 'knop knop--rand', 'Klant koppelen');
      koppel.type = 'button';
      koppel.addEventListener('click', function () { openKlantblad(o); });
      lijf.appendChild(koppel);
    }

    if (o.heeftKlant && o.klantId) {
      tekenUitnodiging(lijf, o.klantId);
    }

    /* Datum vooraf gevuld met de gewenste datum van de klant, kilometers met
       de schatting van de website. Allebei negen van de tien keer goed, en
       allebei aanpasbaar voordat je op Inplannen tikt. */
    var rij = maak('div', 'velrij');

    var datumVeld = maak('label', 'veld');
    datumVeld.style.margin = '0';
    datumVeld.appendChild(maak('span', '', 'Rijden op'));
    var invoer = document.createElement('input');
    invoer.type = 'date';
    invoer.value = o.datum || dag;
    datumVeld.appendChild(invoer);
    rij.appendChild(datumVeld);

    var kmVeld = getalVeld('Kilometers', o.km);
    var kmInvoer = kmVeld.invoer;
    rij.appendChild(kmVeld);

    lijf.appendChild(rij);

    var tijdVeld = maak('label', 'veld');
    tijdVeld.style.margin = '0';
    tijdVeld.appendChild(maak('span', '', 'Hoe laat ben je er?'));
    var tijdInvoer = document.createElement('input');
    tijdInvoer.type = 'time';
    tijdInvoer.value = o.tijd || '';
    tijdVeld.appendChild(tijdInvoer);
    rij.appendChild(tijdVeld);

    var stopRij = maak('div', 'velrij');
    var stopVeld = getalVeld('Extra stops', o.stops);
    stopRij.appendChild(stopVeld);
    var tvVeld = tijdvakVeld(o.tijdvak);
    stopRij.appendChild(tvVeld);
    lijf.appendChild(stopRij);
    lijf.appendChild(maak('div', 'terzijde',
      '€ 25 per extra adres onderweg. Avond + € 15, nacht of weekend + € 35. ' +
      'Zo stond het in de prijs die de klant op de site zag.'));

    var opdrachtLink = afstandLink(o.ophaal, o.aflever);
    if (opdrachtLink) { lijf.appendChild(opdrachtLink); }

    if (!o.km) {
      var geenKm = maak('div', 'bewijs bewijs--mist');
      var gkm = maak('div');
      gkm.appendChild(maak('b', '', 'Geen kilometers bekend'));
      gkm.appendChild(document.createTextNode(
        'Vul ze hierboven in. Zonder kilometers rekent de factuur alleen het ' +
        'starttarief en valt hij terug op het minimum van \u20ac 75.'));
      geenKm.appendChild(gkm);
      lijf.appendChild(geenKm);
    }

    var plan = maak('button', 'knop knop--blauw', 'Inplannen');
    plan.type = 'button';
    plan.addEventListener('click', function () {
      planIn(o, {
        datum: invoer.value,
        km: kmInvoer.value,
        stops: stopVeld.invoer.value,
        tijdvak: tvVeld.invoer.value,
        tijd: tijdInvoer.value
      }, plan);
    });
    lijf.appendChild(plan);

    kaart.appendChild(lijf);
    return kaart;
  }

  /* Een vaste klant kan zijn eigen zendingen en facturen volgen op /klant/.
     De mail met zijn persoonlijke link gaat niet vanaf deze telefoon de deur
     uit: de Worker zet een vinkje om en Airtable verstuurt hem. Daardoor komt
     de toegangscode van de klant hier nooit langs. */
  function tekenUitnodiging(lijf, klantId) {
    var klant = klanten.filter(function (k) { return k.id === klantId; })[0];

    if (klant && !klant.email) {
      var mist = maak('div', 'bewijs bewijs--mist');
      var mt = maak('div');
      mt.appendChild(maak('b', '', 'Geen e-mailadres'));
      mt.appendChild(document.createTextNode(
        'Zonder e-mailadres kan deze klant geen uitnodiging voor zijn eigen ' +
        'overzicht krijgen. Vul het aan in Airtable bij de klant.'));
      mist.appendChild(mt);
      lijf.appendChild(mist);
      return;
    }

    var net = uitnodigingen[klantId];
    if (net) {
      var goed = maak('div', 'bewijs');
      var gt = maak('div');
      gt.appendChild(maak('b', '', 'Uitnodiging verstuurd'));
      gt.appendChild(document.createTextNode('De link met zijn eigen overzicht gaat naar ' + net + '.'));
      goed.appendChild(gt);
      lijf.appendChild(goed);
    } else if (klant && klant.uitgenodigd) {
      var eerder = maak('div', 'terzijde');
      eerder.textContent = 'Al uitgenodigd op ' +
        datumKort(String(klant.uitgenodigd).slice(0, 10)) +
        ' om ' + klok(klant.uitgenodigd) + '.';
      lijf.appendChild(eerder);
    }

    var knop = maak('button', 'knop knop--rand',
      (net || (klant && klant.uitgenodigd))
        ? 'Uitnodigingslink opnieuw sturen'
        : 'Verstuur uitnodigingslink');
    knop.type = 'button';
    knop.addEventListener('click', function () {
      bezig(knop, 'Versturen\u2026', function (klaar) {
        verstuur('uitnodiging', { klantId: klantId }).then(function (data) {
          if (data.klant) {
            klanten = klanten.map(function (k) {
              return k.id === data.klant.id ? data.klant : k;
            });
          }
          uitnodigingen[klantId] = data.email || 'de klant';
          meldApp('');
          tekenPlanning();
        }).catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    lijf.appendChild(knop);
  }

  function planIn(o, gegevens, knop) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gegevens.datum || '')) {
      meldApp('Kies eerst een datum om op te rijden.');
      return;
    }
    bezig(knop, 'Inplannen…', function (klaar) {
      verstuur('planrit', {
        id: o.id, datum: gegevens.datum, km: gegevens.km,
        stops: gegevens.stops, tijdvak: gegevens.tijdvak, tijd: gegevens.tijd
      })
        .then(function (data) {
          opdrachten = opdrachten.filter(function (x) { return x.id !== o.id; });
          if (data.rit && data.rit.datum === dag) { ritten = ritten.concat([data.rit]); }
          tekenAlles();
          meldApp('');
          kiesTab('ritten');
          if (data.rit && data.rit.datum !== dag) {
            dag = data.rit.datum;
            haalDag();
          }
          klaar(true);
        }).catch(function (fout) { meldApp(fout.message); klaar(false); });
    });
  }

  /* Eén plek voor "knop uit, tekst wijzigen, daarna weer aan". Zonder dit
     kun je onderweg twee keer op dezelfde knop drukken en krijg je twee
     ritten of twee opdrachten. */
  function bezig(knop, tekst, werk) {
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = tekst;
    werk(function (gelukt) {
      if (!gelukt) {
        knop.disabled = false;
        knop.textContent = oud;
      }
    });
  }

  /* --------------------------------------------------------- klantblad */

  var klantSoort = 'opdracht';

  function openKlantblad(o, soort) {
    klantVoor = o;
    klantSoort = soort || 'opdracht';
    el('klant-opdracht').textContent =
      (klantSoort === 'rit' ? 'Rit: ' : '') + (o.naam || 'Opdracht');
    meldKlant('');

    var keuze = el('klant-keuze');
    keuze.innerHTML = '';
    if (!klanten.length) {
      keuze.appendChild(maak('option', '', 'Nog geen klanten'));
      keuze.disabled = true;
      el('klant-koppel').disabled = true;
    } else {
      keuze.disabled = false;
      el('klant-koppel').disabled = false;
      klanten.forEach(function (k) {
        var optie = maak('option', '', k.naam || '(zonder naam)');
        optie.value = k.id;
        keuze.appendChild(optie);
      });
    }

    /* Bedrijfsnaam uit de aanvraag vast invullen: negen van de tien keer is
       dat de naam die de klant zelf gebruikt. */
    el('klant-naam').value = o.klant || '';
    ['klant-adres', 'klant-telefoon', 'klant-email', 'klant-termijn']
      .forEach(function (id) { el(id).value = ''; });

    el('klantdoek').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function sluitKlantblad() {
    el('klantdoek').hidden = true;
    document.body.style.overflow = '';
    klantVoor = null;
  }

  function meldKlant(tekst) {
    var m = el('klant-melding');
    m.textContent = tekst || '';
    m.hidden = !tekst;
  }

  el('klant-terug').addEventListener('click', sluitKlantblad);

  el('klant-koppel').addEventListener('click', function () {
    if (!klantVoor) { return; }
    var klantId = el('klant-keuze').value;
    if (!klantId) { meldKlant('Kies eerst een klant.'); return; }
    bezig(el('klant-koppel'), 'Koppelen…', function (klaar) {
      verstuur('koppelklant', { id: klantVoor.id, klantId: klantId, soort: klantSoort })
        .then(function (data) {
          klantGekoppeld(data.opdracht, data.rit);
          klaar(true);
        })
        .catch(function (fout) { meldKlant(fout.message); klaar(false); });
    });
  });

  el('klant-nieuw').addEventListener('click', function () {
    if (!klantVoor) { return; }
    var naam = el('klant-naam').value.trim();
    if (naam.length < 2) {
      meldKlant('Vul een bedrijfsnaam in.');
      el('klant-naam').focus();
      return;
    }
    bezig(el('klant-nieuw'), 'Aanmaken…', function (klaar) {
      verstuur('nieuweklant', {
        opdrachtId: klantSoort === 'opdracht' ? klantVoor.id : '',
        ritId:      klantSoort === 'rit' ? klantVoor.id : '',
        naam: naam,
        adres: el('klant-adres').value.trim(),
        telefoon: el('klant-telefoon').value.trim(),
        email: el('klant-email').value.trim(),
        termijn: el('klant-termijn').value.trim()
      }).then(function (data) {
        if (data.klant) { klanten = klanten.concat([data.klant]); }
        klantGekoppeld(data.opdracht, data.rit);
        klaar(true);
      }).catch(function (fout) { meldKlant(fout.message); klaar(false); });
    });
  });

  function klantGekoppeld(nieuweOpdracht, nieuweRit) {
    if (nieuweOpdracht) {
      opdrachten = opdrachten.map(function (o) {
        return o.id === nieuweOpdracht.id ? nieuweOpdracht : o;
      });
    }
    if (nieuweRit) {
      ritten = ritten.map(function (r) {
        return r.id === nieuweRit.id ? nieuweRit : r;
      });
    }
    sluitKlantblad();
    tekenPlanning();
    tekenLijst();
  }

  /* --------------------------------------------------------- tekenblad */

  var doekje = el('doekje');
  var penseel = doekje.getContext('2d');
  var tekent = false;
  var heeftInkt = false;

  function pasDoekjeAan() {
    var breed = doekje.clientWidth;
    var hoog = doekje.clientHeight;
    var dichtheid = window.devicePixelRatio || 1;
    doekje.width = Math.round(breed * dichtheid);
    doekje.height = Math.round(hoog * dichtheid);
    penseel.setTransform(dichtheid, 0, 0, dichtheid, 0, 0);
    /* Wit invullen: een doorzichtige PNG is in Airtable op een donkere
       achtergrond niet te zien, en een handtekening moet altijd leesbaar zijn. */
    penseel.fillStyle = '#ffffff';
    penseel.fillRect(0, 0, breed, hoog);
    penseel.strokeStyle = '#0b1526';
    penseel.lineWidth = 2.4;
    penseel.lineCap = 'round';
    penseel.lineJoin = 'round';
    heeftInkt = false;
    el('teken-hint').hidden = false;
  }

  function punt(e) {
    var vak = doekje.getBoundingClientRect();
    return { x: e.clientX - vak.left, y: e.clientY - vak.top };
  }

  doekje.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    doekje.setPointerCapture(e.pointerId);
    tekent = true;
    heeftInkt = true;
    el('teken-hint').hidden = true;
    var p = punt(e);
    penseel.beginPath();
    penseel.moveTo(p.x, p.y);
    /* Een tik zonder beweging moet ook een stip geven. */
    penseel.lineTo(p.x + 0.1, p.y);
    penseel.stroke();
  });
  doekje.addEventListener('pointermove', function (e) {
    if (!tekent) { return; }
    e.preventDefault();
    var p = punt(e);
    penseel.lineTo(p.x, p.y);
    penseel.stroke();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (soort) {
    doekje.addEventListener(soort, function () { tekent = false; });
  });

  function openTekenblad(rit) {
    tekentVoor = rit;
    el('blad-rit').textContent =
      (rit.klant || rit.naam || 'Rit') + ' — ' + (rit.aflever || '');
    el('teken-naam').value = rit.getekend || '';
    meldBlad('');
    el('doek').hidden = false;
    document.body.style.overflow = 'hidden';
    /* Pas meten als het blad echt in beeld staat, anders is de breedte nul. */
    requestAnimationFrame(pasDoekjeAan);
  }

  function sluitTekenblad() {
    el('doek').hidden = true;
    document.body.style.overflow = '';
    tekentVoor = null;
  }

  function meldBlad(tekst) {
    var m = el('blad-melding');
    m.textContent = tekst || '';
    m.hidden = !tekst;
  }

  el('teken-wis').addEventListener('click', pasDoekjeAan);
  el('teken-terug').addEventListener('click', sluitTekenblad);

  el('teken-klaar').addEventListener('click', function () {
    if (!tekentVoor) { return; }
    var naam = el('teken-naam').value.trim();
    if (naam.length < 2) {
      meldBlad('Vul in wie er getekend heeft.');
      el('teken-naam').focus();
      return;
    }
    if (!heeftInkt) {
      meldBlad('Er staat nog geen handtekening in het vak.');
      return;
    }

    var knop = el('teken-klaar');
    knop.disabled = true;
    knop.textContent = 'Opslaan…';
    meldBlad('');

    verstuur('handtekening', {
      id: tekentVoor.id,
      naam: naam,
      data: doekje.toDataURL('image/png')
    }).then(function (data) {
      ververs(data.rit);
      if (data.handtekening) {
        sluitTekenblad();
      } else {
        /* De rit staat nu wel op uitgevoerd, maar de krabbel is niet
           opgeslagen. Dat moet je weten, niet ontdekken bij een geschil. */
        meldBlad('De rit staat op uitgevoerd, maar de handtekening is niet ' +
                 'opgeslagen. Laat opnieuw tekenen en probeer het nog eens.');
      }
    }).catch(function (fout) {
      meldBlad(fout.message);
    }).then(function () {
      knop.disabled = false;
      knop.textContent = 'Afgeleverd en getekend';
    });
  });

  window.addEventListener('resize', function () {
    if (!el('doek').hidden && !heeftInkt) { pasDoekjeAan(); }
  });

  /* ---------------------------------------------------------- opstarten */

  try {
    code = localStorage.getItem(CONFIG.sleutel) || '';
    adres = CONFIG.portaalUrl || localStorage.getItem(CONFIG.sleutelAdres) || '';
  } catch (e) {
    code = '';
    adres = CONFIG.portaalUrl;
  }
  vulSlotIn();

  if (code && waarheen()) {
    el('slot').hidden = true;
    el('app').hidden = false;
    haalDag();
  } else {
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
  }
})();
