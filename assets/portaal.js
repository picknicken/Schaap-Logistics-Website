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
  /* De kilometerstand van de dag die op het scherm staat. Null zolang de
     tussenlaag er nog niet van weet: dan blijft het hele blok weg. */
  var dagstaat = null;
  /* De ritten van een ruimer venster dan de dag op het scherm, alleen voor de
     meldingen. Bewust apart van `ritten`, anders zou de dagweergave er ineens
     ritten van volgende week bij krijgen. */
  var meldRitten = [];
  var meldingen = [];
  /* De publieke pushsleutel komt van de tussenlaag mee, niet uit dit bestand.
     Zo hoef je na het instellen van de sleutels de site niet opnieuw uit te
     rollen. Leeg betekent: pushmeldingen zijn nog niet ingesteld. */
  var pushSleutel = '';
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
  /* Wanneer iets binnenkwam, zoals je het aan iemand zou zeggen: vandaag alleen
     de tijd, gisteren het woord, en daarvoor de datum erbij. */
  function moment(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    var dagVan = alsDatum(d);
    if (dagVan === vandaag()) { return 'Vandaag ' + klok(iso); }
    if (dagVan === verschuif(vandaag(), -1)) { return 'Gisteren ' + klok(iso); }
    return datumKort(dagVan) + ' ' + klok(iso);
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
    /* Het plakvak alleen laten zien als de tussenlaag een sleutel heeft. */
    var vak = el('plakvak');
    if (vak) { vak.hidden = !(data && data.kan && data.kan.leesbericht); }

    if (data && data.pushSleutel !== undefined) { pushSleutel = data.pushSleutel || ''; }
    tekenPushvak(!!(data && data.kan && data.kan.push));

    /* Wie is er ingelogd. Een chauffeur ziet alleen zijn eigen ritten, dus de
       twee andere tabbladen zouden bij hem altijd leeg zijn — die halen we weg
       in plaats van ze leeg te laten staan. De tussenlaag houdt hem daar toch
       al buiten; dit is alleen om hem niet tegen een dichte deur te laten
       lopen. */
    var ik = (data && data.ik) || null;
    var alleenRitten = !!ik && ik.rol !== 'Eigenaar';
    /* Meldingen gaan over aanvragen, klanten en facturen — jouw bedrijfsvoering.
       Een chauffeur heeft daar niets te zoeken, dus dat tabblad gaat mee weg. */
    ['tab-aanvragen', 'tab-planning', 'tab-meldingen'].forEach(function (id) {
      var t = el(id);
      if (t) { t.hidden = alleenRitten; }
    });
    if (alleenRitten && tabblad !== 'ritten') { kiesTab('ritten'); }

    var wieVak = el('kop-wie');
    if (wieVak) {
      wieVak.textContent = ik && ik.naam && ik.naam !== 'Eigenaar' ? ik.naam : '';
      wieVak.hidden = !wieVak.textContent;
    }

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
    /* Alleen bij een dagwissel komt de dagstaat mee. Bij een losse
       rittenoproep niet — dan houden we wat we al hadden staan, zodat een
       half ingetypte stand niet onder je handen wegvalt. */
    if (data.dagstaat !== undefined) {
      dagstaat = data.dagstaat || null;
      vulTeller();
    }
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
    tekenAlles();
  }

  function tekenAlles() {
    tekenTegels();
    tekenTeller();
    bouwMeldingen();
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
    badge('badge-meldingen', meldingen.filter(function (m) { return !m.gezien; }).length);
  }

  function badge(id, aantal) {
    var b = el(id);
    b.textContent = aantal;
    b.hidden = !aantal;
  }

  var TABBLADEN = ['ritten', 'aanvragen', 'planning', 'meldingen'];

  function kiesTab(naam) {
    tabblad = naam;
    TABBLADEN.forEach(function (t) {
      el('tab-' + t).setAttribute('aria-selected', String(t === naam));
      el('paneel-' + t).hidden = (t !== naam);
    });
    window.scrollTo(0, 0);
    /* Meldingen halen een ruimer venster op dan de dag die op het scherm
       staat: een rit die volgende week is afgezegd hoor je nu te zien, niet
       pas als je die dag opzoekt. */
    if (naam === 'meldingen') { haalMeldingen(); }
  }

  TABBLADEN.forEach(function (t) {
    el('tab-' + t).addEventListener('click', function () { kiesTab(t); });
  });

  /* De kilometers die je deze dag factureert: van ophaaladres naar
     afleveradres, en niets daarbuiten. Een geannuleerde rit is niet gereden. */
  function dagKilometers() {
    return Math.round(ritten.reduce(function (t, r) {
      return r.status === 'Geannuleerd' ? t : t + (Number(r.km) || 0);
    }, 0));
  }

  function tekenTegels() {
    var open = ritten.filter(function (r) {
      return r.status === 'Gepland' || r.status === 'Onderweg';
    }).length;
    var omzet = ritten.reduce(function (t, r) {
      return r.status === 'Geannuleerd' ? t : t + (Number(r.bedrag) || 0);
    }, 0);

    el('t-ritten').textContent = ritten.length;
    el('t-open').textContent = open;
    el('t-km').textContent = dagKilometers();
    el('t-omzet').textContent = omzet ? euro.format(omzet) : '–';
  }

  /* ------------------------------------------------------- pushmeldingen

     Een melding in de lijst hieronder zie je pas als je het portaal opent. Dit
     laat de telefoon zelf piepen, ook als de app dicht is.

     Twee dingen om te weten. Op een iPhone werkt dit alleen als het portaal op
     je beginscherm staat — in een gewoon Safari-tabblad kan het niet, dat is
     een keuze van Apple. En toestemming vragen mag alleen op een druk op de
     knop; daarom staat er een knop en gebeurt het niet vanzelf. */

  function pushKanHier() {
    return 'serviceWorker' in navigator &&
           'PushManager' in window &&
           typeof Notification !== 'undefined';
  }

  /* De sleutel komt als tekst binnen en de browser wil bytes. */
  function sleutelNaarBytes(tekst) {
    var recht = String(tekst).replace(/-/g, '+').replace(/_/g, '/');
    var heel = recht + new Array((4 - (recht.length % 4)) % 4 + 1).join('=');
    var bin = window.atob(heel);
    var uit = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { uit[i] = bin.charCodeAt(i); }
    return uit;
  }

  function meldPush(tekst, isFout) {
    var m = el('push-melding');
    if (!m) { return; }
    m.textContent = tekst || '';
    m.hidden = !tekst;
    m.className = 'melding' + (tekst && !isFout ? ' melding--goed' : '');
  }

  function huidigAbonnement() {
    if (!pushKanHier()) { return Promise.resolve(null); }
    return navigator.serviceWorker.getRegistration('./')
      .then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; })
      .catch(function () { return null; });
  }

  /* Waar dit apparaat op lijkt, zodat je twee telefoons uit elkaar houdt.
     Bewust grof: het hele browsermerk zegt niets extra's en is lang. */
  function apparaatnaam() {
    var ua = navigator.userAgent || '';
    var soort = /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
      : /Macintosh/.test(ua) ? 'Mac'
      : /Windows/.test(ua) ? 'Windows' : 'Apparaat';
    return soort + ' — ' + datumLang(vandaag());
  }

  function tekenPushvak(mag) {
    var vak = el('pushvak');
    if (!vak) { return; }
    /* Verbergen als de tussenlaag geen sleutels heeft of deze browser het niet
       kan. Een knop die niets doet is erger dan geen knop. */
    vak.hidden = !mag || !pushKanHier();
    if (vak.hidden) { return; }

    huidigAbonnement().then(function (ab) {
      var aan = !!ab && Notification.permission === 'granted';
      el('push-stand').hidden = !aan;
      el('push-aan').hidden = aan;
      el('push-proef').hidden = !aan;
      el('push-uit').hidden = !aan;

      if (Notification.permission === 'denied') {
        el('push-aan').hidden = true;
        meldPush('Je hebt meldingen voor deze pagina geweigerd. Dat zet je aan ' +
                 'in de instellingen van je telefoon, bij Meldingen.', true);
      }
    });
  }

  function pushAanzetten() {
    var knop = el('push-aan');
    knop.disabled = true;
    knop.textContent = 'Even wachten…';
    meldPush('');

    navigator.serviceWorker.register('./sw.js')
      .then(function (reg) {
        return navigator.serviceWorker.ready.then(function () {
          return Notification.requestPermission().then(function (antwoordJa) {
            if (antwoordJa !== 'granted') {
              throw new Error('Zonder toestemming kan je telefoon niet piepen. ' +
                              'Staat het portaal op je beginscherm?');
            }
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: sleutelNaarBytes(pushSleutel)
            });
          });
        });
      })
      .then(function (ab) {
        var j = ab.toJSON();
        return verstuur('pushaan', {
          endpoint: j.endpoint,
          p256dh: j.keys && j.keys.p256dh,
          auth: j.keys && j.keys.auth,
          apparaat: apparaatnaam()
        });
      })
      .then(function () {
        meldPush('Meldingen staan aan op dit apparaat.');
        tekenPushvak(true);
      })
      .catch(function (fout) {
        meldPush(fout.message || 'Aanzetten lukte niet.', true);
      })
      .then(function () {
        knop.disabled = false;
        knop.textContent = 'Meldingen aanzetten';
      });
  }

  function pushUitzetten() {
    var knop = el('push-uit');
    knop.disabled = true;
    meldPush('');
    huidigAbonnement().then(function (ab) {
      if (!ab) { return null; }
      var endpoint = ab.endpoint;
      /* Eerst de tussenlaag, dan pas de telefoon. Andersom zouden we het adres
         niet meer weten om af te melden en bleef er een dode regel staan. */
      return verstuur('pushuit', { endpoint: endpoint })
        .then(function () { return ab.unsubscribe(); });
    })
      .then(function () {
        meldPush('Meldingen staan uit op dit apparaat.');
        tekenPushvak(true);
      })
      .catch(function (fout) { meldPush(fout.message, true); })
      .then(function () { knop.disabled = false; });
  }

  if (el('push-aan')) {
    el('push-aan').addEventListener('click', pushAanzetten);
    el('push-uit').addEventListener('click', pushUitzetten);
    el('push-proef').addEventListener('click', function () {
      var knop = el('push-proef');
      knop.disabled = true;
      meldPush('');
      verstuur('pushtest', {})
        .then(function () { meldPush('Verstuurd. Hij hoort er zo te zijn.'); })
        .catch(function (fout) { meldPush(fout.message, true); })
        .then(function () { knop.disabled = false; });
    });
  }

  /* ------------------------------------------------------------ meldingen

     Wat vroeger per mail kwam. Twee van de berichten die Airtable verstuurde
     gingen naar jou en niet naar een klant: er is een aanvraag binnen, en een
     klant heeft afgezegd. Dat hoeft geen mail te zijn — en elke mail kost een
     automatiseringsrun waarvan je er honderd per maand hebt.

     Daar staan drie waarschuwingen bij die er nooit waren en die geen enkele
     mail waard zouden zijn, maar wel geld kosten als je ze mist: een rit
     zonder klant kun je niet factureren, een rit die op Onderweg blijft staan
     levert nooit een factuur op, en een rit van morgen zonder ophaaltijd
     betekent dat de klant niet weet hoe laat je komt.

     Let op wat dit níét is: een melding komt pas binnen als je het portaal
     opent. Een mail piept op je telefoon. Voor een spoedaanvraag is dat een
     verschil dat geld kost — zie OPENSTAAND.md. */

  var MELD_SLEUTEL = 'sl-meldingen-gezien';

  /* Welke meldingen je al gezien hebt, in de telefoon zelf. Dit hoort niet in
     Airtable: het is per apparaat en het is niets waard voor iemand anders. */
  function gezienLijst() {
    try {
      var ruw = window.localStorage.getItem(MELD_SLEUTEL);
      var lijst = ruw ? JSON.parse(ruw) : [];
      return Array.isArray(lijst) ? lijst : [];
    } catch (e) { return []; }
  }

  function bewaarGezien(lijst) {
    try {
      /* Niet eindeloos laten groeien: de laatste tweehonderd is ruim genoeg om
         te onthouden wat je gezien hebt, en de rest is toch verlopen. */
      window.localStorage.setItem(MELD_SLEUTEL, JSON.stringify(lijst.slice(-200)));
    } catch (e) { /* privémodus of vol; dan zie je een melding twee keer */ }
  }

  function haalMeldingen() {
    verstuur('ritten', { van: verschuif(vandaag(), -14), tot: verschuif(vandaag(), 31) })
      .then(function (data) {
        meldRitten = data.ritten || [];
        bouwMeldingen();
        tekenMeldingen();
        tekenBadges();
      })
      .catch(function () {
        /* Zonder het ruimere venster blijft de lijst staan op wat we al
           hadden. Beter dan een leeg scherm met een foutmelding erin. */
        bouwMeldingen();
        tekenMeldingen();
      });
  }

  function spoedig(soort) {
    return /spoed|direct/i.test(String(soort || ''));
  }

  function bouwMeldingen() {
    var gezien = gezienLijst();
    var nu = vandaag();
    var morgen = verschuif(nu, 1);
    var uit = [];

    /* Waar de dagweergave en het ruimere venster elkaar overlappen, wint het
       ruimere venster: dat is het verst bijgewerkt. */
    var alle = meldRitten.length ? meldRitten.slice() : ritten.slice();
    if (meldRitten.length) {
      var bekend = {};
      meldRitten.forEach(function (r) { bekend[r.id] = true; });
      ritten.forEach(function (r) { if (!bekend[r.id]) { alle.push(r); } });
    }

    /* Een klant die vier keer heeft gereden is geen eenmalige meer. Zonder dit
       seintje verwatert het onderscheid: je zet niemand om, iedereen blijft
       eenmalig, en het veld zegt niets meer. */
    klanten.forEach(function (k) {
      if (k.soort === 'Vaste klant' || (k.ritten || 0) < 4) { return; }
      uit.push({
        sleutel: 'vasteklant:' + k.id + ':' + k.ritten,
        klasse: 'meld--let',
        titel: 'Geen eenmalige klant meer',
        regel: k.naam + ' heeft ' + k.ritten + ' ritten gereden en staat nog ' +
               'als eenmalig. Als vaste klant krijgt hij een eigen overzicht ' +
               'en een langere betalingstermijn.',
        wanneer: '',
        tab: 'planning'
      });
    });

    aanvragen.forEach(function (a) {
      uit.push({
        sleutel: 'aanvraag:' + a.id,
        klasse: spoedig(a.dienst) ? 'meld--urgent' : 'meld--let',
        titel: (spoedig(a.dienst) ? 'SPOED: ' : '') + 'Nieuwe aanvraag',
        regel: (a.bedrijf || a.contact || 'Onbekend') + ' — ' +
               (a.ophaal || a.ophaalpc || '?') + ' \u2192 ' + (a.aflever || a.afleverpc || '?'),
        wanneer: a.binnen || '',
        tab: 'aanvragen'
      });
    });

    alle.forEach(function (r) {
      if (r.afgezegdDoorKlant) {
        uit.push({
          sleutel: 'afgezegd:' + r.id + ':' + (r.afgezegdOp || ''),
          klasse: 'meld--urgent',
          titel: 'Klant heeft afgezegd',
          regel: (r.klant || r.naam || 'Rit') + ' op ' + datumKort(r.datum) +
                 (r.afzegreden ? ' — ' + r.afzegreden : ''),
          wanneer: r.afgezegdOp || '',
          tab: 'ritten',
          dag: r.datum
        });
        return;
      }
      if (r.status === 'Geannuleerd') { return; }

      /* Blijft op Onderweg staan terwijl de dag voorbij is: dan is de rit nooit
         afgerond en komt er ook nooit een factuur. */
      if (r.status === 'Onderweg' && r.datum && r.datum < nu) {
        uit.push({
          sleutel: 'onderweg:' + r.id + ':' + r.datum,
          klasse: 'meld--urgent',
          titel: 'Rit staat nog op Onderweg',
          regel: (r.klant || r.naam || 'Rit') + ' van ' + datumKort(r.datum) +
                 ' is nooit afgerond. Er komt dus geen factuur.',
          wanneer: '', tab: 'ritten', dag: r.datum
        });
      }

      /* Geen klant eraan: dan kun je hem niet factureren. Alleen melden bij
         ritten die nog moeten of net geweest zijn — een oude rit zonder klant
         is meestal een proefrit. */
      if (!r.klant && r.datum >= verschuif(nu, -7)) {
        uit.push({
          sleutel: 'geenklant:' + r.id,
          klasse: 'meld--let',
          titel: 'Rit zonder klant',
          regel: (r.naam || 'Rit') + ' op ' + datumKort(r.datum) +
                 ' hangt aan niemand. Zo kun je er geen factuur van maken.',
          wanneer: '', tab: 'ritten', dag: r.datum
        });
      }

      if (r.datum === morgen && !r.tijd && r.status === 'Gepland') {
        uit.push({
          sleutel: 'geentijd:' + r.id,
          klasse: 'meld--let',
          titel: 'Morgen een rit zonder ophaaltijd',
          regel: (r.klant || r.naam || 'Rit') +
                 ' — de klant weet niet hoe laat je komt.',
          wanneer: '', tab: 'ritten', dag: r.datum
        });
      }
    });

    /* Het dringendste bovenaan, en binnen dezelfde soort het nieuwste eerst.
       Let op de rang: die van urgent is nul, en nul is onwaar. Met `|| 2`
       erachter zou het dringendste juist onderaan belanden. */
    var rang = { 'meld--urgent': 0, 'meld--let': 1 };
    var rangVan = function (m) {
      return Object.prototype.hasOwnProperty.call(rang, m.klasse) ? rang[m.klasse] : 2;
    };
    uit.sort(function (a, b) {
      var v = rangVan(a) - rangVan(b);
      return v !== 0 ? v : String(b.wanneer || '').localeCompare(String(a.wanneer || ''));
    });

    uit.forEach(function (m) { m.gezien = gezien.indexOf(m.sleutel) >= 0; });
    meldingen = uit;
  }

  function tekenMeldingen() {
    var lijst = el('lijst-meldingen');
    if (!lijst) { return; }
    lijst.innerHTML = '';

    if (!meldingen.length) {
      lijst.appendChild(maak('div', 'leeg',
        'Niets wat je aandacht vraagt. Geen open aanvragen, geen afzeggingen, ' +
        'en elke rit hangt aan een klant.'));
      return;
    }

    meldingen.forEach(function (m) {
      var knop = maak('button', 'meld ' + m.klasse);
      knop.type = 'button';
      if (m.gezien) { knop.setAttribute('data-gezien', ''); }
      knop.appendChild(maak('span', 'meld__stip'));

      var lijf = maak('div', 'meld__lijf');
      lijf.appendChild(maak('div', 'meld__titel', m.titel));
      lijf.appendChild(maak('div', 'meld__regel', m.regel));
      if (m.wanneer) {
        lijf.appendChild(maak('div', 'meld__wanneer', moment(m.wanneer)));
      }
      knop.appendChild(lijf);

      /* Aantikken brengt je naar de plek waar je er iets mee kunt: de aanvraag
         zelf, of de dag waarop die rit staat. */
      knop.addEventListener('click', function () {
        markeerGezien(m.sleutel);
        /* Meteen dimmen, niet pas bij de volgende ophaalronde. Kom je terug op
           dit tabblad en staat hij er nog ongelezen bij, dan tik je hem nog
           een keer aan. */
        knop.setAttribute('data-gezien', '');
        if (m.dag && m.dag !== dag) { gaNaar(m.dag); }
        kiesTab(m.tab || 'ritten');
      });
      lijst.appendChild(knop);
    });
  }

  function markeerGezien(sleutel) {
    var gezien = gezienLijst();
    if (gezien.indexOf(sleutel) < 0) {
      gezien.push(sleutel);
      bewaarGezien(gezien);
    }
    meldingen.forEach(function (m) { if (m.sleutel === sleutel) { m.gezien = true; } });
    tekenBadges();
  }

  /* ------------------------------------------------------ kilometerstand

     De tegel Km hierboven telt de ritkilometers op: dat is precies wat er
     gefactureerd wordt. De teller in de bus telt meer — het aanrijden naar de
     eerste klant, het naar huis rijden, omrijden, tanken. Voor een sluitende
     rittenregistratie moeten die twee getallen naast elkaar staan en moet het
     verschil te verklaren zijn. Vandaar dat dit blok het optelsommetje niet
     vervangt maar ernaast zet. */

  function tellerGetal(id) {
    var v = String(el(id).value || '').trim();
    if (!v) { return null; }
    var n = Number(v.replace(',', '.'));
    return isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  /* De velden bijwerken met wat er is opgeslagen. Alleen na een dagwissel of
     na het opslaan — niet bij elke hertekening, want dan zou je eigen typen
     eronder vandaan gepoetst worden. */
  function vulTeller() {
    var vak = el('teller');
    if (!vak) { return; }
    vak.hidden = !dagstaat;
    if (!dagstaat) { return; }
    el('teller-begin').value = dagstaat.begin === null || dagstaat.begin === undefined
      ? '' : dagstaat.begin;
    el('teller-eind').value = dagstaat.eind === null || dagstaat.eind === undefined
      ? '' : dagstaat.eind;
    el('teller-opmerking').value = dagstaat.opmerking || '';
    meldTeller('');
    tekenTeller();
  }

  function tekenTeller() {
    var vak = el('teller');
    if (!vak || vak.hidden) { return; }

    var begin = tellerGetal('teller-begin');
    var eind = tellerGetal('teller-eind');
    var gereden = (begin !== null && eind !== null && eind >= begin) ? eind - begin : null;
    var gefactureerd = dagKilometers();
    var verschil = gereden === null ? null : gereden - gefactureerd;

    el('teller-gereden').textContent = gereden === null ? '–' : gereden;
    el('teller-gefactureerd').textContent = gefactureerd;
    el('teller-onverklaard').textContent = verschil === null ? '–' : verschil;

    /* De regel die je ziet als het blok dicht is. Die moet in één oogopslag
       zeggen of de dag af is. */
    var kop = gereden !== null ? gereden + ' km gereden'
      : begin !== null ? 'begin ' + begin + ', eind nog open'
      : 'nog niet ingevuld';
    el('teller-stand').textContent = kop;

    el('teller-uitleg').textContent = verschil === null
      ? 'Vul begin- en eindstand in, dan zie je hoeveel er naast de ritten is gereden.'
      : verschil < 0
        ? 'De teller zegt minder dan er is gefactureerd. Controleer de eindstand of de ' +
          'kilometers van een rit — dit kan niet kloppen.'
        : 'Die ' + verschil + ' km zijn het aanrijden naar de eerste klant, het rijden ' +
          'naar huis, omrijden en tanken. Leg hieronder vast wat opvalt.';
  }

  function meldTeller(tekst, isFout) {
    var m = el('teller-melding');
    if (!m) { return; }
    m.textContent = tekst || '';
    m.hidden = !tekst;
    m.className = 'melding' + (tekst && !isFout ? ' melding--goed' : '');
  }

  if (el('teller-kop')) {
    el('teller-kop').addEventListener('click', function () {
      var open = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', open ? 'false' : 'true');
      el('teller-body').hidden = open;
      if (!open) { tekenTeller(); }
    });
    ['teller-begin', 'teller-eind'].forEach(function (id) {
      el(id).addEventListener('input', tekenTeller);
    });
    el('teller-opslaan').addEventListener('click', function () {
      var knop = this;
      knop.disabled = true;
      knop.textContent = 'Opslaan…';
      meldTeller('');
      verstuur('dagstaat', {
        dag: dag,
        begin: el('teller-begin').value.trim(),
        eind: el('teller-eind').value.trim(),
        opmerking: el('teller-opmerking').value
      }).then(function (data) {
        dagstaat = data.dagstaat || null;
        vulTeller();
        meldTeller('Kilometerstand opgeslagen.');
      }).catch(function (fout) {
        meldTeller(fout.message, true);
      }).then(function () {
        knop.disabled = false;
        knop.textContent = 'Opslaan';
      });
    });
  }

  /* -------------------------------------------------------------- lijst */

  function maak(soort, klasse, tekst) {
    var e = document.createElement(soort);
    if (klasse) { e.className = klasse; }
    if (tekst !== undefined) { e.textContent = tekst; }
    return e;
  }

  /* ------------------------------------------- de conceptfactuur

     Wat er op de factuur komt te staan als de rit nu zou stoppen. Geen
     opgeslagen document maar de factuurpagina met de gegevens van dit moment
     erin; verandert er iets aan de rit, dan verandert hij mee.

     Dezelfde velden en dezelfde volgorde als de formule Factuurlink in
     Airtable, zodat het concept en de echte factuur niet uit elkaar kunnen
     lopen. Wat er niet in kan zitten zijn de klantgegevens: adres, btw-nummer
     en debiteurnummer staan in Airtable en niet op de ritkaart. Die blijven
     dus leeg tot de factuur er echt is. */
  var TARIEVEN = {
    'Standaard transport':      { start: 75,  km: 1.50 },
    'Spoedtransport':           { start: 100, km: 2.00 },
    'Directe spoed':            { start: 125, km: 2.50 },
    'Internationaal transport': { start: 150, km: 2.00 }
  };

  function conceptLink(rit) {
    var t = TARIEVEN[rit.type] || TARIEVEN['Standaard transport'];
    var km = Number(rit.km) || 0;
    var ritprijs = Math.max(t.start + km * t.km,
                            rit.type === 'Internationaal transport' ? 200 : 75);
    /* De tijdtoeslag rekent hetzelfde als de site en als Airtable: een
       percentage van de ritprijs met een ondergrens. */
    var deel = rit.tijdvak === 'Avondrit (18:00-23:00)' ? 0.20
             : rit.tijdvak === 'Nacht- of weekendrit' ? 0.40 : 0;
    var bodem = deel === 0.20 ? 25 : deel === 0.40 ? 50 : 0;
    var tijd = deel ? Math.round(Math.max(ritprijs * deel, bodem) * 100) / 100 : 0;
    var wacht = Number(rit.wachttijd) || 0;
    var wachttoeslag = Math.ceil(Math.max(0, wacht - 15) / 15) * 15;

    var q = new URLSearchParams();
    q.set('concept', '1');
    /* Geen beheer=1: de balk daaronder legt uit hoe je er een PDF van maakt en
       die in Airtable zet, en dat moet je met een concept juist niet doen. */
    q.set('datum', vandaagIso());
    if (rit.datum) { q.set('ritdatum', rit.datum); }
    if (rit.klant) { q.set('klant', rit.klant); }
    q.set('van', rit.ophaal || '');
    q.set('naar', rit.aflever || '');
    q.set('oms', rit.type || '');
    q.set('km', String(km));
    q.set('kmtarief', String(t.km));
    q.set('start', String(t.start));
    q.set('stops', String(Number(rit.stops) || 0));
    q.set('stoptarief', '25');
    q.set('tijdtoeslag', String(tijd));
    q.set('tijdvak', rit.tijdvak || '');
    q.set('wacht', String(wacht));
    q.set('wachttoeslag', String(wachttoeslag));
    q.set('toeslag', String(Number(rit.doorbereken) || 0));
    q.set('toeslagoms', 'Doorberekende kosten (tol, parkeren, veerpont)');
    q.set('korting', String(Number(rit.korting) || 0));
    q.set('kortingoms', rit.kortingRe || '');
    q.set('termijn', '14');
    return '../factuur/?' + q.toString();
  }

  function vandaagIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  function conceptKnop(rit) {
    var a = maak('a', 'knop knop--rand', 'Bekijk de conceptfactuur');
    a.href = conceptLink(rit);
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
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

  /* Waarom je korting geeft. Vrije tekst, maar met een lijstje suggesties
     eronder: je typt dit met een telefoon in je hand, vaak op straat, en dan
     wil je niet drie woorden hoeven uitspellen. */
  var KORTINGREDENEN = [
    'Te laat aangekomen',
    'Zending kon niet in een keer mee',
    'Schade aan de zending',
    'Coulance'
  ];

  function redenVeld(waarde) {
    var veld = maak('label', 'veld');
    veld.style.margin = '0';
    veld.appendChild(maak('span', '', 'Reden (komt op de factuur)'));
    var invoer = document.createElement('input');
    invoer.type = 'text';
    invoer.maxLength = 120;
    invoer.value = waarde || '';
    invoer.placeholder = 'Bijvoorbeeld: te laat aangekomen';
    invoer.setAttribute('list', 'kortingredenen');
    veld.appendChild(invoer);
    if (!document.getElementById('kortingredenen')) {
      var lijst = document.createElement('datalist');
      lijst.id = 'kortingredenen';
      KORTINGREDENEN.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r;
        lijst.appendChild(o);
      });
      document.body.appendChild(lijst);
    }
    veld.invoer = invoer;
    return veld;
  }

  /* Hetzelfde, maar met een keuzelijst. De drie tijdvakken staan hier bewust
     letterlijk: het zijn dezelfde namen als in Airtable en op de website, en
     aan elk hangt een bedrag. */
  /* Dezelfde vier namen als in Airtable en op de website. Aan elk hangt een
     tarief; een verzonnen naam levert een rit op zonder prijs. */
  var RITSOORTEN = [
    'Standaard transport',
    'Spoedtransport',
    'Directe spoed',
    'Internationaal transport'
  ];

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

    /* --- de klant heeft zelf afgezegd --- */
    if (rit.afgezegdDoorKlant) {
      var afzeg = maak('div', 'bewijs bewijs--mist');
      var afzegT = maak('div');
      afzegT.appendChild(maak('b', '', 'Door de klant afgezegd'));
      afzegT.appendChild(document.createTextNode(
        (rit.afgezegdOp ? 'In het klantportaal op ' + datumKort(rit.afgezegdOp) +
          ' om ' + klok(rit.afgezegdOp) + '. ' : 'In het klantportaal. ') +
        (rit.afzegreden ? 'Reden: ' + rit.afzegreden :
          'Er is geen reden opgegeven.')
      ));
      afzeg.appendChild(afzegT);
      lijf.appendChild(afzeg);
    }

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

      /* Korting staat apart van de rest. Alles hierboven maakt de rit duurder;
         dit is het enige dat er geld af haalt, en het hoort een bewuste
         handeling te zijn en geen veld waar je per ongeluk in typt. */
      var kortRij = maak('div', 'velrij');
      var kortVeld = euroVeld('Korting', rit.korting);
      var redenVeldRit = redenVeld(rit.kortingRe);
      kortRij.appendChild(kortVeld);
      kortRij.appendChild(redenVeldRit);
      lijf.appendChild(kortRij);
      lijf.appendChild(maak('div', 'terzijde',
        'Ging er iets mis — te laat aangekomen, of niet alles kon mee — dan haal ' +
        'je hier wat van de prijs af. Het komt als eigen regel op de factuur, met ' +
        'jouw reden erbij, zodat de klant ziet dat je het hebt rechtgezet. Vul het ' +
        'in vóórdat je de rit op Uitgevoerd zet: dan wordt de factuur gemaakt.'));

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
            doorbereken: doorVeld.invoer.value,
            korting: kortVeld.invoer.value,
            kortingRe: redenVeldRit.invoer.value
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

    /* Op elk moment van de rit kunnen zien wat de factuur wordt. Niet alleen
       aan het eind: juist onderweg wil je weten of die wachttijd van veertig
       minuten en die tol er goed op staan, want daarna is de rit uitgevoerd en
       staat de factuur er. */
    knoppen.appendChild(conceptKnop(rit));

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

    /* Ook bij een aanvraag die je nog niet hebt aangenomen: wat zou deze rit
       opleveren? Dat wil je weten voordat je ja zegt, niet erna. De aanvraag
       heeft dezelfde velden onder andere namen. */
    knoppen.appendChild(conceptKnop({
      type: a.dienst, km: a.afstand, stops: a.stops, tijdvak: a.tijdvak,
      ophaal: a.ophaal, aflever: a.aflever, klant: a.bedrijf,
      datum: a.datum, wachttijd: 0, doorbereken: 0, korting: 0, kortingRe: ''
    }));

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

    /* Bovenaan, niet onderaan: werk dat telefonisch binnenkomt is meestal
       spoed, en dan wil je niet eerst langs een lijst met opdrachten. */
    var nieuw = maak('button', 'knop knop--rand', '+ Rit buiten de website om');
    nieuw.type = 'button';
    nieuw.style.width = '100%';
    nieuw.addEventListener('click', openNieuweRit);
    lijst.appendChild(nieuw);

    if (!opdrachten.length) {
      lijst.appendChild(maak('div', 'leeg',
        'Niets in te plannen. Elke opdracht heeft een rit.'));
      return;
    }
    opdrachten.forEach(function (o) { lijst.appendChild(tekenOpdracht(o)); });
  }

  /* ------------------------------------------- rit buiten de website om */

  function meldNieuweRit(tekst) {
    var m = el('nieuwrit-melding');
    m.textContent = tekst || '';
    m.hidden = !tekst;
  }

  function openNieuweRit() {
    meldNieuweRit('');

    var soort = el('nieuwrit-type');
    soort.innerHTML = '';
    RITSOORTEN.forEach(function (naam) {
      var o = maak('option', '', naam);
      o.value = naam;
      soort.appendChild(o);
    });
    soort.value = 'Spoedtransport';

    var tv = el('nieuwrit-tijdvak');
    tv.innerHTML = '';
    TIJDVAKKEN.forEach(function (paar) {
      var o = maak('option', '', paar[1]);
      o.value = paar[0];
      tv.appendChild(o);
    });

    var kk = el('nieuwrit-klant');
    kk.innerHTML = '';
    var leeg = maak('option', '', klanten.length ? 'Nog geen klant kiezen' : 'Nog geen klanten');
    leeg.value = '';
    kk.appendChild(leeg);
    klanten.forEach(function (k) {
      var o = maak('option', '', k.naam || '(zonder naam)');
      o.value = k.id;
      kk.appendChild(o);
    });

    el('nieuwrit-datum').value = dag;
    ['nieuwrit-tijd', 'nieuwrit-ophaal', 'nieuwrit-aflever', 'nieuwrit-km',
     'nieuwrit-stops', 'nieuwrit-opmerking'].forEach(function (id) {
      el(id).value = '';
    });

    el('ritdoek').hidden = false;
    document.body.style.overflow = 'hidden';
    el('nieuwrit-ophaal').focus();
  }

  function sluitNieuweRit() {
    el('ritdoek').hidden = true;
    document.body.style.overflow = '';
  }

  /* ------------------------------------------- een appje omzetten in een rit

     Je plakt het bericht van de klant in het vak, de tussenlaag haalt eruit
     wat erin staat, en de velden vullen zich. Er wordt niets aangemaakt: dit
     is een voorstel dat je nakijkt en aanpast voordat je op Rit aanmaken
     drukt. Wat het model niet zeker wist komt eronder als lijstje te staan,
     want dat is precies wat jij even moet nalopen.

     Staat er geen sleutel op de tussenlaag, dan blijft het vak verborgen. Een
     knop die niets doet is erger dan geen knop. */
  function meldPlak(tekst, isFout) {
    var m = el('plak-melding');
    m.textContent = tekst || '';
    m.hidden = !tekst;
    /* Een melding ziet er hier standaard uit als een waarschuwing; ging het
       goed, dan hoort hij groen te zijn en niet rood. */
    m.classList.toggle('melding--goed', !!tekst && !isFout);
  }

  function vulUitVoorstel(v) {
    /* Alleen invullen wat leeg is; wat jij al hebt getypt blijft staan. */
    function zetAls(id, waarde) {
      var veld = el(id);
      if (veld && waarde && !veld.value) { veld.value = waarde; }
    }
    zetAls('nieuwrit-datum', v.datum);
    zetAls('nieuwrit-tijd', v.tijd);
    zetAls('nieuwrit-ophaal', v.ophaal);
    zetAls('nieuwrit-aflever', v.aflever);
    zetAls('nieuwrit-opmerking', v.opmerking);
    var soort = el('nieuwrit-type');
    if (soort && v.type && !soort.value) { soort.value = v.type; }

    /* De klantnaam is een keuzelijst; alleen kiezen als hij er precies in staat. */
    var lijst = el('nieuwrit-klant');
    if (lijst && v.klant && !lijst.value) {
      var zoek = String(v.klant).trim().toLowerCase();
      for (var i = 0; i < lijst.options.length; i++) {
        if (lijst.options[i].textContent.trim().toLowerCase() === zoek) {
          lijst.selectedIndex = i;
          break;
        }
      }
    }

    var vragen = el('plak-vragen');
    vragen.innerHTML = '';
    if (v.onduidelijk && v.onduidelijk.length) {
      v.onduidelijk.forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t;
        vragen.appendChild(li);
      });
      vragen.hidden = false;
    } else {
      vragen.hidden = true;
    }
  }

  el('plak-lees').addEventListener('click', function () {
    var knop = el('plak-lees');
    var tekst = el('plak-tekst').value.trim();
    if (tekst.length < 10) {
      meldPlak('Plak eerst het bericht van de klant erin.', true);
      return;
    }
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig met lezen…';
    meldPlak('');
    verstuur('leesbericht', { tekst: tekst })
      .then(function (data) {
        vulUitVoorstel(data.voorstel || {});
        meldPlak('Ingevuld. Kijk het na en pas aan waar nodig.');
      })
      .catch(function (fout) {
        meldPlak(fout.message, true);
      })
      .then(function () {
        knop.disabled = false;
        knop.textContent = oud;
      });
  });

  /* ------------------------------------------------------------- inspreken

     De ingebouwde spraakherkenning van de browser. Kost niets en er gaat geen
     sleutel aan te pas. Kan je browser het niet, dan blijft de knop weg — op
     een iPhone staat er trouwens ook een microfoontje op het toetsenbord zelf,
     dat werkt in elk veld op dit scherm. */
  var Spraak = window.SpeechRecognition || window.webkitSpeechRecognition;

  function koppelSpreekknop(knop) {
    if (!Spraak) { return; }
    knop.hidden = false;
    var luisteraar = null;
    knop.addEventListener('click', function () {
      var doel = el(knop.getAttribute('data-doel'));
      if (!doel) { return; }
      if (luisteraar) { luisteraar.stop(); return; }

      luisteraar = new Spraak();
      luisteraar.lang = 'nl-NL';
      luisteraar.interimResults = false;
      luisteraar.continuous = false;
      var oudeTekst = knop.textContent;
      knop.setAttribute('data-luistert', '');
      knop.textContent = 'Klaar';

      luisteraar.onresult = function (e) {
        var gezegd = '';
        for (var i = 0; i < e.results.length; i++) { gezegd += e.results[i][0].transcript; }
        gezegd = gezegd.trim();
        if (!gezegd) { return; }
        /* Achter wat er al staat plakken, niet overschrijven. */
        doel.value = doel.value ? (doel.value.replace(/\s+$/, '') + ' ' + gezegd) : gezegd;
        doel.dispatchEvent(new Event('input', { bubbles: true }));
      };
      luisteraar.onerror = function (e) {
        if (e.error === 'not-allowed') {
          meldPlak('De microfoon staat uit voor deze pagina. Zet hem aan in de instellingen van je browser.', true);
        }
      };
      luisteraar.onend = function () {
        knop.removeAttribute('data-luistert');
        knop.textContent = oudeTekst;
        luisteraar = null;
      };
      luisteraar.start();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.spreek'), koppelSpreekknop);

  el('nieuwrit-terug').addEventListener('click', sluitNieuweRit);

  el('nieuwrit-maak').addEventListener('click', function () {
    var knop = el('nieuwrit-maak');
    /* Hier controleren zodat je geen ronde langs de server hoeft voor iets wat
       je op het scherm al ziet. De Worker kijkt het daarna nog eens na. */
    if (!el('nieuwrit-datum').value) {
      meldNieuweRit('Vul een datum in.');
      return;
    }
    if (!el('nieuwrit-ophaal').value.trim() || !el('nieuwrit-aflever').value.trim()) {
      meldNieuweRit('Vul in waar je ophaalt en waar je bezorgt.');
      return;
    }
    meldNieuweRit('');
    bezig(knop, 'Aanmaken…', function (klaar) {
      verstuur('nieuwerit', {
        datum: el('nieuwrit-datum').value,
        tijd: el('nieuwrit-tijd').value,
        type: el('nieuwrit-type').value,
        ophaal: el('nieuwrit-ophaal').value,
        aflever: el('nieuwrit-aflever').value,
        km: el('nieuwrit-km').value,
        stops: el('nieuwrit-stops').value,
        tijdvak: el('nieuwrit-tijdvak').value,
        klantId: el('nieuwrit-klant').value,
        opmerking: el('nieuwrit-opmerking').value
      }).then(function (data) {
        sluitNieuweRit();
        klaar(true);
        /* Naar de dag van de nieuwe rit springen, anders maak je iets aan dat
           je daarna nergens ziet staan. */
        dag = (data.rit && data.rit.datum) || dag;
        kiesTab('ritten');
        haalDag();
      }).catch(function (fout) {
        meldNieuweRit(fout.message);
        klaar(false);
      });
    });
  });

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
      '€ 25 per extra adres onderweg. Avond + 20% (minimaal € 25), nacht of ' +
      'weekend + 40% (minimaal € 50). ' +
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
  function vervangKlant(nieuw) {
    if (!nieuw) { return; }
    klanten = klanten.map(function (k) { return k.id === nieuw.id ? nieuw : k; });
  }

  function tekenUitnodiging(lijf, klantId) {
    var klant = klanten.filter(function (k) { return k.id === klantId; })[0];

    /* Het ontbreken van een e-mailadres gaat vóór. Dat is niet alleen een
       portaal dat niet kan, maar een factuur die niet kan: die gaat per mail,
       vaste klant of niet. Zonder adres krijg je geen geld binnen. */
    if (klant && !klant.email) {
      var mist = maak('div', 'bewijs bewijs--mist');
      var mt = maak('div');
      mt.appendChild(maak('b', '', 'Geen e-mailadres'));
      mt.appendChild(document.createTextNode(
        'Zonder e-mailadres kan deze klant geen factuur ontvangen, en ook geen ' +
        'uitnodiging voor zijn eigen overzicht. Vul het aan in Airtable bij de klant.'));
      mist.appendChild(mt);
      lijf.appendChild(mist);
      return;
    }

    /* Een eenmalige klant hoeft geen portaal: zijn factuur komt gewoon per
       mail. Pas als hij terugkomt is een eigen overzicht iets waard, en dat is
       een besluit dat jij neemt — vandaar een knop en geen automatisme. */
    if (klant && klant.soort !== 'Vaste klant') {
      var eenmalig = maak('div', 'terzijde');
      eenmalig.appendChild(maak('b', '', 'Eenmalige klant. '));
      eenmalig.appendChild(document.createTextNode(
        'Zijn factuur gaat per mail; een portaal heeft hij niet nodig.' +
        (klant.ritten >= 4
          ? ' Al ' + klant.ritten + ' ritten — dit lijkt geen eenmalige meer.'
          : '')));
      lijf.appendChild(eenmalig);

      var maakVast = maak('button', 'knop knop--rand', 'Vaste klant maken');
      maakVast.type = 'button';
      maakVast.addEventListener('click', function () {
        bezig(maakVast, 'Omzetten\u2026', function (klaar) {
          verstuur('klantsoort', { klantId: klantId, soort: 'Vaste klant' })
            .then(function (data) {
              vervangKlant(data.klant);
              meldApp('');
              tekenPlanning();
            })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      lijf.appendChild(maakVast);
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
          vervangKlant(data.klant);
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
