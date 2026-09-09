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
  /* Facturen worden per klant opgehaald op het moment dat je erom vraagt, en
     daarna onthouden. Ze meesturen met het dagoverzicht zou dat overzicht
     opblazen voor iets wat je een paar keer per week opzoekt. */
  var facturen = {};
  var factuurZoek = [];
  /* De ritten per maand voor de kalender, met 'JJJJ-MM' als sleutel. Bij het
     openen tekenen we meteen wat we al hebben en halen we het daarna opnieuw
     op: zo staat er nooit een leeg raster, en klopt het een tel later alsnog
     ook als er intussen een rit bij kwam. */
  var maanden = {};
  var maand = vandaag().slice(0, 7);
  /* Elke zoekopdracht krijgt een nummer. Antwoorden komen niet altijd terug in
     de volgorde waarin ze weggingen, en alleen het laatste wat je intypte mag
     op het scherm komen. */
  var zoekBeurt = 0;
  var zoekWacht = null;
  var tabblad = 'ritten';
  var klantVoor = null;
  var tekentVoor = null;


  /* ----------------------------------------------------- adressen uit gegevens

     Een adres dat uit de tussenlaag komt gaat hier eerst langs. Alles wat geen
     gewoon web-, mail- of telefoonadres is wordt een leeg adres.

     Waarom dit er staat terwijl de tussenlaag alleen adressen van Airtable
     doorgeeft: een adres uit gegevens in een link zetten zonder te kijken wat
     het is, is de manier waarop javascript:-links ontstaan. Dat er vandaag geen
     weg is waarlangs zoiets binnenkomt is geen eigenschap van deze pagina maar
     van alles wat ervoor zit. Deze regel geldt hier, en blijft gelden als daar
     iets verandert.

     Een relatief adres (../factuur/?...) mag ook: dat maken we zelf. */
  function veiligAdres(w) {
    var tekst = String(w === undefined || w === null ? '' : w).trim();
    if (!tekst) { return ''; }
    /* Geen dubbelpunt voor het eerste schuine streepje betekent geen schema,
       en dus een adres binnen onze eigen site. */
    var schema = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(tekst);
    if (!schema) { return tekst; }
    return ['http', 'https', 'mailto', 'tel'].indexOf(schema[1].toLowerCase()) >= 0
      ? tekst : '';
  }

  /* Hetzelfde voor een afbeelding. Daar hoort ook data: bij, want een foto die
     nog niet verstuurd is staat als data:image in het scherm. Alleen
     data:image, en met opzet geen data:image/svg+xml: een svg is geen plaatje
     maar een document dat script kan bevatten. */
  function veiligePlaat(w) {
    var tekst = String(w === undefined || w === null ? '' : w).trim();
    if (/^data:image\/(?!svg)[a-z0-9.+-]+;/i.test(tekst)) { return tekst; }
    if (/^blob:/i.test(tekst)) { return tekst; }
    var uit = veiligAdres(tekst);
    return /^(mailto|tel):/i.test(uit) ? '' : uit;
  }

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
  /* Met het jaar erbij. In een zoekuitslag staan ritten van jaren door elkaar,
     en dan is "12 sep" niet genoeg om te weten welke je voor je hebt. */
  function datumMetJaar(iso) {
    if (!iso) { return ''; }
    return new Date(iso + 'T12:00:00')
      .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function maandNaam(maandSl) {
    var n = new Date(maandSl + '-01T12:00:00')
      .toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  function klok(iso) {
    if (!iso) { return ''; }
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  var MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
                 'augustus', 'september', 'oktober', 'november', 'december'];
  var MAANDKORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul',
                   'aug', 'sep', 'okt', 'nov', 'dec'];

  /* Een datum maken van drie getallen, of niets als het er geen is. Nodig
     omdat een Date 31 februari stilletjes doorrolt naar 3 maart: dan krijg je
     een andere dag dan je intypte zonder dat iemand het zegt. */
  function bouwDatum(jaar, maandNr, dagNr) {
    if (!(jaar >= 2000 && jaar <= 2100)) { return ''; }
    if (!(maandNr >= 1 && maandNr <= 12)) { return ''; }
    if (!(dagNr >= 1 && dagNr <= 31)) { return ''; }
    var d = new Date(jaar, maandNr - 1, dagNr, 12, 0, 0);
    if (d.getMonth() !== maandNr - 1 || d.getDate() !== dagNr) { return ''; }
    return alsDatum(d);
  }

  /* Wat je intypt als je een datum bedoelt in plaats van een klantnaam:
     12-3, 12/3/26, 12.3.2026, 12 maart, 12 mrt 2025, 2026-03-12. Zonder jaar
     is het dit jaar. Levert het niets op, dan was het gewoon een zoekterm. */
  function leesDatum(tekst) {
    var t = String(tekst || '').trim().toLowerCase();
    var ditJaar = new Date().getFullYear();

    var iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
    if (iso) { return bouwDatum(+iso[1], +iso[2], +iso[3]); }

    var cijfers = /^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2}|\d{4}))?$/.exec(t);
    if (cijfers) {
      var jaar = cijfers[3] === undefined ? ditJaar : +cijfers[3];
      if (jaar < 100) { jaar += 2000; }
      return bouwDatum(jaar, +cijfers[2], +cijfers[1]);
    }

    var woord = /^(\d{1,2})[. ]+([a-z]{3,})\.?(?:[. ]+(\d{2}|\d{4}))?$/.exec(t);
    if (woord) {
      var nr = 0;
      for (var i = 0; i < MAANDEN.length; i++) {
        /* Zowel "maart" als "mrt": het hele woord als beginstuk, of de vaste
           Nederlandse afkorting. Twee lijsten, want "maart" en "mrt" delen
           hun eerste drie letters niet. */
        if (MAANDEN[i].indexOf(woord[2]) === 0 || MAANDKORT[i] === woord[2].slice(0, 3)) {
          nr = i + 1;
          break;
        }
      }
      if (!nr) { return ''; }
      var jaar2 = woord[3] === undefined ? ditJaar : +woord[3];
      if (jaar2 < 100) { jaar2 += 2000; }
      return bouwDatum(jaar2, nr, +woord[1]);
    }
    return '';
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
      /* Een merkje, zodat de rest van dit bestand het verschil kent tussen
         "er is geen bereik" en "de tussenlaag zegt nee". Het eerste bewaar je
         en probeer je later opnieuw; het tweede is een echt antwoord. */
      var fout = new Error(
        'Geen verbinding. Controleer je bereik en probeer het opnieuw — er is niets verstuurd.'
      );
      fout.netwerk = true;
      throw fout;
    });
  }

  /* ------------------------------------------------------- zonder bereik

     Onderweg is geen bereik geen uitzondering maar een gegeven: een laadkuil,
     een parkeergarage, een bedrijventerrein waar niets doorkomt. Twee dingen
     moeten het dan doen.

     Je moet kunnen zien wat je rijdt. Daarom wordt het laatst opgehaalde
     overzicht per dag bewaard en teruggezet als er niets doorkomt — altijd met
     een balk erboven die zegt dat het oud is en van hoe laat. Iets ouds tonen
     mag; doen alsof het vers is niet. Dat was eerder de reden om helemaal
     niets te bewaren, en die reden staat overeind: hij verbiedt geen geheugen,
     hij verbiedt een geheugen dat zich voordoet als het heden.

     En wat je invult mag niet weg zijn. Een status, een handtekening, een
     foto: die gaan in een wachtrij op de telefoon en worden op volgorde
     verstuurd zodra er weer bereik is. Op volgorde, want Onderweg hoort vóór
     Uitgevoerd aan te komen. */

  /* Wie er is ingelogd, zodat een ritkaart weet of een rit van jou is of nog
     vrij ligt. Wordt gezet bij elk overzicht. */
  var wieIkBen = null;

  var SL_RIJ = 'sl-portaal-rij';
  var SL_DAG = 'sl-portaal-dag-';
  var DAGEN_BEWAARD = 7;

  /* Wat er in de wachtrij mag. Alles wat een antwoord van de tussenlaag nodig
     heeft om verder te kunnen — een aanvraag omzetten, een klant koppelen, een
     factuur opzoeken — hoort er niet in: dan zou het scherm doen alsof er iets
     gebeurd is terwijl er nog niets is. Die zeggen gewoon dat er geen bereik
     is. */
  var WACHT_ACTIES = ['status', 'notitie', 'ritkm', 'ritkosten', 'ritcontact', 'dagstaat',
                      'handtekening', 'ritfoto'];

  var wachtrij = [];
  /* Wat blijvend geweigerd is. Dat is geen uitstel maar verlies, en dat hoor
     je te zien in plaats van het te ontdekken bij een geschil. */
  var kwijt = [];
  var bezigMetRij = false;
  /* Van welk moment het scherm komt, of null als het vers is. */
  var geheugenVan = null;

  /* Safari in een privévenster laat geen enkele opslag toe en gooit bij elke
     poging. Alles wat hieronder met het geheugen praat mag daarop niet
     omvallen; zonder opslag werkt het portaal gewoon, alleen niet offline. */
  function leesOpslag(sleutel) {
    try { return localStorage.getItem(sleutel); } catch (e) { return null; }
  }
  function schrijfOpslag(sleutel, waarde) {
    try { localStorage.setItem(sleutel, waarde); return true; } catch (e) { return false; }
  }

  function bewaarDag(welke, data) {
    if (schrijfOpslag(SL_DAG + welke, JSON.stringify({ opgehaald: Date.now(), data: data }))) {
      ruimDagenOp();
    }
  }

  /* Verder terug dan een week ga je onderweg niet nakijken, en de ruimte op een
     telefoon is niet oneindig — zeker niet met foto's in de wachtrij. De
     sleutel eindigt op de datum, dus alfabetisch sorteren is op ouderdom
     sorteren. */
  function ruimDagenOp() {
    try {
      var namen = [];
      for (var i = 0; i < localStorage.length; i++) {
        var naam = localStorage.key(i);
        if (naam && naam.indexOf(SL_DAG) === 0) { namen.push(naam); }
      }
      namen.sort();
      while (namen.length > DAGEN_BEWAARD) { localStorage.removeItem(namen.shift()); }
    } catch (e) { /* dan blijft het staan; erger is het niet */ }
  }

  function uitGeheugen(welke) {
    var ruw = leesOpslag(SL_DAG + welke);
    if (!ruw) { return null; }
    try { return JSON.parse(ruw); } catch (e) { return null; }
  }

  function leesWachtrij() {
    var ruw = leesOpslag(SL_RIJ);
    if (!ruw) { return []; }
    try {
      var lijst = JSON.parse(ruw);
      return Array.isArray(lijst) ? lijst : [];
    } catch (e) { return []; }
  }
  function bewaarWachtrij() { return schrijfOpslag(SL_RIJ, JSON.stringify(wachtrij)); }

  /* Versturen, en anders bewaren. `alsOffline` levert de rit zoals hij er op
     het scherm uit hoort te zien zolang het nog niet verstuurd is — onze eigen
     aanname dus, en niet wat de administratie ervan gemaakt heeft. */
  function schrijf(actie, gegevens, alsOffline) {
    if (WACHT_ACTIES.indexOf(actie) < 0) { return verstuur(actie, gegevens); }
    if (navigator.onLine === false) { return inDeWacht(actie, gegevens, alsOffline); }
    return verstuur(actie, gegevens).catch(function (fout) {
      /* Alleen bij een verbindingsfout. Een weigering van de tussenlaag is een
         echt nee, en die in de rij zetten zou hem daar voor eeuwig laten
         staan — met alles erachter. */
      if (fout && fout.netwerk) { return inDeWacht(actie, gegevens, alsOffline); }
      throw fout;
    });
  }

  function inDeWacht(actie, gegevens, alsOffline) {
    wachtrij.push({ actie: actie, gegevens: gegevens, gemaakt: Date.now() });
    if (!bewaarWachtrij()) {
      /* Het geheugen van de telefoon zit vol, meestal door foto's die nog
         moeten. Stilzwijgend doorgaan zou betekenen dat je denkt dat het
         bewaard is terwijl het bij het afsluiten weg is. */
      wachtrij.pop();
      bewaarWachtrij();
      tekenOffline();
      return Promise.reject(new Error(
        'Er is geen ruimte meer op deze telefoon om dit te bewaren. Zoek even ' +
        'bereik, dan gaat weg wat er al klaarstaat.'
      ));
    }
    tekenOffline();
    return Promise.resolve({ ok: true, wacht: true,
                             rit: alsOffline ? alsOffline() : null });
  }

  /* Eén tegelijk en op volgorde. Twee tegelijk zou betekenen dat Uitgevoerd
     eerder kan aankomen dan Onderweg, en dan klopt de vertrektijd niet meer. */
  function leegDeWachtrij() {
    if (bezigMetRij || !wachtrij.length) { return; }
    if (navigator.onLine === false) { tekenOffline(); return; }

    bezigMetRij = true;
    tekenOffline();
    var eerste = wachtrij[0];

    verstuur(eerste.actie, eerste.gegevens)
      .then(function () {
        wachtrij.shift();
        bewaarWachtrij();
        bezigMetRij = false;
        if (wachtrij.length) { leegDeWachtrij(); return; }
        tekenOffline();
        /* De rij is leeg: nu ophalen wat de administratie ervan gemaakt heeft.
           Wat er op het scherm stond was onze eigen aanname. */
        haalDag();
      })
      .catch(function (fout) {
        bezigMetRij = false;
        if (fout && fout.netwerk) { tekenOffline(); return; }
        wachtrij.shift();
        bewaarWachtrij();
        kwijt.push({ actie: eerste.actie, reden: fout.message });
        tekenOffline();
        leegDeWachtrij();
      });
  }

  function tekenOffline() {
    var balk = el('offlinebalk');
    if (!balk) { return; }
    var kop = el('offline-kop');
    var uitleg = el('offline-uitleg');
    balk.removeAttribute('data-kwijt');
    balk.removeAttribute('data-bezig');

    if (kwijt.length) {
      balk.hidden = false;
      balk.setAttribute('data-kwijt', '');
      kop.textContent = kwijt.length === 1
        ? 'Eén wijziging is niet opgeslagen'
        : kwijt.length + ' wijzigingen zijn niet opgeslagen';
      uitleg.textContent = kwijt[kwijt.length - 1].reden +
        ' Kijk de rit na en zet het opnieuw.';
      return;
    }

    var wacht = wachtrij.length;
    var uit = navigator.onLine === false;

    if (!uit && bezigMetRij && wacht) {
      balk.hidden = false;
      balk.setAttribute('data-bezig', '');
      kop.textContent = 'Bezig met versturen';
      uitleg.textContent = wacht === 1 ? 'Nog één wijziging.'
                                       : 'Nog ' + wacht + ' wijzigingen.';
      return;
    }

    if (!uit && !wacht && !geheugenVan) { balk.hidden = true; return; }
    balk.hidden = false;

    if (uit) {
      kop.textContent = 'Geen verbinding';
      var stukken = [];
      if (geheugenVan) { stukken.push('Je ziet het overzicht van ' + stempel(geheugenVan) + '.'); }
      stukken.push(wacht === 0
        ? 'Wat je invult wordt bewaard en verstuurd zodra je weer bereik hebt.'
        : (wacht === 1 ? 'Eén wijziging staat klaar om te versturen.'
                       : wacht + ' wijzigingen staan klaar om te versturen.'));
      uitleg.textContent = stukken.join(' ');
      return;
    }

    kop.textContent = wacht ? 'Nog niet verstuurd' : 'Dit is een oud overzicht';
    uitleg.textContent = wacht
      ? (wacht === 1 ? 'Eén wijziging wacht nog.' : wacht + ' wijzigingen wachten nog.')
      : 'Opgehaald om ' + stempel(geheugenVan) + '. Ververs om het bij te werken.';
  }

  function stempel(moment) {
    var d = new Date(moment);
    return isNaN(d.getTime()) ? 'eerder' : klok(d.toISOString());
  }

  /* ------------------------------------------------------------ toegang */

  /* Uitloggen brengt je naar de website. Behalve als het portaal vanaf je
     beginscherm draait: dan is er geen adresbalk en geen terugknop, en zou je
     jezelf op de marketingpagina opsluiten zonder weg terug. In dat geval
     blijft het bij het inlogscherm — dat is waar je toch heen wilt.

     Zo doet de knop bij een klant op een gedeelde computer wat je verwacht
     (weg uit het portaal, terug naar de site) zonder de app onbruikbaar te
     maken voor wie hem heeft geïnstalleerd. */
  function naarBuiten() {
    var alsApp = false;
    try {
      alsApp = (window.matchMedia &&
                window.matchMedia('(display-mode: standalone)').matches) ||
               window.navigator.standalone === true;
    } catch (e) { alsApp = false; }
    if (alsApp) { return; }
    try { window.location.href = '../'; } catch (e) { /* dan blijft het slot */ }
  }

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
      verwerkVers(data);
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
    naarBuiten();
  });

  /* --------------------------------------------------------------- dag */

  el('dag-vorige').addEventListener('click', function () { gaNaar(verschuif(dag, -1)); });
  el('dag-volgende').addEventListener('click', function () { gaNaar(verschuif(dag, 1)); });
  el('dag-vandaag').addEventListener('click', function () { gaNaar(vandaag()); });

  /* Of het kalendervak op deze pagina staat. Een telefoon bewaart de pagina en
     dit script los van elkaar; komt er een oude pagina bij dit nieuwe script,
     dan zijn de knoppen hieronder er niet. Zonder deze vraag zou het script
     daarop stukvallen en zou het portaal helemaal niets meer laten zien — een
     ontbrekende kalender is een stuk minder erg dan een leeg scherm. */
  var heeftKalender = !!el('kalender');

  function gaNaar(nieuweDag) {
    dag = nieuweDag;
    haalDag();
    /* Staat de kalender open, dan moet de gekozen dag meeverspringen. Kom je
       daarmee in een andere maand, dan die maand erbij halen — anders kijk je
       naar augustus met een gekozen dag die daar niet in staat. */
    if (heeftKalender && !el('kalender').hidden) {
      if (dag.slice(0, 7) !== maand) { maand = dag.slice(0, 7); haalMaand(maand); }
      tekenMaand();
      el('dag-sprong').value = dag;
    }
  }

  /* ------------------------------------------------------ zoeken en kalender

     Per dag bladeren werkt zolang je weet wanneer een rit was. Dit is voor als
     je dat niet weet: een maand in één oogopslag met een stip per rit, en
     zoeken op de klant, de plaats of het ritnummer. Typ je een datum in, dan
     komt daar een regel bij om er meteen heen te springen. */

  if (heeftKalender) {
    el('dag-kies').addEventListener('click', function () {
      zetKalender(el('kalender').hidden);
    });
    el('maand-vorige').addEventListener('click', function () { andereMaand(-1); });
    el('maand-volgende').addEventListener('click', function () { andereMaand(1); });
    /* De datumkiezer van de telefoon zelf. Voor een dag in een heel ander jaar
       is dat één beweging, waar doorbladeren er twintig zou zijn. */
    el('dag-sprong').addEventListener('change', function () {
      if (/^\d{4}-\d{2}-\d{2}$/.test(this.value)) { kiesDag(this.value); }
    });
    el('rit-zoek').addEventListener('input', function () {
      var tekst = this.value.trim();
      el('rit-zoek-leeg').hidden = !this.value;
      if (zoekWacht) { clearTimeout(zoekWacht); zoekWacht = null; }
      if (tekst.length < 2) { zoekBeurt++; toonZoek(false); return; }
      /* Even wachten met versturen. Anders gaat er bij het intypen van "Bakker"
         zes keer een verzoek weg terwijl alleen het laatste ertoe doet. */
      zoekWacht = setTimeout(function () { zoekRitten(tekst); }, 350);
    });
    el('rit-zoek-leeg').addEventListener('click', function () {
      wisZoek();
      el('rit-zoek').focus();
    });
  }

  function zetKalender(open) {
    el('kalender').hidden = !open;
    el('dag-kies').setAttribute('aria-expanded', String(open));
    if (!open) { return; }
    maand = dag.slice(0, 7);
    el('dag-sprong').value = dag;
    tekenMaand();
    haalMaand(maand);
  }

  function andereMaand(stap) {
    var d = new Date(maand + '-01T12:00:00');
    d.setMonth(d.getMonth() + stap);
    maand = alsDatum(d).slice(0, 7);
    tekenMaand();
    haalMaand(maand);
  }

  /* De maandag op of vóór de eerste van de maand. Daarna zes volle weken, zodat
     elke maand in hetzelfde raster van 42 vakjes past en de kalender niet van
     hoogte springt als je doorbladert. Een Nederlandse week begint op maandag;
     getDay() vindt van zichzelf dat het zondag is. */
  function rasterStart(maandSl) {
    var eerste = new Date(maandSl + '-01T12:00:00');
    return verschuif(alsDatum(eerste), -((eerste.getDay() + 6) % 7));
  }

  function haalMaand(sleutel) {
    var van = rasterStart(sleutel);
    verstuur('ritten', { van: van, tot: verschuif(van, 41) })
      .then(function (data) {
        maanden[sleutel] = data.ritten || [];
        if (maand === sleutel && !el('kalender').hidden) { tekenMaand(); }
      })
      .catch(function () {
        /* Lukt het ophalen niet, dan blijft de kalender gewoon staan — alleen
           zonder stippen. Je kunt er nog steeds een dag mee kiezen, en daar is
           hij in de eerste plaats voor. Een foutmelding over het hele scherm
           zou hier meer in de weg zitten dan helpen. */
      });
  }

  function tekenMaand() {
    el('maand-naam').textContent = maandNaam(maand);
    var net = el('kalender-net');
    net.innerHTML = '';

    var perDag = {};
    (maanden[maand] || []).forEach(function (r) {
      if (!r.datum) { return; }
      (perDag[r.datum] = perDag[r.datum] || []).push(r);
    });

    var start = rasterStart(maand);
    var nu = vandaag();
    for (var i = 0; i < 42; i++) {
      net.appendChild(dagVakje(verschuif(start, i), perDag, nu));
    }
  }

  function dagVakje(datum, perDag, nu) {
    var opDeze = perDag[datum] || [];
    var knop = maak('button', 'kalender__dag');
    knop.type = 'button';
    if (datum.slice(0, 7) !== maand) { knop.setAttribute('data-buiten', ''); }
    if (datum === nu)  { knop.setAttribute('data-vandaag', ''); }
    if (datum === dag) { knop.setAttribute('data-gekozen', ''); }
    knop.setAttribute('data-dag', datum);
    /* Een schermlezer krijgt hier hetzelfde te horen als wat de stippen laten
       zien, want stippen leest hij niet voor. */
    knop.setAttribute('aria-label', datumLang(datum) + ', ' +
      (opDeze.length === 0 ? 'geen ritten'
                           : opDeze.length + (opDeze.length === 1 ? ' rit' : ' ritten')));
    knop.appendChild(maak('span', '', String(Number(datum.slice(8, 10)))));
    knop.appendChild(stippen(opDeze));
    knop.addEventListener('click', function () { kiesDag(datum); });
    return knop;
  }

  function stippen(opDeze) {
    var vak = maak('span', 'kalender__stip');
    opDeze.slice(0, 3).forEach(function (r) {
      var stip = maak('i', '');
      if (r.status === 'Gepland' || r.status === 'Onderweg') { stip.setAttribute('data-open', ''); }
      else if (r.status === 'Uitgevoerd') { stip.setAttribute('data-klaar', ''); }
      vak.appendChild(stip);
    });
    /* Vier ritten op één dag past niet in drie stippen. Het plusje zegt: er is
       meer, kijk maar. Het exacte aantal staat een tik later toch op je scherm. */
    if (opDeze.length > 3) { vak.appendChild(maak('b', '', '+')); }
    return vak;
  }

  function kiesDag(nieuweDag) {
    zetKalender(false);
    wisZoek();
    gaNaar(nieuweDag);
  }

  /* -------------------------------------------------------------- zoeken */

  function wisZoek() {
    if (zoekWacht) { clearTimeout(zoekWacht); zoekWacht = null; }
    zoekBeurt++;
    el('rit-zoek').value = '';
    el('rit-zoek-leeg').hidden = true;
    toonZoek(false);
  }

  /* Zoeken en de kalender delen dezelfde ruimte: zoek je, dan wijkt het
     raster. Allebei tegelijk zou een paneel opleveren dat niet meer op een
     telefoonscherm past. */
  function toonZoek(bezig) {
    el('zoekuitslag').hidden = !bezig;
    el('kalendervak').hidden = !!bezig;
    if (!bezig) { el('zoekuitslag').innerHTML = ''; }
  }

  function zoekRitten(tekst) {
    var beurt = ++zoekBeurt;
    var sprong = leesDatum(tekst);
    toonZoek(true);
    tekenZoek(sprong, null, tekst, '', 'Zoeken…');

    verstuur('zoekritten', { tekst: tekst })
      .then(function (data) {
        if (beurt !== zoekBeurt) { return; }
        tekenZoek(sprong, data.ritten || [], tekst, '');
      })
      .catch(function (fout) {
        if (beurt !== zoekBeurt) { return; }
        tekenZoek(sprong, null, tekst, fout.message);
      });
  }

  function tekenZoek(sprong, gevonden, tekst, fout, bezig) {
    var vak = el('zoekuitslag');
    vak.innerHTML = '';
    /* De datumregel eerst, en ook als het zoeken zelf misging: een datum
       herkennen doet dit scherm zelf en daar is geen verbinding voor nodig. */
    if (sprong) { vak.appendChild(sprongRij(sprong)); }

    if (bezig)  { vak.appendChild(maak('div', 'zoekleeg', bezig)); return; }
    if (fout)   { vak.appendChild(maak('div', 'zoekleeg', fout)); return; }
    if (!gevonden.length) {
      vak.appendChild(maak('div', 'zoekleeg',
        (sprong ? 'Verder geen ritten' : 'Geen ritten') + ' gevonden voor \u201c' + tekst + '\u201d.'));
      return;
    }
    gevonden.forEach(function (rit) { vak.appendChild(zoekRij(rit)); });
  }

  /* Alleen de plaats. Naast de datum en de status is er in een zoekregel op een
     telefoon geen ruimte voor twee volledige adressen, en dan valt het
     afleveradres er juist af — terwijl dat is waar je op zoekt. Een Nederlands
     adres eindigt op de plaatsnaam; staat er geen komma in, dan is het adres
     zelf al kort genoeg. */
  function plaatsVan(adres) {
    var stukken = String(adres || '').split(',');
    var laatste = stukken[stukken.length - 1].trim();
    /* "5611 AB Eindhoven" — de postcode hoeft er niet bij. */
    return laatste.replace(/^\d{4}\s*[A-Za-z]{0,2}\s+/, '') || '?';
  }

  function sprongRij(datum) {
    var rij = maak('button', 'zoekrij zoekrij--sprong');
    rij.type = 'button';
    rij.appendChild(maak('span', 'zoekrij__datum', 'Datum'));
    var midden = maak('span', 'zoekrij__midden');
    midden.appendChild(maak('span', 'zoekrij__klant', 'Ga naar ' + datumLang(datum)));
    midden.appendChild(maak('span', 'zoekrij__route', dagNaam(datum)));
    rij.appendChild(midden);
    rij.addEventListener('click', function () { kiesDag(datum); });
    return rij;
  }

  function zoekRij(rit) {
    var rij = maak('button', 'zoekrij');
    rij.type = 'button';
    rij.appendChild(maak('span', 'zoekrij__datum', datumMetJaar(rit.datum) || 'Geen datum'));

    var midden = maak('span', 'zoekrij__midden');
    midden.appendChild(maak('span', 'zoekrij__klant', rit.klant || rit.naam || 'Rit'));
    midden.appendChild(maak('span', 'zoekrij__route',
      plaatsVan(rit.ophaal) + '  \u2192  ' + plaatsVan(rit.aflever)));
    rij.appendChild(midden);

    if (rit.status) {
      rij.appendChild(maak('span', 'zoekrij__status s-' + rit.status.toLowerCase(), rit.status));
    }
    /* Een rit zonder datum kun je nergens naartoe openen. Dan is de regel er
       om te laten zien dat hij bestaat, en verder niets. */
    if (!rit.datum) { rij.disabled = true; }
    else { rij.addEventListener('click', function () { kiesDag(rit.datum); }); }
    return rij;
  }

  /* Verse gegevens: op het scherm, en in het geheugen van de telefoon voor als
     het bereik straks wegvalt. Door beide plekken waar een overzicht
     binnenkomt hier langs te sturen — het inloggen en het wisselen van dag —
     staat er na de eerste keer inloggen al iets bewaard. Anders zou je pas
     offline kunnen werken nadat je een keer van dag gewisseld was, en dat is
     precies het soort verschil waar niemand aan denkt. */
  function verwerkVers(data) {
    geheugenVan = null;
    if (data && data.dag) { bewaarDag(data.dag, data); }
    toon(data);
    tekenOffline();
  }

  function haalDag() {
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
    el('lijst').innerHTML = '<div class="leeg">Ophalen…</div>';
    meldApp('');
    var welke = dag;
    verstuur('overzicht', { dag: welke })
      .then(verwerkVers)
      .catch(function (fout) {
        /* Geen bereik: laten zien wat we van deze dag bewaard hebben, met de
           tijd erbij in de balk. Bij een klant op de stoep helpt een leeg
           scherm je niet, en het adres van de volgende rit staat hierin. */
        var pak = fout && fout.netwerk ? uitGeheugen(welke) : null;
        if (pak && pak.data) {
          geheugenVan = pak.opgehaald;
          toon(pak.data);
          tekenOffline();
          return;
        }
        meldApp(fout.message);
        el('lijst').innerHTML = '';
        tekenOffline();
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
    wieIkBen = ik;
    var alleenRitten = !!ik && ik.rol !== 'Eigenaar';
    /* Meldingen gaan over aanvragen, klanten en facturen — jouw bedrijfsvoering.
       Een chauffeur heeft daar niets te zoeken, dus dat tabblad gaat mee weg. */
    verborgen = alleenRitten
      ? ['aanvragen', 'planning', 'meldingen', 'klanten', 'chauffeurs']
      : [];
    if (alleenRitten && tabblad !== 'ritten') { kiesTab('ritten'); }
    regelMenuknop();

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
      if (tabblad === 'klanten') { tekenKlanten(); }
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
    stipBij();
  }

  /* De ritten van de dag die op het scherm staat zijn verser dan wat er in de
     maandvoorraad van de kalender ligt. Zet je een rit op Uitgevoerd, dan
     hoort die stip meteen groen te worden — en niet pas als je de kalender
     opnieuw opent. Alleen de maanden waarvan het raster deze dag laat zien
     worden bijgewerkt; die overlappen aan het begin en het eind. */
  function stipBij() {
    if (!heeftKalender) { return; }
    Object.keys(maanden).forEach(function (sleutel) {
      var start = rasterStart(sleutel);
      var hoort = dag >= start && dag <= verschuif(start, 41);
      var had = maanden[sleutel].some(function (r) { return r.datum === dag; });
      if (!hoort && !had) { return; }
      maanden[sleutel] = maanden[sleutel]
        .filter(function (r) { return r.datum !== dag; })
        .concat(hoort ? ritten : []);
    });
    if (!el('kalender').hidden) { tekenMaand(); }
  }

  /* -------------------------------------------------------- tabbladen */

  /* De tellers per tabblad. Ze stonden op de knoppen in de schuifbalk; die is
     er niet meer, dus houden we ze hier bij en tekenen we ze in het menu en op
     de menuknop. */
  var tellers = { ritten: 0, aanvragen: 0, planning: 0, meldingen: 0 };

  function tekenBadges() {
    tellers.ritten = ritten.filter(function (r) {
      return r.status === 'Gepland' || r.status === 'Onderweg';
    }).length;
    tellers.aanvragen = aanvragen.length;
    tellers.planning = opdrachten.length;
    tellers.meldingen = meldingen.filter(function (m) { return !m.gezien; }).length;
    tekenMenubel();
    if (tabmenuOpen()) { vulTabmenu(); }
  }

  /* Wat er op de knop komt te staan: het aantal ongelezen meldingen, en verder
     niets.

     Niet alle tellers bij elkaar. Het aantal open ritten van vandaag is een
     gegeven en geen oproep — dat zou er altijd staan, en een belletje dat
     altijd brandt kijk je binnen een week overheen. En de aanvragen er niet bij
     optellen: een nieuwe aanvraag ís al een melding (zie bouwMeldingen), dus
     dan telde dezelfde aanvraag twee keer mee en zou de knop 4 zeggen bij twee
     dingen.

     Sta je zelf op Meldingen, dan is het geen nieuws meer en gaat hij uit. En
     een chauffeur ziet dat tabblad niet, dus krijgt hij er ook geen belletje
     over: een rood bolletje dat naar een tabblad wijst dat voor hem niet
     bestaat is erger dan geen bolletje. */
  function tekenMenubel() {
    var bel = el('tabmenu-bel');
    if (!bel) { return; }
    var som = (tabblad !== 'meldingen' && magTab('meldingen'))
      ? (tellers.meldingen || 0) : 0;
    bel.textContent = som > 99 ? '99+' : String(som);
    bel.hidden = !som;
  }

  /* De volgorde van de tabbladen, en daarmee ook van het menu. Niet willekeurig
     gegroeid maar gegroepeerd: eerst wat op je ligt te wachten (Ritten,
     Aanvragen, Meldingen), dan het vooruitzicht (Planning), dan met wie je
     werkt (Klanten, Chauffeurs), en als laatste het gereedschap (Prijs).

     Dat de eerste drie ook de drie zijn die zonder vegen op een telefoon
     passen is het punt: wat om aandacht vraagt hoort in beeld te staan. De
     rekenmachine stond daar eerst, en die pak je er juist af en toe bij. */
  var TABBLADEN = ['ritten', 'aanvragen', 'meldingen', 'planning',
                   'klanten', 'chauffeurs', 'prijs'];

  var TABNAAM = {
    ritten: 'Ritten', aanvragen: 'Aanvragen', meldingen: 'Meldingen',
    planning: 'Planning', klanten: 'Klanten', chauffeurs: 'Chauffeurs',
    prijs: 'Prijs'
  };

  /* Welke tabbladen deze persoon niet mag zien. Stond eerst als hidden op de
     knoppen in de balk; nu die weg is, is dit de plek waar het staat. */
  var verborgen = [];

  function magTab(t) { return verborgen.indexOf(t) === -1; }

  function zichtbareTabs() { return TABBLADEN.filter(magTab); }

  function kiesTab(naam) {
    tabblad = naam;
    TABBLADEN.forEach(function (t) {
      el('paneel-' + t).hidden = (t !== naam);
    });
    /* Zonder balk is dit het enige dat vertelt waar je bent. */
    var nu = el('tabbalk-nu');
    if (nu) { nu.textContent = TABNAAM[naam] || naam; }
    window.scrollTo(0, 0);
    tekenMenubel();

    /* Meldingen halen een ruimer venster op dan de dag die op het scherm
       staat: een rit die volgende week is afgezegd hoor je nu te zien, niet
       pas als je die dag opzoekt. */
    if (naam === 'meldingen') { haalMeldingen(); }
    if (naam === 'klanten') { tekenKlanten(); }
    if (naam === 'prijs') { toonPrijs(); }
    if (naam === 'chauffeurs') { haalChauffeurs(); }
  }

  /* ------------------------------------------------------------ chauffeurs

     Wie er voor je rijdt. Nu ben jij dat zelf, maar dit staat er met het oog
     op uitbreiding: bij de eerste chauffeur hoef je niet eerst iets te bouwen.

     Toegangscodes staan er met opzet niet in. Die horen in Airtable en niet in
     het geheugen van een telefoon — wie zijn code kwijt is krijgt een nieuwe,
     en dat is veiliger dan hem kunnen opzoeken. */
  var chauffeurs = [];

  function haalChauffeurs() {
    var lijst = el('lijst-chauffeurs');
    if (!lijst) { return; }
    if (chauffeurs.length) { tekenChauffeurs(); return; }
    lijst.innerHTML = '';
    lijst.appendChild(maak('div', 'leeg', 'Bezig met ophalen…'));
    verstuur('chauffeurs', {})
      .then(function (data) {
        chauffeurs = (data && data.chauffeurs) || [];
        tekenChauffeurs();
      })
      .catch(function (fout) {
        lijst.innerHTML = '';
        lijst.appendChild(maak('div', 'leeg', fout.message));
      });
  }

  function tekenChauffeurs() {
    var lijst = el('lijst-chauffeurs');
    if (!lijst) { return; }
    lijst.innerHTML = '';

    if (!chauffeurs.length) {
      lijst.appendChild(maak('div', 'leeg',
        'Nog niemand in de tabel Chauffeurs. Zet er een regel in met een naam ' +
        'en een toegangscode, dan kan die persoon in dit portaal en zijn eigen ' +
        'ritten oppakken.'));
      return;
    }

    chauffeurs.forEach(function (c) { lijst.appendChild(tekenChauffeur(c)); });
  }

  if (el('ch-maak')) {
    el('ch-maak').addEventListener('click', function () {
      var knop = el('ch-maak');
      var naam = el('ch-naam').value.trim();
      if (naam.length < 2) {
        meldApp('Vul een naam in.');
        el('ch-naam').focus();
        return;
      }
      bezig(knop, 'Bezig…', function (klaar) {
        meldApp('');
        verstuur('nieuwechauffeur', {
          naam: naam,
          telefoon: el('ch-tel').value,
          email: el('ch-mail').value,
          kenteken: el('ch-kenteken').value
        })
          .then(function (data) {
            ['ch-naam', 'ch-tel', 'ch-mail', 'ch-kenteken'].forEach(function (id) {
              el(id).value = '';
            });
            chauffeurs = [];
            haalChauffeurs();
            /* De code één keer laten zien, boven de lijst. Verder wordt hij
               nergens bewaard; vraag je hem later nog eens, dan haal je hem op
               met Code tonen. */
            var lijst = el('lijst-chauffeurs');
            var vak = maak('div', 'codevak');
            vak.appendChild(maak('b', '', 'Toegangscode voor ' + data.naam));
            vak.appendChild(maak('div', 'codevak__code', data.code));
            vak.appendChild(maak('p', '', 'Geef deze aan hem door. Hij vult hem ' +
              'in op het inlogscherm van dit portaal.'));
            var kop = maak('button', 'knop knop--rand', 'Kopiëren');
            kop.type = 'button';
            kop.addEventListener('click', function () { kopieer(data.code, kop); });
            vak.appendChild(kop);
            lijst.insertBefore(vak, lijst.firstChild);
            klaar(true);
          })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
  }

  function tekenChauffeur(c) {
    var kaart = maak('div', 'klantkaart');
    var kop = maak('div', 'klantkaart__kop');
    var titel = maak('div');
    titel.appendChild(maak('div', 'klantkaart__naam', c.naam || 'Naamloos'));
    var onder = [c.rol];
    if (c.kenteken) { onder.push(c.kenteken); }
    if (c.gezien) { onder.push('laatst gezien ' + datumKort(String(c.gezien).slice(0, 10))); }
    titel.appendChild(maak('div', 'klantkaart__sub', onder.join(' \u00b7 ')));
    kop.appendChild(titel);

    /* Jouw eigen rij. Zodra er meer dan een chauffeur staat wil je in een
       oogopslag zien welke van jou is — anders druk je op de verkeerde knop bij
       iemand die dezelfde rol heeft. */
    var ditBenIk = !!(wieIkBen && wieIkBen.id && wieIkBen.id === c.id);
    var merk = maak('span', 'klantkaart__soort',
      ditBenIk ? 'Jij' : (c.actief ? 'Actief' : 'Uit'));
    if (c.actief) { merk.setAttribute('data-vast', ''); }
    kop.appendChild(merk);
    kaart.appendChild(kop);

    kaart.appendChild(chauffeurNotitie(c));

    var regels = maak('div', 'regels');
    [regel('Telefoon', c.telefoon, true),
     regel('E-mail', c.email, true),
     regel('Kenteken', c.kenteken, true)
    ].forEach(function (r) { if (r) { regels.appendChild(r); } });
    if (regels.childNodes.length) { kaart.appendChild(regels); }

    var knoppen = maak('div', 'klantkaart__knoppen');
    if (c.telefoon) {
      var bel = maak('a', 'knop knop--rand', 'Bellen');
      bel.href = 'tel:' + String(c.telefoon).replace(/\s/g, '');
      knoppen.appendChild(bel);
    }

    /* De code komt pas langs als je erop drukt. Zie haalChauffeurcode in de
       tussenlaag: in het overzicht zit hij bewust niet, want dat overzicht
       belandt in het geheugen van je telefoon. */
    var toon = maak('button', 'knop knop--rand',
      c.heeftCode ? 'Code tonen' : 'Code aanmaken');
    toon.type = 'button';
    toon.addEventListener('click', function () {
      bezig(toon, 'Ophalen…', function (klaar) {
        meldApp('');
        verstuur('chauffeurcode', { id: c.id })
          .then(function (data) { toonCode(kaart, data, c); klaar(true); })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    knoppen.appendChild(toon);

    if (c.heeftCode) {
      var nieuw = maak('button', 'knop knop--weg', 'Nieuwe code');
      nieuw.type = 'button';
      var zeker = false;
      nieuw.addEventListener('click', function () {
        if (!zeker) {
          zeker = true;
          nieuw.textContent = 'Zeker? De oude werkt dan niet meer';
          setTimeout(function () {
            if (zeker) { zeker = false; nieuw.textContent = 'Nieuwe code'; }
          }, 5000);
          return;
        }
        zeker = false;
        bezig(nieuw, 'Bezig…', function (klaar) {
          meldApp('');
          verstuur('chauffeurcode', { id: c.id, nieuw: true })
            .then(function (data) { toonCode(kaart, data, c); klaar(true); })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      knoppen.appendChild(nieuw);
    }

    /* Niet op je eigen rij. Jezelf op non-actief zetten sluit je bij de
       volgende oproep buiten je eigen portaal; de tussenlaag weigert het ook,
       maar een knop die altijd een foutmelding geeft hoort er niet te staan. */
    if (!ditBenIk) {
      var uit = maak('button', 'knop knop--rand', c.actief ? 'Op non-actief' : 'Weer actief');
      uit.type = 'button';
      uit.addEventListener('click', function () {
        bezig(uit, 'Bezig…', function (klaar) {
          meldApp('');
          verstuur('chauffeurbij', { id: c.id, actief: !c.actief })
            .then(function () { chauffeurs = []; haalChauffeurs(); })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      knoppen.appendChild(uit);
    }
    kaart.appendChild(knoppen);
    return kaart;
  }

  /* De code op het scherm, met een knop om hem te kopiëren. Hij blijft staan
     tot je het tabblad verlaat en wordt nergens bewaard. */
  function toonCode(kaart, data, c) {
    var oud = kaart.querySelector('.codevak');
    if (oud) { oud.remove(); }

    var vak = maak('div', 'codevak');
    vak.appendChild(maak('b', '', data.nieuw
      ? 'Nieuwe code voor ' + (data.naam || c.naam)
      : 'Code van ' + (data.naam || c.naam)));
    var code = maak('div', 'codevak__code', data.code);
    vak.appendChild(code);
    vak.appendChild(maak('p', '', data.nieuw
      ? 'De oude code werkt niet meer. Geef deze door; hij logt daarmee opnieuw in.'
      : 'Geef deze door als hij hem kwijt is. Is hij rondgestuurd, maak dan ' +
        'liever een nieuwe.'));

    var kop = maak('button', 'knop knop--rand', 'Kopiëren');
    kop.type = 'button';
    kop.addEventListener('click', function () { kopieer(data.code, kop); });
    vak.appendChild(kop);
    kaart.appendChild(vak);
    c.heeftCode = true;
  }

  function chauffeurNotitie(c) {
    var vak = maak('div', 'notitie');
    var tekst = String(c.notitie || '');
    var toon = maak('button', 'notitie__toon', tekst || 'Notitie toevoegen…');
    toon.type = 'button';
    if (tekst) { vak.setAttribute('data-vol', ''); }

    var bewerk = maak('div', 'notitie__bewerk');
    bewerk.hidden = true;
    var veld = document.createElement('textarea');
    veld.rows = 3;
    veld.maxLength = 2000;
    veld.value = tekst;
    veld.placeholder = 'Rijbewijs verloopt in maart. Werkt dinsdag en donderdag.';
    veld.setAttribute('aria-label', 'Notitie bij ' + (c.naam || 'deze chauffeur'));
    bewerk.appendChild(veld);

    var rij = maak('div', 'knoppen knoppen--twee');
    var op = maak('button', 'knop', 'Opslaan');
    op.type = 'button';
    var af = maak('button', 'knop knop--rand', 'Annuleren');
    af.type = 'button';
    rij.appendChild(op);
    rij.appendChild(af);
    bewerk.appendChild(rij);

    toon.addEventListener('click', function () {
      toon.hidden = true; bewerk.hidden = false; veld.focus();
    });
    af.addEventListener('click', function () {
      veld.value = tekst; bewerk.hidden = true; toon.hidden = false;
    });
    op.addEventListener('click', function () {
      bezig(op, 'Bezig…', function (klaar) {
        meldApp('');
        verstuur('chauffeurbij', { id: c.id, notitie: veld.value })
          .then(function () { chauffeurs = []; haalChauffeurs(); })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });

    vak.appendChild(toon);
    vak.appendChild(bewerk);
    return vak;
  }

  /* Valt er niets te kiezen, dan hoeft er geen menu te zijn. Dat kan alleen
     bij een rol die maar één tabblad overhoudt; een chauffeur heeft er twee en
     krijgt hem dus wel. */
  function regelMenuknop() {
    var knop = el('tabmenu-knop');
    if (!knop) { return; }
    var meer = zichtbareTabs().length > 1;
    knop.hidden = !meer;
    if (!meer) { sluitTabmenu(); }
    tekenMenubel();
  }

  /* ------------------------------------------------------------- het menu

     Dit is de enige manier om van tabblad te wisselen. Alles onder elkaar, met
     de tellers erbij, zodat je in een oogopslag ziet waar werk ligt.

     De lijst wordt bij elke opening opnieuw opgebouwd: welke tabbladen je mag
     zien hangt af van wie er inlogt, en de tellers lopen tijdens het werken op.
     Een lijst die je één keer bouwt loopt achter. */

  function vulTabmenu() {
    var menu = el('tabmenu');
    if (!menu) { return; }
    menu.textContent = '';
    zichtbareTabs().forEach(function (t) {
      var knop = document.createElement('button');
      knop.type = 'button';
      knop.setAttribute('role', 'menuitem');
      knop.textContent = TABNAAM[t] || t;
      if (t === tabblad) { knop.setAttribute('aria-current', 'true'); }
      var aantal = tellers[t] || 0;
      if (aantal) {
        var b = document.createElement('span');
        b.className = 'tab__badge';
        b.textContent = aantal > 99 ? '99+' : String(aantal);
        knop.appendChild(b);
      }
      knop.addEventListener('click', function () {
        sluitTabmenu();
        kiesTab(t);
      });
      menu.appendChild(knop);
    });
  }

  function tabmenuOpen() {
    var k = el('tabmenu-knop');
    return !!k && k.getAttribute('aria-expanded') === 'true';
  }

  function sluitTabmenu() {
    var knop = el('tabmenu-knop');
    var menu = el('tabmenu');
    var balk = document.querySelector('.tabbalk');
    if (knop) { knop.setAttribute('aria-expanded', 'false'); }
    if (menu) { menu.hidden = true; }
    if (balk) { balk.removeAttribute('data-open'); }
  }

  function openTabmenu() {
    var knop = el('tabmenu-knop');
    var menu = el('tabmenu');
    var balk = document.querySelector('.tabbalk');
    vulTabmenu();
    if (knop) { knop.setAttribute('aria-expanded', 'true'); }
    if (menu) { menu.hidden = false; }
    if (balk) { balk.setAttribute('data-open', ''); }
  }

  (function knoopTabmenu() {
    var knop = el('tabmenu-knop');
    if (!knop) { return; }
    knop.addEventListener('click', function (e) {
      e.stopPropagation();
      if (tabmenuOpen()) { sluitTabmenu(); } else { openTabmenu(); }
    });
    /* Ergens anders drukken hoort het menu te sluiten. Zonder dit blijft hij
       openstaan over de rit waar je net op wilde drukken. */
    document.addEventListener('click', function (e) {
      if (!tabmenuOpen()) { return; }
      var menu = el('tabmenu');
      if (menu && menu.contains(e.target)) { return; }
      if (knop.contains(e.target)) { return; }
      sluitTabmenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tabmenuOpen()) { sluitTabmenu(); }
    });
  })();

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
      /* Een open wijzigverzoek van een klant. Staat boven het afzeggen omdat
         het nog te regelen is: hier kun je nog iets mee, bij een afzegging
         niet meer. */
      if (r.wijzigStand === 'Open') {
        uit.push({
          sleutel: 'wijzig:' + r.id + ':' + (r.wijzigOp || ''),
          klasse: 'meld--let',
          titel: String(r.wijzigSoort || 'Wijziging') + ' gevraagd',
          regel: (r.klant || r.naam || 'Rit') + ' op ' + datumKort(r.datum) +
                 ' \u2014 ' + String(r.wijzigverzoek || ''),
          wanneer: r.wijzigOp || '',
          tab: 'ritten',
          dag: r.datum
        });
      }

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
      schrijf('dagstaat', {
        dag: dag,
        begin: el('teller-begin').value.trim(),
        eind: el('teller-eind').value.trim(),
        opmerking: el('teller-opmerking').value
      }).then(function (data) {
        if (data.wacht) {
          /* De ingetypte standen blijven staan waar ze staan; vulTeller zou ze
             overschrijven met wat de tussenlaag laatst zei, en dat is ouder. */
          meldTeller('Bewaard op deze telefoon. Wordt verstuurd zodra je bereik hebt.');
          return;
        }
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

  /* Wat er in een getalveld staat, als getal. Een komma is wat je op een
     Nederlandse telefoon intikt; leeg of onzin is nul. Wordt gebruikt om het
     scherm bij te werken zolang de tussenlaag nog niets teruggezegd heeft. */
  function getal(waarde) {
    var n = Number(String(waarde === undefined || waarde === null ? '' : waarde)
      .replace(',', '.').trim());
    return isFinite(n) ? n : 0;
  }

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
  /* Het tarief bij een ritsoort, uit assets/site.js. Hier stond eerst een eigen
     tabel met dezelfde vier bedragen erin. Die kon weg toen dit portaal site.js
     ging laden voor het tabblad Prijs: één plek waar de tarieven staan is één
     plek om te vergeten bij te werken.

     Airtable noemt een ritsoort bij zijn volledige naam ("Spoedtransport"),
     site.js gebruikt sleutels ("spoed"). Daarom zoeken we op naam. */
  function tariefVan(soort) {
    if (!window.SL || !window.SL.CONFIG) { return null; }
    var ritten = window.SL.CONFIG.ritten;
    var sleutels = Object.keys(ritten);
    for (var i = 0; i < sleutels.length; i++) {
      if (ritten[sleutels[i]].naam === soort) { return ritten[sleutels[i]]; }
    }
    return ritten.standaard || null;
  }

  /* Geeft null terug als de rekenmachine er niet is. De knop verdwijnt dan;
     zie conceptKnop. Beter een knop die er niet staat dan een knop die een
     bedrag toont dat nergens op berust. */
  function conceptLink(rit) {
    var t = tariefVan(rit.type);
    if (!t) { return null; }
    var km = Number(rit.km) || 0;
    var ritprijs = Math.max(t.start + km * t.km,
                            t.minimum || window.SL.CONFIG.minimum);
    /* De tijdtoeslag rekent hetzelfde als de site en als Airtable: een
       percentage van de ritprijs met een ondergrens. Ook die twee getallen
       komen nu uit site.js, om dezelfde reden als het tarief hierboven: ze
       stonden hier los ingetikt en liepen dus achter zodra ze daar wijzigden.
       Airtable noemt het tijdvak bij de naam die site.js er ook aan geeft. */
    var tv = null;
    var tijdSleutels = Object.keys(window.SL.CONFIG.tijden);
    for (var j = 0; j < tijdSleutels.length; j++) {
      var kandidaat = window.SL.CONFIG.tijden[tijdSleutels[j]];
      if (kandidaat.naam === rit.tijdvak) { tv = kandidaat; }
    }
    var deel = tv ? tv.deel : 0;
    var bodem = tv ? tv.bodem : 0;
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
    q.set('stoptarief', String(window.SL.CONFIG.stoptoeslag));
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
    var adres = conceptLink(rit);
    if (!adres) { return null; }
    var a = maak('a', 'knop knop--rand', 'Bekijk de conceptfactuur');
    a.href = adres;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  /* Op een iPhone opent een routelink Kaarten, de app die er al op staat en
     waar CarPlay mee praat. Elders Google Maps, want maps.apple.com toont op
     Android alleen een webpagina die niets kan.

     Een iPad meldt zich sinds iPadOS 13 als Macintosh; die vangen we op het
     aanraakscherm. Een gewone Mac krijgt Google Maps: daar zit je achter een
     bureau en is een kaart in een tabblad handiger dan een app die opent. */
  function opApple() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) ||
           (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  /* Opent de kaartenapp met deze bestemming. Werkt zonder sleutel of account;
     staat de app niet op de telefoon, dan opent de site. */
  function routeNaar(adres) {
    if (opApple()) {
      return 'https://maps.apple.com/?dirflg=d&daddr=' + encodeURIComponent(adres);
    }
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
           encodeURIComponent(adres);
  }

  /* De hele route van ophalen naar bezorgen. Hiermee lees je de kortste
     afstand af en tik je hem hieronder in. Automatisch overnemen kan niet:
     daar is een betaalde sleutel bij Google voor nodig, en die hoort niet in
     een pagina te staan die iedereen kan openen. */
  function routeVan(van, naar) {
    if (opApple()) {
      return 'https://maps.apple.com/?dirflg=d&saddr=' + encodeURIComponent(van) +
             '&daddr=' + encodeURIComponent(naar);
    }
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

  /* De tijdvakken met hun toeslag erachter. Die tekst stond hier ingetikt als
     "+ € 15" en "+ € 35", en dat was een oud tarief: de toeslag is allang een
     percentage met een bodem. Het bedrag klopte wel — dat rekent Airtable — maar
     het label loog, en dan ga je zoeken naar een fout die er niet is.

     Daarom nu afgeleid uit window.SL.CONFIG, dezelfde bron als de rekenmachine
     en het tabblad Prijs. Verhoog je een toeslag, dan verandert dit mee. */
  function tijdvakLabels() {
    var t = window.SL && window.SL.CONFIG && window.SL.CONFIG.tijden;
    if (!t) {
      /* site.js niet geladen: dan liever geen bedrag dan een verzonnen bedrag. */
      return [['Overdag', 'Overdag'],
              ['Avondrit (18:00-23:00)', 'Avond 18:00-23:00'],
              ['Nacht- of weekendrit', 'Nacht of weekend']];
    }
    var pct = function (r) {
      return Math.round(r.deel * 100) + '% (min. € ' + r.bodem + ')';
    };
    return [
      ['Overdag', 'Overdag — geen toeslag'],
      ['Avondrit (18:00-23:00)', 'Avond 18:00-23:00 — + ' + pct(t.avond)],
      ['Nacht- of weekendrit', 'Nacht of weekend — + ' + pct(t.nacht)]
    ];
  }

  function tijdvakVeld(gekozen) {
    var veld = maak('label', 'veld');
    veld.style.margin = '0';
    veld.appendChild(maak('span', '', 'Tijdvak'));
    var keuze = document.createElement('select');
    tijdvakLabels().forEach(function (t) {
      var optie = document.createElement('option');
      optie.value = t[0];
      optie.textContent = t[1];
      keuze.appendChild(optie);
    });
    keuze.value = gekozen || 'Overdag';
    veld.appendChild(keuze);
    veld.invoer = keuze;

    /* Een hint als de ophaaltijd iets anders zegt dan wat er gekozen staat.
       Niet zelf omzetten: je kunt met een klant een dagtarief hebben afgesproken
       voor een rit die om zeven uur vertrekt, en dan is stilletjes je prijs
       verhogen erger dan een tijdvak dat niet klopt. Dus: melden, met een knop.

       Zaterdag en zondag tellen als weekend, ongeacht het uur — dat zit al in
       tijdvakUit in site.js, en die gebruiken we hier in plaats van hem na te
       bouwen. */
    var hint = maak('div', 'terzijde');
    hint.hidden = true;
    veld.appendChild(hint);
    veld.toetsTijd = function (datum, tijd) {
      hint.hidden = true;
      hint.innerHTML = '';
      if (!window.SL || !window.SL.tijdvakUit || !window.SL.CONFIG) { return; }
      var sleutel = window.SL.tijdvakUit(datum, tijd);
      var hoort = (window.SL.CONFIG.tijden[sleutel] || {}).naam;
      if (!hoort || hoort === keuze.value) { return; }

      hint.hidden = false;
      hint.appendChild(document.createTextNode(
        (tijd ? 'Ophaaltijd ' + tijd : 'Deze datum') +
        ' valt onder \u201c' + hoort + '\u201d. '));
      var knop = maak('button', 'knop knop--rand', 'Overnemen');
      knop.type = 'button';
      knop.style.marginTop = '6px';
      knop.addEventListener('click', function () {
        keuze.value = hoort;
        hint.hidden = true;
      });
      hint.appendChild(knop);
    };
    return veld;
  }

  /* Een tekstlink onder een invoerveld, voor iets wat je opzoekt en daarna
     zelf invult. */
  function afstandLink(van, naar) {
    if (!van || !naar) { return null; }
    var a = maak('a', 'veldlink', 'Kortste route opzoeken in Maps');
    a.href = veiligAdres(routeVan(van, naar));
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

    /* Wat je onderweg overtypt in een ander scherm krijgt een knop. Een adres
       in de navigatie van de bus, een ritnummer in een appje aan de klant, een
       telefoonnummer dat je in WhatsApp wilt zoeken in plaats van bellen: dat
       zijn de vier die je anders met een duim en een schuin oog overneemt, en
       daar gaat een cijfer bij mis. */
    function regel(naam, waarde, kopieerbaar) {
      if (!waarde && waarde !== 0) { return; }
      dl.appendChild(maak('dt', '', naam));
      var dd = maak('dd');
      dd.appendChild(maak('span', '', String(waarde)));
      if (kopieerbaar) {
        var knop = maak('button', 'paar__kopie', 'Kopieer');
        knop.type = 'button';
        knop.setAttribute('aria-label', naam + ' kopiëren');
        knop.addEventListener('click', function () { kopieer(String(waarde), knop); });
        dd.appendChild(knop);
      }
      dl.appendChild(dd);
    }
    regel('Rit', rit.naam, true);
    regel('Soort', rit.type);
    regel('Ophalen', rit.ophaal, true);
    regel('Bezorgen', rit.aflever, true);
    regel('Telefoon', rit.telefoon, true);
    regel('Ter plaatse', rit.contact, true);
    regel('Tel. daar', rit.contactTel, true);
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

    /* --- de klant vraagt een wijziging --- */
    if (rit.wijzigStand) { lijf.appendChild(wijzigBlok(rit)); }

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
        vak.href = veiligAdres(rit.krabbel);
        vak.target = '_blank';
        vak.rel = 'noopener';
        var afb = document.createElement('img');
        afb.src = veiligePlaat(rit.krabbel);
        afb.alt = 'Handtekening van ' + (rit.getekend || 'de ontvanger');
        afb.loading = 'lazy';
        vak.appendChild(afb);
        lijf.appendChild(vak);
      }
    }

    /* Deze rit draagt iets dat nog verstuurd moet worden. Dat hoort op de
       kaart zelf te staan en niet alleen in de balk bovenaan: daar staat een
       aantal, hier staat welke. */
    if (rit.wacht) {
      var wachtvak = maak('div', 'bewijs bewijs--wacht');
      var wt = maak('div');
      wt.appendChild(maak('b', '', 'Nog niet verstuurd'));
      wt.appendChild(document.createTextNode(
        'Wat je hier invulde staat op deze telefoon en gaat weg zodra je ' +
        'bereik hebt. Sluit de app niet af voordat dat gebeurd is.'));
      wachtvak.appendChild(wt);
      lijf.appendChild(wachtvak);
    }

    /* --- foto's ---
       Bewust buiten het blok hierboven: een foto hoort niet alleen bij een
       aflevering. Schade die je bij het laden al ziet leg je vast voordat je
       wegrijdt, en dan staat de rit nog op Gepland. */
    if (rit.fotos && rit.fotos.length) {
      var fotovak = maak('div', 'fotos');
      rit.fotos.forEach(function (f, nr) {
        var vakje = maak('a', '');
        vakje.href = veiligAdres(f.url);
        vakje.target = '_blank';
        vakje.rel = 'noopener';
        var plaat = document.createElement('img');
        /* De miniatuur die Airtable zelf maakte; is die er niet, dan de hele
           foto. Vier foto's op ware grootte op één ritkaart zijn een paar
           megabyte over mobiel internet. */
        plaat.src = veiligePlaat(f.klein || f.url);
        plaat.alt = 'Foto ' + (nr + 1) + ' bij deze rit';
        plaat.loading = 'lazy';
        vakje.appendChild(plaat);
        fotovak.appendChild(vakje);
      });
      lijf.appendChild(fotovak);
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
      /* Meteen kijken of de ophaaltijd iets anders zegt dan wat er staat. */
      tvVeldRit.toetsTijd(rit.datum, rit.tijd);

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
          schrijf('ritkm', {
            id: rit.id,
            km: kmVeldRit.invoer.value,
            stops: stopVeldRit.invoer.value,
            tijdvak: tvVeldRit.invoer.value,
            wachttijd: wachtVeld.invoer.value,
            doorbereken: doorVeld.invoer.value,
            korting: kortVeld.invoer.value,
            kortingRe: redenVeldRit.invoer.value
          }, function () {
            /* Wat we zelf weten. Het bedrag en de winst rekent Airtable uit,
               dus die blijven staan op wat ze waren tot de rij leeg is — met
               de balk erboven die zegt dat er nog iets openstaat. */
            return Object.assign({}, rit, {
              wacht: true,
              km: getal(kmVeldRit.invoer.value),
              stops: getal(stopVeldRit.invoer.value),
              tijdvak: tvVeldRit.invoer.value || rit.tijdvak,
              wachttijd: getal(wachtVeld.invoer.value),
              doorbereken: getal(doorVeld.invoer.value),
              korting: getal(kortVeld.invoer.value),
              kortingRe: redenVeldRit.invoer.value
            });
          }).then(function (data) {
            ververs(data.rit);
            meldApp('');
            klaar(true);
          }).catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      lijf.appendChild(kmKnop);

      lijf.appendChild(contactBlok(rit));
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
        nav.href = veiligAdres(routeNaar(doel));
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

    /* Staat je voor een gesloten poort, dan wil je niet het kantoor van de
       klant bellen maar de man die achter dat hek staat. Deze knop staat
       bovenaan in de rij, want dat is het moment waarop je hem nodig hebt. */
    if (rit.contactTel) {
      var belDaar = maak('a', 'knop knop--rand',
        'Bel ' + (rit.contact || 'ter plaatse'));
      belDaar.href = 'tel:' + String(rit.contactTel).replace(/[^\d+]/g, '');
      knoppen.insertBefore(belDaar, knoppen.firstChild);
    }

    /* Op elk moment van de rit kunnen zien wat de factuur wordt. Niet alleen
       aan het eind: juist onderweg wil je weten of die wachttijd van veertig
       minuten en die tol er goed op staan, want daarna is de rit uitgevoerd en
       staat de factuur er. */
    var concept = conceptKnop(rit);
    if (concept) { knoppen.appendChild(concept); }

    /* Een rit die nog vrij ligt: dan is oppakken het enige wat er te doen is,
       en de knop Onderweg zou onzin zijn — je kunt niet vertrekken met een rit
       die niet van jou is. */
    var vrij = rit.status === 'Gepland' && !String(rit.chauffeur || '').trim();
    var vanMij = !!wieIkBen && !!rit.chauffeur &&
      String(rit.chauffeur).trim().toLowerCase() ===
      String(wieIkBen.naam || '').trim().toLowerCase();

    /* Oppakken mag iedereen die rijdt, jij ook: dan staat jouw naam op de rit
       in plaats van 'niemand', en dat is wat een chauffeur en jijzelf later
       willen zien. De naam komt van de tussenlaag — voor jou uit EIGENAAR_NAAM
       in wrangler.toml, voor een chauffeur uit zijn eigen regel.

       Voor jou staat de knop Onderweg er wél naast: jij hoeft niet eerst te
       claimen om te kunnen vertrekken. Voor een chauffeur wel — anders rijdt
       hij een rit die op niemands naam staat. */
    var benChauffeur = !!wieIkBen && wieIkBen.rol !== 'Eigenaar';
    if (vrij) {
      var pak = maak('button', 'knop knop--groen', 'Ik rijd hem');
      pak.type = 'button';
      pak.addEventListener('click', function () {
        bezig(pak, 'Bezig…', function (klaar) {
          meldApp('');
          verstuur('ritoppakken', { id: rit.id })
            .then(function (data) { ververs(data.rit); })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      knoppen.appendChild(pak);
    }

    /* Loslaten mag zolang je niet vertrokken bent. Alleen bij je eigen rit, en
       alleen als je chauffeur bent: de eigenaar heeft de planknoppen. */
    /* Vrijgeven: de rit terug in de pot, zodat een ander hem kan oppakken.
       Voor een chauffeur alleen zijn eigen rit; voor jou elke rit die nog
       gepland staat — jij bent degene die herverdeelt. */
    var magVrijgeven = rit.status === 'Gepland' &&
      String(rit.chauffeur || '').trim() &&
      (vanMij || (wieIkBen && wieIkBen.rol === 'Eigenaar'));
    if (magVrijgeven) {
      var los = maak('button', 'knop knop--rand',
        vanMij ? 'Toch niet rijden' : 'Vrijgeven (' + rit.chauffeur + ' eraf)');
      los.type = 'button';
      los.addEventListener('click', function () {
        bezig(los, 'Bezig…', function (klaar) {
          meldApp('');
          verstuur('ritloslaten', { id: rit.id })
            .then(function (data) { ververs(data.rit); })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      knoppen.appendChild(los);
    }

    if (rit.status === 'Gepland' && !(vrij && benChauffeur)) {
      var vertrek = maak('button', 'knop knop--blauw', 'Onderweg');
      vertrek.type = 'button';
      vertrek.addEventListener('click', function () {
        wijzigStatus(rit, 'Onderweg', vertrek);
      });
      knoppen.appendChild(vertrek);
    }

    if (rit.status !== 'Geannuleerd') { voegFotoknopToe(knoppen, rit); }

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

    /* Weggooien staat helemaal onderaan en vraagt om twee keer drukken. Het is
       er voor een vergissing en voor het uitproberen, niet voor dagelijks
       gebruik — en de tussenlaag weigert het bij een uitgevoerde rit of een
       verstuurde factuur, dus wat hier weg kan is ook wat weg mag.

       Deze regel hoort ná het aanmaken van `knoppen` te staan. Stond hij eerder
       hoger in deze functie, en dat gaf `undefined is not an object`: door
       var-hoisting bestaat de naam daar al maar is hij nog leeg, dus het viel
       niet op bij het laden maar bij het tekenen van elke rit. */
    if (wieIkBen && wieIkBen.rol === 'Eigenaar' && rit.status !== 'Uitgevoerd') {
      knoppen.appendChild(weggooiKnop('Rit verwijderen', 'ritweg', rit.id));
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
    stipBij();
  }

  /* ------------------------------------------------- foto bij de rit

     Waar de pallet is neergezet, hoe de doos erbij stond, of de schade die er
     al op zat toen je hem ophaalde. Een handtekening zegt dat iemand tekende;
     een foto zegt waarvoor. */

  /* Een foto van een moderne telefoon is drie tot acht megabyte. Dat duw je
     onderweg niet door een slechte verbinding, en als bewijs is het ook niet
     nodig: op 1600 pixels lees je een adreslabel en zie je waar iets staat.
     Verkleinen gebeurt daarom hier, op de telefoon. */
  var FOTO_MAX = 1600;

  function verkleinFoto(bestand) {
    return new Promise(function (klaar, mislukt) {
      var adres = URL.createObjectURL(bestand);
      var afb = new Image();
      afb.onload = function () {
        URL.revokeObjectURL(adres);
        var schaal = Math.min(1, FOTO_MAX / Math.max(afb.width, afb.height));
        var doek = document.createElement('canvas');
        doek.width = Math.max(1, Math.round(afb.width * schaal));
        doek.height = Math.max(1, Math.round(afb.height * schaal));
        /* Een foto die je liggend maakte staat rechtop dankzij een merkje in
           het bestand. Browsers passen dat sinds een paar jaar zelf toe bij
           het tekenen, dus daar hoeven we niets voor te doen. */
        doek.getContext('2d').drawImage(afb, 0, 0, doek.width, doek.height);
        klaar(doek.toDataURL('image/jpeg', 0.8));
      };
      afb.onerror = function () {
        URL.revokeObjectURL(adres);
        mislukt(new Error('Die foto kon ik niet lezen.'));
      };
      afb.src = adres;
    });
  }

  /* De knop en het verborgen bestandsveld staan naast elkaar, niet in elkaar.
     Zat het veld in de knop, dan zou de klik die wij zelf op dat veld geven
     weer omhoog borrelen naar de knop en zichzelf eindeloos opnieuw starten.

     capture zegt tegen de telefoon: open meteen de camera aan de achterkant.
     Bij een aflevering wil je niet eerst door een keuzemenu. Wil je juist een
     foto van eerder kunnen pakken, dan is dat dit ene kenmerk minder. */
  function voegFotoknopToe(knoppen, rit) {
    var knop = maak('button', 'knop knop--rand',
      rit.fotos && rit.fotos.length ? 'Nog een foto' : 'Foto maken');
    knop.type = 'button';

    var veld = document.createElement('input');
    veld.type = 'file';
    veld.accept = 'image/*';
    veld.setAttribute('capture', 'environment');
    veld.hidden = true;

    veld.addEventListener('change', function () {
      var bestand = veld.files && veld.files[0];
      /* Leegmaken, anders geeft dezelfde foto een tweede keer geen wijziging
         meer en gebeurt er niets als je hem opnieuw kiest. */
      veld.value = '';
      if (bestand) { stuurFoto(rit, bestand, knop); }
    });
    knop.addEventListener('click', function () { veld.click(); });

    knoppen.appendChild(knop);
    knoppen.appendChild(veld);
  }

  function stuurFoto(rit, bestand, knop) {
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig\u2026';
    meldApp('');

    /* Een naam die maar één keer bestaat. Daar hangt aan de andere kant het
       slot aan dat voorkomt dat dezelfde foto er twee keer aan komt te hangen
       als hetzelfde verzoek uit de wachtrij opnieuw verstuurd wordt. */
    var naam = 'foto-' + Date.now() + '-' +
               Math.random().toString(36).slice(2, 8) + '.jpg';

    verkleinFoto(bestand)
      .then(function (data) {
        return schrijf('ritfoto', { id: rit.id, naam: naam, data: data }, function () {
          /* Zolang hij nog niet weg is staat de foto uit de telefoon zelf op
             de kaart. Anders lijkt het alsof je hem niet gemaakt hebt. */
          return Object.assign({}, rit, {
            wacht: true,
            fotos: (rit.fotos || []).concat([{ naam: naam, url: data, klein: data }])
          });
        });
      })
      .then(function (data) { ververs(data.rit); })
      .catch(function (fout) {
        meldApp(fout.message);
        knop.disabled = false;
        knop.textContent = oud;
      });
  }

  function wijzigStatus(rit, status, knop) {
    var oud = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig…';
    meldApp('');
    schrijf('status', { id: rit.id, status: status }, function () {
      return Object.assign({}, rit, { status: status, wacht: true });
    })
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
    var conceptAanvraag = conceptKnop({
      type: a.dienst, km: a.afstand, stops: a.stops, tijdvak: a.tijdvak,
      ophaal: a.ophaal, aflever: a.aflever, klant: a.bedrijf,
      datum: a.datum, wachttijd: 0, doorbereken: 0, korting: 0, kortingRe: ''
    });
    if (conceptAanvraag) { knoppen.appendChild(conceptAanvraag); }

    if (a.telefoon) {
      var bel = maak('a', 'knop knop--rand', 'Bel ' + (a.contact || a.bedrijf || 'de klant'));
      bel.href = 'tel:' + String(a.telefoon).replace(/[^\d+]/g, '');
      knoppen.appendChild(bel);
    }
    if (a.email) {
      var mail = maak('a', 'knop knop--rand', 'Mail');
      mail.href = veiligAdres('mailto:' + a.email);
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

  /* --------------------------------------------------------- facturen

     Terugzoeken wat een klant heeft gehad, en die factuur opnieuw kunnen
     delen. Twee links per factuur en dat is met opzet: die van jou opent de
     pagina met de beheerbalk (de knop Opslaan als PDF), die je deelt is
     dezelfde pagina zonder die balk. */

  function factuurNummerachtig(term) {
    /* Iets met minstens twee cijfers erin, of iets dat op SL-2026- lijkt.
       Zo gaat een zoekopdracht op "bakker" niet ook nog de facturen af. */
    return /\d{2}/.test(term) || /^sl-?\d*/i.test(term);
  }

  function haalFacturenVan(klantId, knop) {
    bezig(knop, 'Ophalen\u2026', function (klaar) {
      verstuur('facturen', { klantId: klantId })
        .then(function (data) {
          facturen[klantId] = data.facturen || [];
          tekenKlanten();
        })
        .catch(function (fout) { meldApp(fout.message); klaar(false); });
    });
  }

  /* Delen gaat via het deelvenster van de telefoon, want daar zit WhatsApp in
     en dat is hoe je een klant werkelijk bereikt. Kan de browser dat niet, dan
     komt de link op het klembord. */
  function deelFactuur(f, knop) {
    var tekst = 'Factuur ' + f.nummer + ' van Schaap Express Transport';
    if (navigator.share) {
      navigator.share({ title: tekst, text: tekst, url: f.klantlink })
        .catch(function () { /* afgebroken door de gebruiker; niets aan de hand */ });
      return;
    }
    kopieer(f.klantlink, knop);
  }

  function tekenFactuur(f) {
    var vak = maak('div', 'factuur');

    var kop = maak('div', 'factuur__kop');
    kop.appendChild(maak('span', 'factuur__nr', f.nummer || 'Nog geen nummer'));
    var stand = maak('span', 'factuur__stand', f.status);
    stand.setAttribute('data-stand', f.status);
    kop.appendChild(stand);
    kop.appendChild(maak('span', 'factuur__bedrag', euroCent.format(f.totaal || 0)));
    vak.appendChild(kop);

    var rijen = maak('dl', 'factuur__rij');
    rijen.style.display = 'block';
    [['Datum', f.datum ? datumKort(f.datum) : ''],
     ['Vervalt', f.vervalt ? datumKort(f.vervalt) : ''],
     ['Rit', f.ritdatum ? datumKort(f.ritdatum) : ''],
     ['Route', f.ophaal && f.aflever ? f.ophaal + ' \u2192 ' + f.aflever : ''],
     ['Soort', f.type],
     ['Kilometers', f.km ? f.km + ' km' : ''],
     ['Referentie', f.referentie],
     ['Excl. btw', euroCent.format(f.subtotaal || 0)],
     ['Btw', euroCent.format(f.btw || 0)],
     ['Betaald', f.betaald ? euroCent.format(f.betaald) : ''],
     ['Verstuurd', f.verzonden ? datumKort(f.verzonden) : ''],
     ['Herinnerd', f.herinnerd ? datumKort(String(f.herinnerd).slice(0, 10)) : '']
    ].forEach(function (paar) {
      if (!paar[1]) { return; }
      var r = maak('div', 'factuur__rij');
      r.appendChild(maak('dt', '', paar[0]));
      r.appendChild(maak('dd', '', String(paar[1])));
      rijen.appendChild(r);
    });
    vak.appendChild(rijen);

    if (Number(f.openstaand) > 0) {
      vak.appendChild(maak('p', 'factuur__open',
        euroCent.format(f.openstaand) + ' staat nog open' +
        (f.telaat ? ', ' + f.telaat + ' dagen te laat.' : '.')));
    }
    /* Een creditnota zonder die zin ziet eruit als een gewone factuur met een
       raar bedrag. */
    if (f.creditVan) {
      vak.appendChild(maak('p', 'factuur__uitleg',
        'Creditnota; draait factuur ' + f.creditVan + ' terug.'));
    }

    /* Alleen een concept mag weg. Een verstuurde factuur draai je terug met een
       creditnota: je nummering hoort aaneensluitend te zijn, en een gat erin is
       precies wat bij een controle opvalt. De tussenlaag weigert het ook, maar
       een knop die je aanbiedt en dan weigert is een knop die niet hoort te
       staan. */
    if (f.status === 'Concept' && wieIkBen && wieIkBen.rol === 'Eigenaar') {
      var weg = weggooiKnop('Concept verwijderen', 'factuurweg', f.id);
      weg.classList.add('factuur__weg');
      vak.appendChild(weg);
    }
    if (f.gecrediteerd) {
      vak.appendChild(maak('p', 'factuur__uitleg',
        'Teruggedraaid met creditnota ' + f.gecrediteerd + '.'));
    }

    var knoppen = maak('div', 'factuur__knoppen');
    if (f.link) {
      var open = maak('a', 'knop knop--rand', 'Bekijken');
      open.href = veiligAdres(f.link);
      open.target = '_blank';
      open.rel = 'noopener';
      knoppen.appendChild(open);

      var deel = maak('button', 'knop knop--rand', 'Link sturen');
      deel.type = 'button';
      deel.addEventListener('click', function () { deelFactuur(f, deel); });
      knoppen.appendChild(deel);
    }
    if (f.pdf) {
      var pdf = maak('a', 'knop knop--stil', 'PDF');
      pdf.href = veiligAdres(f.pdf);
      pdf.target = '_blank';
      pdf.rel = 'noopener';
      knoppen.appendChild(pdf);
    }
    if (knoppen.childNodes.length) { vak.appendChild(knoppen); }

    return vak;
  }

  /* ---------------------------------------------------------- klanten

     Opzoeken wie iemand is terwijl je aan de telefoon zit. Er wordt niets
     extra's opgehaald: de klantenlijst komt al mee met het dagoverzicht, dus
     zoeken gaat hier in de telefoon en niet over het netwerk. Dat is meteen
     het snelste wat er is — je typt en het staat er.

     Wat een chauffeur betreft: dit tabblad is voor hem verborgen, en de
     tussenlaag haalt zijn klantenlijst niet eens op. */

  function zoekterm() {
    var v = el('klant-zoek');
    return v ? v.value.trim().toLowerCase() : '';
  }

  /* Zoeken over alles wat je van een klant zou kunnen weten als je hem
     opzoekt: de naam, maar ook het nummer op zijn factuur, het adres waar je
     hebt gestaan, of het nummer waarvan hij belt. */
  function klantPast(k, term) {
    if (!term) { return true; }
    var hooi = [k.naam, k.nummer, k.adres, k.email, k.telefoon, k.soort]
      .join(' ').toLowerCase();
    /* Losse woorden, allemaal ergens: "bakker eindhoven" vindt hem ook. */
    return term.split(/\s+/).every(function (w) { return hooi.indexOf(w) >= 0; });
  }

  /* Onthoudt waar het laatst naar gezocht is, zodat elke toetsaanslag niet een
     nieuw verzoek oplevert terwijl je een nummer aan het intypen bent. */
  var factuurZoekTerm = '';
  var factuurZoekBezig = false;

  function zoekFacturen(term) {
    if (term === factuurZoekTerm || factuurZoekBezig) { return; }
    factuurZoekBezig = true;
    verstuur('facturen', { nummer: term })
      .then(function (data) {
        factuurZoekTerm = term;
        factuurZoek = data.facturen || [];
      })
      .catch(function () { factuurZoek = []; })
      .then(function () {
        factuurZoekBezig = false;
        /* Alleen hertekenen als er ondertussen niets anders is ingetypt. */
        if (zoekterm() === term) { tekenKlanten(); }
      });
  }

  function tekenKlanten() {
    var lijst = el('lijst-klanten');
    if (!lijst) { return; }
    var term = zoekterm();
    var leegknop = el('klant-zoek-leeg');
    if (leegknop) { leegknop.hidden = !term; }

    lijst.innerHTML = '';

    if (!klanten.length) {
      lijst.appendChild(maak('div', 'leeg',
        'Nog geen klanten. Ze komen er vanzelf bij zodra je er een koppelt ' +
        'aan een opdracht.'));
      return;
    }

    /* Een klant belt met een factuurnummer in zijn hand. Dat nummer staat
       nergens in de klantenlijst, dus daar wordt apart naar gezocht. */
    if (term && factuurNummerachtig(term)) { zoekFacturen(term); }
    if (factuurZoek.length && term && factuurNummerachtig(term)) {
      var kop = maak('div', 'klantkaart');
      kop.appendChild(maak('div', 'klantkaart__kop', ''));
      kop.firstChild.appendChild(maak('div', 'klantkaart__naam',
        factuurZoek.length === 1 ? 'Eén factuur gevonden'
                                 : factuurZoek.length + ' facturen gevonden'));
      factuurZoek.forEach(function (f) {
        var vak = tekenFactuur(f);
        if (f.klant) {
          vak.insertBefore(maak('p', 'factuur__uitleg', 'Van ' + f.klant), vak.childNodes[1]);
        }
        kop.appendChild(vak);
      });
      lijst.appendChild(kop);
    }

    var gevonden = klanten.filter(function (k) { return klantPast(k, term); });
    if (!gevonden.length) {
      if (!factuurZoek.length || !factuurNummerachtig(term)) {
        lijst.appendChild(maak('div', 'leeg', 'Niets gevonden op \u201c' + term + '\u201d.'));
      }
      return;
    }

    /* Wie geld openstaan heeft eerst, daarna op naam. Als je iemand opzoekt
       terwijl hij belt, is dat het eerste wat je wilt weten. */
    gevonden.sort(function (a, b) {
      var v = (Number(b.openstaand) || 0) - (Number(a.openstaand) || 0);
      return v !== 0 ? v : String(a.naam).localeCompare(String(b.naam), 'nl');
    });

    gevonden.forEach(function (k) { lijst.appendChild(tekenKlantkaart(k)); });
  }

  /* Een regel met een kopieerknop erachter. Dat knopje is de hele reden dat
     dit tabblad bestaat: een adres of telefoonnummer overtypen vanaf een
     telefoon is waar het misgaat. */
  function regel(label, waarde, kopieerbaar) {
    if (!waarde) { return null; }
    var r = maak('div', 'regel');
    r.appendChild(maak('span', 'regel__label', label));
    r.appendChild(maak('span', 'regel__waarde', String(waarde)));
    if (kopieerbaar) {
      var knop = maak('button', 'regel__kopie', 'Kopieer');
      knop.type = 'button';
      knop.addEventListener('click', function () { kopieer(String(waarde), knop); });
      r.appendChild(knop);
    }
    return r;
  }

  /* Het opschrift wordt onthouden en teruggezet. Eerst stond hier het woord
     "Kopieer" hard ingetikt, en dat werkt zolang elke knop zo heet; de knop op
     de prijsopgave heet anders en kreeg dan na anderhalve seconde de verkeerde
     naam. */
  function kopieer(tekst, knop) {
    var opschrift = knop.textContent;
    var klaar = function () {
      knop.textContent = 'Gekopieerd';
      knop.setAttribute('data-klaar', '');
      setTimeout(function () {
        knop.textContent = opschrift;
        knop.removeAttribute('data-klaar');
      }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tekst).then(klaar, function () {
        knop.textContent = 'Lukt niet';
      });
    } else {
      knop.textContent = 'Lukt niet';
    }
  }

  /* Het klantportaal, vanuit de klantkaart. Dit stond eerst alleen bij een
     opdracht onder Planning, en dat betekende dat je een klant zonder
     openstaande opdracht nergens kon uitnodigen. Hier hoort het thuis: je zoekt
     iemand op en regelt het meteen. */
  /* De tariefafspraak met deze klant, plus het contract eronder.

     Leeg laten betekent: gewoon het standaardtarief van de dienst. Vul je iets
     in, dan geldt dat vanaf de volgende rit die je voor hem inplant — oude
     ritten dragen het tarief dat er toen gold, en dat hoort zo: een factuur van
     vorige maand mag niet meebewegen omdat je vandaag iets anders afspreekt. */
  function tariefBlok(k) {
    var blok = maak('details', 'vouw');
    var afgesproken = (k.start > 0) || (k.kmNorm > 0) || (k.kmSpoed > 0);
    var kop = maak('summary', 'vouw__kop');
    kop.appendChild(maak('span', '', 'Tarief en contract'));
    kop.appendChild(maak('b', '', afgesproken ? 'eigen afspraak' : 'standaardtarief'));
    blok.appendChild(kop);

    var lijf = maak('div', 'vouw__lijf');
    lijf.appendChild(maak('div', 'terzijde',
      'Laat leeg voor het gewone tarief. Wat je hier invult geldt vanaf de ' +
      'volgende rit die je voor deze klant inplant; ritten die er al staan ' +
      'blijven op hun eigen tarief.'));

    var rij1 = maak('div', 'velrij');
    var start = euroVeld('Starttarief', k.start);
    var kmN = euroVeld('Per km normaal', k.kmNorm);
    rij1.appendChild(start);
    rij1.appendChild(kmN);
    lijf.appendChild(rij1);

    var rij2 = maak('div', 'velrij');
    var kmS = euroVeld('Per km spoed', k.kmSpoed);
    rij2.appendChild(kmS);
    lijf.appendChild(rij2);

    var opslaan = maak('button', 'knop knop--rand', 'Tarief opslaan');
    opslaan.type = 'button';
    opslaan.addEventListener('click', function () {
      bezig(opslaan, 'Opslaan…', function (klaar) {
        meldApp('');
        verstuur('klanttarief', {
          klantId: k.id,
          start: start.invoer.value,
          kmNorm: kmN.invoer.value,
          kmSpoed: kmS.invoer.value
        })
          .then(function (data) { vervangKlant(data.klant); })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    lijf.appendChild(opslaan);

    /* Het contract erbij. Handig bij een discussie over de prijs: dan heb je de
       afspraak zelf bij de hand en niet alleen de bedragen. */
    if (k.contract) {
      var link = maak('a', 'knop knop--rand', 'Contract bekijken');
      link.href = veiligAdres(k.contract);
      link.target = '_blank';
      link.rel = 'noopener';
      lijf.appendChild(link);
    }

    var kies = document.createElement('input');
    kies.type = 'file';
    kies.accept = 'application/pdf,image/png,image/jpeg';
    kies.hidden = true;
    var upload = maak('button', 'knop knop--rand',
      k.contract ? 'Ander contract uploaden' : 'Contract uploaden');
    upload.type = 'button';
    upload.addEventListener('click', function () { kies.click(); });
    kies.addEventListener('change', function () {
      var bestand = kies.files && kies.files[0];
      if (!bestand) { return; }
      bezig(upload, 'Uploaden…', function (klaar) {
        meldApp('');
        var lezer = new FileReader();
        lezer.onerror = function () {
          meldApp('Dat bestand kon niet gelezen worden.');
          klaar(false);
        };
        lezer.onload = function () {
          verstuur('klantcontract', {
            klantId: k.id, naam: bestand.name, data: lezer.result
          })
            .then(function (data) { vervangKlant(data.klant); })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        };
        lezer.readAsDataURL(bestand);
      });
    });
    lijf.appendChild(upload);
    lijf.appendChild(kies);

    blok.appendChild(lijf);
    return blok;
  }

  function tekenPortaalblok(k) {
    var vak = maak('div', 'portaalblok');

    if (k.soort !== 'Vaste klant') {
      vak.appendChild(maak('p', 'portaalblok__uit',
        'Eenmalige klant. Zijn factuur gaat per mail; een portaal heeft hij ' +
        'niet nodig.' + (k.ritten >= 4
          ? ' Al ' + k.ritten + ' ritten \u2014 dit lijkt geen eenmalige meer.' : '')));
      var vast = maak('button', 'knop knop--rand', 'Vaste klant maken');
      vast.type = 'button';
      vast.addEventListener('click', function () {
        bezig(vast, 'Omzetten\u2026', function (klaar) {
          verstuur('klantsoort', { klantId: k.id, soort: 'Vaste klant' })
            .then(function (data) { vervangKlant(data.klant); tekenKlanten(); })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      vak.appendChild(vast);
      return vak;
    }

    if (!k.email) {
      vak.appendChild(maak('p', 'portaalblok__uit',
        'Zonder e-mailadres kan deze klant geen factuur ontvangen en geen ' +
        'uitnodiging krijgen. Vul het aan in Airtable bij de klant.'));
      return vak;
    }

    var net = uitnodigingen[k.id];
    if (net) {
      vak.appendChild(maak('p', 'portaalblok__goed',
        'Uitnodiging onderweg naar ' + net + '.'));
    } else if (k.uitgenodigd) {
      vak.appendChild(maak('p', 'portaalblok__uit',
        'Uitgenodigd op ' + datumKort(String(k.uitgenodigd).slice(0, 10)) +
        ' om ' + klok(k.uitgenodigd) + '.'));
    } else {
      vak.appendChild(maak('p', 'portaalblok__uit',
        'Deze klant kan zijn eigen zendingen en facturen volgen.'));
    }

    var rij = maak('div', 'portaalblok__knoppen');

    /* Per mail: het portaal zet een vinkje om en Airtable verstuurt hem.
       Daardoor komt de toegangscode van de klant hier nooit langs. */
    var mail = maak('button', 'knop knop--rand',
      k.uitgenodigd || net ? 'Opnieuw uitnodigen' : 'Uitnodigen per mail');
    mail.type = 'button';
    mail.addEventListener('click', function () {
      bezig(mail, 'Versturen\u2026', function (klaar) {
        verstuur('uitnodiging', { klantId: k.id }).then(function (data) {
          vervangKlant(data.klant);
          uitnodigingen[k.id] = data.email || 'de klant';
          meldApp('');
          tekenKlanten();
        }).catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    rij.appendChild(mail);

    /* Zelf doorsturen, bijvoorbeeld via WhatsApp. De link wordt pas opgehaald
       als je erop drukt: in die link zit zijn toegangscode, en die hoort niet
       mee te liften met elk overzicht dat het portaal binnenhaalt. */
    var deel = maak('button', 'knop knop--rand', 'Link delen');
    deel.type = 'button';
    deel.addEventListener('click', function () {
      bezig(deel, 'Ophalen\u2026', function (klaar) {
        verstuur('portaallink', { klantId: k.id })
          .then(function (data) {
            var tekst = 'Uw eigen overzicht bij Schaap Express Transport';
            if (navigator.share) {
              navigator.share({ title: tekst, text: tekst, url: data.link })
                .catch(function () { /* afgebroken; niets aan de hand */ });
            } else {
              kopieer(data.link, deel);
            }
          })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    rij.appendChild(deel);
    vak.appendChild(rij);

    /* De twee remmen. Ze staan onder de gewone knoppen en niet ertussen: dit
       is niets wat je dagelijks aanraakt, en het hoort niet naast Uitnodigen
       te staan waar je er per ongeluk op drukt. */
    var rem = maak('div', 'portaalblok__rem');

    var zelfUit = !!k.geenZelf;
    if (zelfUit) {
      rem.appendChild(maak('p', 'portaalblok__waarschuwing',
        'Zelfbediening staat uit. Deze klant ziet zijn ritten en facturen nog, ' +
        'maar kan niets zelf annuleren of wijzigen — hij moet bellen.'));
    }
    var zelf = maak('button', 'knop knop--rand',
      zelfUit ? 'Zelfbediening weer aanzetten' : 'Zelfbediening uitzetten');
    zelf.type = 'button';
    zelf.addEventListener('click', function () {
      bezig(zelf, 'Bezig…', function (klaar) {
        verstuur('klantzelf', { klantId: k.id, uit: !zelfUit })
          .then(function (data) { meldApp(''); vervangKlant(data.klant); })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    rem.appendChild(zelf);

    /* Toegang intrekken kan alleen als er toegang ís, en vraagt om een tweede
       druk. De code is daarna weg: de link die deze klant heeft werkt niet
       meer, ook niet als hij hem had doorgestuurd. Opnieuw uitnodigen geeft
       hem een nieuwe code; de oude blijft dood. */
    if (k.heeftToegang) {
      var weg = maak('button', 'knop knop--rand', 'Toegang intrekken');
      weg.type = 'button';
      var zeker = false;
      weg.addEventListener('click', function () {
        if (!zeker) {
          zeker = true;
          weg.textContent = 'Zeker weten? Nog een keer drukken';
          setTimeout(function () {
            if (zeker) { zeker = false; weg.textContent = 'Toegang intrekken'; }
          }, 5000);
          return;
        }
        zeker = false;
        bezig(weg, 'Intrekken…', function (klaar) {
          verstuur('toegangweg', { klantId: k.id })
            .then(function (data) {
              meldApp('De link van deze klant werkt niet meer.');
              vervangKlant(data.klant);
            })
            .catch(function (fout) { meldApp(fout.message); klaar(false); });
        });
      });
      rem.appendChild(weg);
    } else {
      rem.appendChild(maak('p', 'portaalblok__uit',
        'Deze klant heeft nu geen portaaltoegang. Uitnodigen of Link delen ' +
        'geeft hem een nieuwe code.'));
    }

    vak.appendChild(rem);
    return vak;
  }

  /* De notitie bij een klant: aanklikken om te schrijven, leeg laten om hem
     weg te halen. Staat er niets, dan is het een klein regeltje dat niet in de
     weg zit; staat er wel iets, dan valt het op. */
  function notitieBlok(k) {
    var vak = maak('div', 'notitie');
    var tekst = String(k.notitie || '');
    var toon = maak('button', 'notitie__toon',
      tekst || 'Notitie toevoegen…');
    toon.type = 'button';
    if (tekst) { vak.setAttribute('data-vol', ''); }

    var bewerk = maak('div', 'notitie__bewerk');
    bewerk.hidden = true;
    var veld = document.createElement('textarea');
    veld.rows = 3;
    veld.maxLength = 2000;
    veld.value = tekst;
    veld.placeholder = 'Betaalt altijd te laat. Alleen vooruitbetaling.';
    veld.setAttribute('aria-label', 'Notitie bij ' + (k.naam || 'deze klant'));
    bewerk.appendChild(veld);

    var rij = maak('div', 'knoppen knoppen--twee');
    var op = maak('button', 'knop', 'Opslaan');
    op.type = 'button';
    var af = maak('button', 'knop knop--rand', 'Annuleren');
    af.type = 'button';
    rij.appendChild(op);
    rij.appendChild(af);
    bewerk.appendChild(rij);

    toon.addEventListener('click', function () {
      toon.hidden = true;
      bewerk.hidden = false;
      veld.focus();
    });
    af.addEventListener('click', function () {
      veld.value = tekst;
      bewerk.hidden = true;
      toon.hidden = false;
    });
    op.addEventListener('click', function () {
      op.disabled = true;
      af.disabled = true;
      op.textContent = 'Bezig…';
      meldApp('');
      verstuur('klantnotitie', { klantId: k.id, notitie: veld.value })
        .then(function (data) { vervangKlant(data.klant); })
        .catch(function (fout) {
          meldApp(fout.message);
          op.disabled = false;
          af.disabled = false;
          op.textContent = 'Opslaan';
        });
    });

    vak.appendChild(toon);
    vak.appendChild(bewerk);
    return vak;
  }

  /* Een klant die net is bijgewerkt terugzetten in de lijst en opnieuw tekenen.
     Zo blijft het scherm gelijk aan de administratie zonder alles opnieuw op
     te halen. */
  function vervangKlant(nieuw) {
    if (!nieuw || !nieuw.id) { return; }
    for (var i = 0; i < klanten.length; i++) {
      if (klanten[i].id === nieuw.id) { klanten[i] = nieuw; break; }
    }
    tekenKlanten();
  }

  function tekenKlantkaart(k) {
    var kaart = maak('div', 'klantkaart');

    var kop = maak('div', 'klantkaart__kop');
    var titel = maak('div');
    titel.appendChild(maak('div', 'klantkaart__naam', k.naam || 'Naamloos'));
    var onder = [];
    if (k.nummer) { onder.push('Klant ' + k.nummer); }
    onder.push(k.ritten === 1 ? '1 rit' : (k.ritten || 0) + ' ritten');
    if (k.laatste) { onder.push('laatst ' + datumKort(k.laatste)); }
    if (k.termijn) { onder.push(k.termijn + ' dagen'); }
    titel.appendChild(maak('div', 'klantkaart__sub', onder.join(' \u00b7 ')));
    kop.appendChild(titel);

    var soort = maak('span', 'klantkaart__soort', k.soort === 'Vaste klant' ? 'Vast' : 'Eenmalig');
    if (k.soort === 'Vaste klant') { soort.setAttribute('data-vast', ''); }
    kop.appendChild(soort);
    kaart.appendChild(kop);

    /* De notitie staat bovenaan, boven de cijfers en boven het openstaande
       bedrag. Dit is wat je wilt lezen voordat je opneemt, niet iets wat je
       onderaan een kaart terugvindt nadat het gesprek al loopt. */
    kaart.appendChild(notitieBlok(k));

    /* Het enige cijfer waar je meteen iets mee moet. */
    if (Number(k.openstaand) > 0) {
      var open = maak('div', 'klantkaart__open');
      open.appendChild(maak('b', '', euroCent.format(k.openstaand)));
      open.appendChild(document.createTextNode(
        ' staat nog open. Kijk daarnaar voordat je de volgende rit inplant.'));
      kaart.appendChild(open);
    }

    var regels = maak('div', 'regels');
    [regel('Telefoon', k.telefoon, true),
     regel('E-mail', k.email, true),
     regel('Adres', k.adres, true)
    ].forEach(function (r) { if (r) { regels.appendChild(r); } });
    if (regels.childNodes.length) { kaart.appendChild(regels); }

    /* Wat hij oplevert. Staat er alleen als er werkelijk iets gereden is —
       nullen op een verse klant zeggen niets en leiden af. */
    if (k.ritten) {
      var cijfers = maak('div', 'cijfers');
      [[euro.format(k.omzet || 0), 'Omzet'],
       [euro.format(k.winst || 0), 'Winst'],
       [euro.format(k.winstRit || 0), 'Per rit'],
       [Math.round((Number(k.marge) || 0) * 100) + '%', 'Marge']
      ].forEach(function (paar) {
        var vak = maak('div');
        vak.appendChild(maak('b', '', paar[0]));
        vak.appendChild(maak('span', '', paar[1]));
        cijfers.appendChild(vak);
      });
      kaart.appendChild(cijfers);
    }

    var knoppen = maak('div', 'klantkaart__knoppen');
    if (k.telefoon) {
      var bel = maak('a', 'knop knop--rand', 'Bellen');
      bel.href = 'tel:' + String(k.telefoon).replace(/\s/g, '');
      knoppen.appendChild(bel);
    }
    if (k.email) {
      var mail = maak('a', 'knop knop--rand', 'Mailen');
      mail.href = veiligAdres('mailto:' + k.email);
      knoppen.appendChild(mail);
    }
    if (k.adres) {
      var route = maak('a', 'knop knop--rand', 'Route');
      route.href = veiligAdres(routeNaar(k.adres));
      route.target = '_blank';
      route.rel = 'noopener';
      knoppen.appendChild(route);
    }
    if (knoppen.childNodes.length) { kaart.appendChild(knoppen); }

    kaart.appendChild(tariefBlok(k));
    kaart.appendChild(tekenPortaalblok(k));

    /* Facturen komen er pas bij als je erom vraagt. Ze standaard meesturen zou
       het dagoverzicht opblazen voor iets wat je een paar keer per week doet. */
    var opgehaald = facturen[k.id];
    if (opgehaald === undefined) {
      var haal = maak('button', 'klantkaart__meer', 'Facturen tonen');
      haal.type = 'button';
      haal.addEventListener('click', function () { haalFacturenVan(k.id, haal); });
      kaart.appendChild(haal);
    } else if (!opgehaald.length) {
      kaart.appendChild(maak('div', 'klantkaart__meer', 'Nog geen facturen'));
    } else {
      opgehaald.forEach(function (f) { kaart.appendChild(tekenFactuur(f)); });
      var dicht = maak('button', 'klantkaart__meer', 'Facturen verbergen');
      dicht.type = 'button';
      dicht.addEventListener('click', function () {
        delete facturen[k.id];
        tekenKlanten();
      });
      kaart.appendChild(dicht);
    }

    return kaart;
  }

  if (el('klant-zoek')) {
    el('klant-zoek').addEventListener('input', tekenKlanten);
    el('klant-zoek-leeg').addEventListener('click', function () {
      el('klant-zoek').value = '';
      el('klant-zoek').focus();
      tekenKlanten();
    });
  }

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
    tijdvakLabels().forEach(function (paar) {
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
  /* Wie er bij het adres staat. Dat hoor je onderweg — van de planner, of van
     de man zelf toen hij belde waar je bleef — en het is precies het soort
     gegeven dat in je gesprekslijst blijft hangen in plaats van bij de rit.
     Volgende week rijd je dezelfde route en zoek je het opnieuw uit.

     Ingeklapt, want negen van de tien ritten hebben het niet nodig. Staat er
     iets in, dan staat het bovenin de kaart en zit er een belknop bij. */
  /* Een wijzigverzoek van de klant, met de twee knoppen erbij.

     Let op wat inwilligen wél en niet doet: het sluit het verzoek af, meer
     niet. De rit zelf pas je daarna met de hand aan — een stop erbij, andere
     kilometers, een ander adres. Dat is met opzet zo: uit "een doos mee naar
     Breda" een aantal kilometers en een stoptoeslag afleiden is raden, en
     daar komt een verkeerde factuur uit. De knop is dus een afvinkknop, geen
     rekenknop, en dat staat er ook bij. */
  function wijzigBlok(rit) {
    /* Deze drie komen van de tussenlaag en zijn normaal tekst. Ze worden hier
       toch door String() gehaald: is er ooit een getal of een object van
       gemaakt, dan hoort de ritkaart gewoon te blijven staan in plaats van dat
       het hele portaal op een leeg scherm eindigt. */
    var stand = String(rit.wijzigStand || '');
    var soort = String(rit.wijzigSoort || '');
    var open = stand === 'Open';
    var vak = maak('div', 'bewijs' + (open ? ' bewijs--mist' : ''));
    var t = maak('div');
    t.appendChild(maak('b', '', open
      ? (soort || 'Wijziging') + ' gevraagd'
      : 'Wijzigverzoek ' + stand.toLowerCase()));
    t.appendChild(document.createTextNode(
      (rit.wijzigOp ? 'Doorgegeven op ' + datumKort(rit.wijzigOp) + ' om ' +
        klok(rit.wijzigOp) + '. ' : '') + String(rit.wijzigverzoek || '')));
    vak.appendChild(t);

    if (!open) { return vak; }
    /* Alles wat hierna komt gaat ín het tekstblok en niet naast het icoon:
       .bewijs is een flexrij, dus een los kind komt er zijdelings naast te
       hangen in plaats van eronder. */

    var rij = maak('div', 'knoppen knoppen--twee');
    /* Zegt de knop wat hij doet. Bij een stopverzoek voert Ingewilligd het ook
       werkelijk door; bij de andere soorten vinkt hij alleen af, en dan hoort
       er niet te staan dat er iets verandert. */
    var stops = Number(rit.wijzigStops) || 0;
    var voertDoor = rit.wijzigSoort === 'Extra stop' && stops > 0;
    var ja = maak('button', 'knop', voertDoor
      ? 'Inwilligen (+' + stops + ' stop' + (stops === 1 ? '' : 's') + ')'
      : 'Ingewilligd');
    ja.type = 'button';
    var nee = maak('button', 'knop knop--rand', 'Afgewezen');
    nee.type = 'button';

    [[ja, 'Ingewilligd'], [nee, 'Afgewezen']].forEach(function (paar) {
      paar[0].addEventListener('click', function () {
        ja.disabled = true;
        nee.disabled = true;
        paar[0].textContent = 'Bezig\u2026';
        meldApp('');
        verstuur('wijzigbesluit', { id: rit.id, besluit: paar[1] })
          .then(function (data) { ververs(data.rit); })
          .catch(function (fout) {
            meldApp(fout.message);
            ja.disabled = false;
            nee.disabled = false;
            paar[0].textContent = paar[1];
          });
      });
    });

    rij.appendChild(ja);
    rij.appendChild(nee);
    t.appendChild(rij);
    t.appendChild(maak('p', 'wijzig__uitleg', voertDoor
      ? 'Inwilligen zet die ' + stops + ' stop' + (stops === 1 ? '' : 's') +
        ' er meteen bij, en daarmee de stoptoeslag. Het adres zet je zelf in de ' +
        'opmerkingen, en kijk of de kilometers nog kloppen.'
      : 'Dit vinkt het verzoek af. De rit zelf pas je hierboven aan \u2014 stops, ' +
        'kilometers of adres \u2014 zodat de prijs klopt.'));
    return vak;
  }

  /* Eén knop voor het weggooien van een rit of een conceptfactuur. Twee keer
     drukken, want dit komt niet terug. De tussenlaag beslist of het mag; deze
     knop vraagt het alleen. */
  function weggooiKnop(tekst, actie, id) {
    var knop = maak('button', 'knop knop--weg', tekst);
    knop.type = 'button';
    var zeker = false;
    knop.addEventListener('click', function () {
      if (!zeker) {
        zeker = true;
        knop.textContent = 'Zeker weten? Nog een keer';
        setTimeout(function () {
          if (zeker) { zeker = false; knop.textContent = tekst; }
        }, 5000);
        return;
      }
      zeker = false;
      bezig(knop, 'Bezig…', function (klaar) {
        meldApp('');
        verstuur(actie, { id: id })
          .then(function () { haalDag(); })
          .catch(function (fout) { meldApp(fout.message); klaar(false); });
      });
    });
    return knop;
  }

  function contactBlok(rit) {
    var blok = maak('details', 'vouw');
    blok.open = false;

    var kop = maak('summary', 'vouw__kop');
    kop.appendChild(maak('span', '', 'Contact ter plaatse'));
    kop.appendChild(maak('b', '', rit.contact || rit.contactTel || 'niet ingevuld'));
    blok.appendChild(kop);

    var lijf = maak('div', 'vouw__lijf');

    var rij = maak('div', 'velrij');
    var naamVeld = tekstVeld('Naam', rit.contact, 'magazijn, portier, monteur');
    var telVeld = tekstVeld('Telefoon', rit.contactTel, '06…');
    telVeld.invoer.type = 'tel';
    telVeld.invoer.inputMode = 'tel';
    rij.appendChild(naamVeld);
    rij.appendChild(telVeld);
    lijf.appendChild(rij);

    lijf.appendChild(maak('div', 'terzijde',
      'De klant zit op kantoor, deze persoon staat bij het hek. Blijft bij de ' +
      'rit staan, ook als je hem volgende maand opnieuw rijdt.'));

    var knop = maak('button', 'knop knop--rand', 'Contact opslaan');
    knop.type = 'button';
    knop.addEventListener('click', function () {
      bezig(knop, 'Opslaan…', function (klaar) {
        schrijf('ritcontact', {
          id: rit.id,
          contact: naamVeld.invoer.value,
          telefoon: telVeld.invoer.value
        }, function () {
          return Object.assign({}, rit, {
            wacht: true,
            contact: naamVeld.invoer.value.trim(),
            contactTel: telVeld.invoer.value.trim()
          });
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

  /* Een gewoon tekstveld met een label erboven, in dezelfde vorm als
     getalVeld hierboven. */
  function tekstVeld(naam, waarde, hint) {
    var veld = maak('label', 'veld');
    veld.style.margin = '0';
    veld.appendChild(maak('span', '', naam));
    var invoer = document.createElement('input');
    invoer.type = 'text';
    invoer.maxLength = 100;
    invoer.value = waarde || '';
    if (hint) { invoer.placeholder = hint; }
    veld.appendChild(invoer);
    veld.invoer = invoer;
    return veld;
  }

  function kostenBlok(rit) {
    var blok = maak('details', 'vouw');
    blok.open = false;

    var kop = maak('summary', 'vouw__kop');
    kop.appendChild(maak('span', '', 'Jouw kosten van deze rit'));
    kop.appendChild(maak('b', '', rit.kosten
      ? euroCent.format(rit.kosten)
      : 'nog niet ingevuld'));
    blok.appendChild(kop);

    var lijf = maak('div', 'vouw__lijf');

    /* Wat hier staat gaat NIET naar de klant. Dat was niet duidelijk genoeg:
       je ziet een veld Brandstof en denkt dat je het doorberekent, terwijl
       brandstof al in het kilometertarief zit. Deze regel staat er daarom
       boven en niet eronder. */
    lijf.appendChild(maak('div', 'terzijde',
      'Dit is wat de rit jóú kost, voor je eigen boekhouding en om je winst te ' +
      'zien. Het komt niet op de factuur. Brandstof rekent hij zelf uit de ' +
      'kilometers — die zit al in het kilometertarief dat je de klant rekent, ' +
      'dus hier staat wat het jóu kost. Wat de klant je terugbetaalt zet je ' +
      'hierboven onder Doorberekenen.'));

    /* Brandstof typ je niet meer: die volgt uit de kilometers, met een vast
       bedrag per kilometer. Dat is nauwkeuriger dan achteraf een tankbeurt
       toerekenen aan één rit, en het scheelt je het werk. */
    var brandstofVak = maak('div', 'winst');
    brandstofVak.appendChild(maak('span', '', 'Brandstof (' + (rit.km || 0) + ' km)'));
    brandstofVak.appendChild(maak('b', '', euroCent.format(rit.brandstof || 0)));

    var rij1 = maak('div', 'velrij');
    var tol = euroVeld('Tol', rit.tol);
    var parkeren = euroVeld('Parkeren', rit.parkeren);
    rij1.appendChild(tol);
    rij1.appendChild(parkeren);
    lijf.appendChild(rij1);

    var rij2 = maak('div', 'velrij');
    var overig = euroVeld('Overig', rit.overig);
    rij2.appendChild(overig);
    rij2.appendChild(brandstofVak);
    lijf.appendChild(rij2);

    if (rit.winst) {
      var winstVak = maak('div', 'winst');
      winstVak.appendChild(maak('span', '', 'Winst'));
      winstVak.appendChild(maak('b', '', euroCent.format(rit.winst)));
      lijf.appendChild(winstVak);
    }

    var knop = maak('button', 'knop knop--rand', 'Kosten opslaan');
    knop.type = 'button';
    knop.addEventListener('click', function () {
      bezig(knop, 'Opslaan…', function (klaar) {
        schrijf('ritkosten', {
          id: rit.id,
          tol: tol.invoer.value,
          parkeren: parkeren.invoer.value,
          overig: overig.invoer.value
        }, function () {
          return Object.assign({}, rit, {
            wacht: true,
            tol: getal(tol.invoer.value),
            parkeren: getal(parkeren.invoer.value),
            overig: getal(overig.invoer.value)
          });
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
    tvVeld.toetsTijd(o.datum, o.tijd);
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

  /* -------------------------------------------------- prijs aan de telefoon

     Iemand belt en vraagt wat spoed van Rotterdam naar Venlo kost. Tot nu toe
     was het antwoord "ik reken het even uit en bel je terug", of een bedrag uit
     het hoofd dat later niet klopte met de site.

     Dit rekent met assets/site.js — hetzelfde bestand dat de calculator op de
     homepage gebruikt. Niet een kopie van de tarieven maar het bestand zelf, en
     dat is het hele punt: verandert er een tarief, dan verandert het hier mee.
     Een tweede lijstje tarieven in dit bestand zou vroeg of laat achterlopen,
     en dan noem je aan de telefoon een ander bedrag dan de klant op zijn scherm
     ziet staan.

     Zonder dat bestand valt alleen dit tabblad uit, met een uitleg. */

  var prijsGebouwd = false;
  var pSoort = 'spoed';        /* wat er meestal gebeld wordt */
  var pTijd  = 'dag';
  var pStops = 0;
  var pTijdZelf = false;       /* heeft hij het tijdvak zelf aangeraakt? */
  var pKmGezet = null;         /* de afstand die wij in het veld hebben gezet */

  function prijsKan() { return !!(window.SL && window.SL.bereken); }

  function toonPrijs() {
    var kan = prijsKan();
    el('prijs-uit').hidden = kan;
    el('prijs-vak').hidden = !kan;
    if (!kan) { return; }
    if (!prijsGebouwd) { bouwPrijs(); prijsGebouwd = true; }
    verversPrijs();
  }

  function keuzeknop(rij, waarde, kop, uitleg, kies) {
    var k = maak('button', 'keuze__knop');
    k.type = 'button';
    k.setAttribute('aria-pressed', 'false');
    k.setAttribute('data-waarde', String(waarde));
    k.appendChild(maak('b', '', kop));
    if (uitleg) { k.appendChild(maak('small', '', uitleg)); }
    k.addEventListener('click', function () { kies(waarde); });
    rij.appendChild(k);
    return k;
  }

  function zetGekozen(rij, waarde) {
    var knoppen = rij.querySelectorAll('.keuze__knop');
    for (var i = 0; i < knoppen.length; i++) {
      knoppen[i].setAttribute('aria-pressed',
        String(knoppen[i].getAttribute('data-waarde') === String(waarde)));
    }
  }

  function bouwPrijs() {
    var C = window.SL.CONFIG;

    var soortRij = el('prijs-soort');
    Object.keys(C.ritten).forEach(function (sleutel) {
      var r = C.ritten[sleutel];
      keuzeknop(soortRij, sleutel, r.naam.replace(' transport', ''), r.kort, function (w) {
        pSoort = w;
        /* Bij spoed gaat het over nu. Staat het al buiten kantooruren, dan
           hoort de toeslag er ook in te zitten — vergeten kost geld en het
           napraten van een bedrag dat je al genoemd hebt kost meer. Heeft hij
           het tijdvak zelf gekozen, dan blijft die keuze staan. */
        if (!pTijdZelf) { pTijd = C.ritten[w] && C.ritten[w].spoed ? tijdvakNu() : 'dag'; }
        verversPrijs();
      });
    });

    var tijdRij = el('prijs-tijd');
    Object.keys(C.tijden).forEach(function (sleutel) {
      var kort = { dag: 'Overdag', avond: 'Avond', nacht: 'Nacht of weekend' };
      keuzeknop(tijdRij, sleutel, kort[sleutel] || C.tijden[sleutel].naam, '', function (w) {
        pTijd = w;
        pTijdZelf = true;
        verversPrijs();
      });
    });

    var stopRij = el('prijs-stops');
    [0, 1, 2, 3].forEach(function (n) {
      keuzeknop(stopRij, n, String(n), '', function (w) { pStops = Number(w); verversPrijs(); });
    });

    el('prijs-van').addEventListener('input', verversPrijs);
    el('prijs-naar').addEventListener('input', verversPrijs);
    el('prijs-km').addEventListener('input', verversPrijs);
    el('prijs-klant').addEventListener('input', verversPrijs);

    el('prijs-kopie').addEventListener('click', function () {
      kopieer(prijsTekst(), el('prijs-kopie'));
    });
    el('prijs-deel').addEventListener('click', function () {
      var tekst = prijsTekst();
      if (navigator.share) {
        navigator.share({ title: 'Prijsopgave Schaap Logistics', text: tekst })
          .catch(function () { /* weggeklikt is geen fout */ });
      } else {
        kopieer(tekst, el('prijs-deel'));
      }
    });

    if (!pTijdZelf) { pTijd = window.SL.CONFIG.ritten[pSoort].spoed ? tijdvakNu() : 'dag'; }
  }

  /* Het tijdvak waar we nu in zitten. Zaterdag en zondag tellen als weekend;
     dat zit al in tijdvakUit en hoort hier niet nog een keer te staan. */
  function tijdvakNu() {
    var n = new Date();
    var twee = function (x) { return (x < 10 ? '0' : '') + x; };
    return window.SL.tijdvakUit(alsDatum(n),
      twee(n.getHours()) + ':' + twee(n.getMinutes()));
  }

  /* De afstand die we zelf kunnen schatten, of null. Buitenland kan niet: de
     postcodetabel in site.js is Nederlands. */
  function prijsSchatting() {
    if (window.SL.CONFIG.ritten[pSoort].buitenland) { return null; }
    var a = window.SL.postcodeUit(el('prijs-van').value);
    var b = window.SL.postcodeUit(el('prijs-naar').value);
    if (!a || !b) { return null; }
    if (!window.SL.regioVan(a) || !window.SL.regioVan(b)) { return null; }
    return { km: window.SL.schatAfstand(a, b), van: a, naar: b };
  }

  function verversPrijs() {
    var C = window.SL.CONFIG;
    zetGekozen(el('prijs-soort'), pSoort);
    zetGekozen(el('prijs-tijd'), pTijd);
    zetGekozen(el('prijs-stops'), pStops);

    var schat = prijsSchatting();
    var veld = el('prijs-km');

    /* De schatting komt in het veld te staan en niet ergens ernaast: dan kun
       je hem overschrijven als je weet dat de route omrijdt, en zie je in één
       oogopslag met welk getal er gerekend is. Maak je het veld leeg, dan komt
       de schatting terug.

       Om te weten of hij het getal zelf heeft ingetikt onthouden we wat wij er
       neerzetten. Alleen kijken of het veld gevuld is werkt niet: dan geldt
       onze eigen schatting bij de eerstvolgende druk op een knop ineens als
       zijn invoer, en verandert de afstand niet meer mee als hij een andere
       postcode intypt. */
    var eigen = veld.value.trim() !== '' && Number(veld.value) !== pKmGezet;
    var km;
    if (schat && !eigen) {
      km = schat.km;
      if (Number(veld.value) !== km) { veld.value = km; }
      pKmGezet = km;
    } else {
      km = Math.round(Number(veld.value)) || 0;
      if (eigen) { pKmGezet = null; }
    }

    var noot = el('prijs-kmnoot');
    if (C.ritten[pSoort].buitenland) {
      noot.textContent = 'Over de grens reken ik de afstand niet uit. Vul de ' +
                         'kilometers zelf in — heen, en niet terug.';
    } else if (eigen && schat) {
      noot.textContent = 'Zelf ingevuld. Maak het veld leeg voor de schatting ' +
                         'van ' + schat.km + ' km.';
    } else if (schat) {
      noot.textContent = 'Geschat op postcode ' + schat.van + ' en ' + schat.naar +
                         '. Klopt dat niet, typ er dan overheen.';
    } else {
      noot.textContent = 'Vul twee Nederlandse postcodes in, dan reken ik de ' +
                         'afstand zelf. Of vul hier de kilometers in.';
    }

    var uitslag = el('prijs-uitslag');
    if (!(km > 0)) { uitslag.hidden = true; return; }
    uitslag.hidden = false;

    var b = window.SL.bereken(pSoort, km, pTijd, pStops);
    el('prijs-groot').textContent = euroCent.format(b.totaalExcl);
    el('prijs-klein').textContent = euroCent.format(b.totaalIncl) +
                                    ' inclusief 21% btw';

    var vak = el('prijs-regels');
    vak.innerHTML = '';
    prijsRegels(b, km).forEach(function (r) {
      var d = maak('div', 'uitslag__regel' + (r.som ? ' uitslag__regel--som' : ''));
      d.appendChild(maak('span', '', r.label));
      d.appendChild(maak('span', '', euroCent.format(r.bedrag)));
      vak.appendChild(d);
    });

    el('prijs-noot').textContent = C.ritten[pSoort].buitenland
      ? 'Internationaal gaat altijd op offerte: dit is een richtprijs, geen aanbod.'
      : 'Prijsindicatie op een geschatte rijafstand. Er wordt gefactureerd op ' +
        'de werkelijk gereden kilometers.';

    el('prijs-offerte').href = offerteLink(b, km);
  }

  /* Hetzelfde vel als de conceptfactuur, maar met een offertekop en een
     geldigheidsdatum. De bedragen gaan als losse posten mee — starttarief,
     kilometers, toeslagen — en niet als één totaal: de factuurpagina rekent ze
     zelf op, en zo staat er op het papier precies dezelfde opbouw als op het
     scherm waar je hem vandaan hebt. */
  function offerteLink(b, km) {
    var q = new URLSearchParams();
    q.set('offerte', '1');
    q.set('datum', vandaagIso());
    /* Zonder naam blijft het vak Klant leeg. Dat is met opzet: op een geprint
       vel is dat een regel om met de hand in te vullen, en dat is beter dan
       een voorbeeldnaam die iemand vergeet weg te halen. */
    var wie = el('prijs-klant').value.trim();
    if (wie) { q.set('klant', wie); }
    q.set('van', el('prijs-van').value.trim());
    q.set('naar', el('prijs-naar').value.trim());
    q.set('oms', b.tarief.naam);
    q.set('km', String(km));
    q.set('kmtarief', String(b.tarief.km));
    q.set('start', String(b.tarief.start));
    q.set('minimum', String(b.tarief.minimum || window.SL.CONFIG.minimum));
    q.set('stops', String(b.stops));
    q.set('stoptarief', String(window.SL.CONFIG.stoptoeslag));
    q.set('tijdtoeslag', String(b.tijdSom));
    q.set('tijdvak', b.tijdstip.deel ? b.tijdstip.naam : '');
    return '../factuur/?' + q.toString();
  }

  /* De opbouw van het bedrag, in dezelfde volgorde als de calculator op de
     site en als de factuur. Dat is geen sier: als je aan de telefoon een
     bedrag noemt, wil je de regel erbij kunnen noemen waar het vandaan komt. */
  function prijsRegels(b, km) {
    var C = window.SL.CONFIG;
    var rijen = [
      { label: 'Starttarief', bedrag: b.tarief.start },
      { label: km + ' km × ' + euroCent.format(b.tarief.km), bedrag: b.kmSom }
    ];
    if (b.correctie > 0) {
      rijen.push({ label: 'Aanvulling tot minimumtarief', bedrag: b.correctie });
    }
    if (b.tijdSom > 0) { rijen.push({ label: b.tijdstip.naam, bedrag: b.tijdSom }); }
    if (b.stopSom > 0) {
      rijen.push({
        label: b.stops + (b.stops === 1 ? ' extra stop' : ' extra stops') +
               ' × ' + euroCent.format(C.stoptoeslag),
        bedrag: b.stopSom
      });
    }
    rijen.push({ label: 'Totaal excl. btw', bedrag: b.totaalExcl, som: true });
    rijen.push({ label: 'Btw 21%', bedrag: b.btw });
    rijen.push({ label: 'Totaal incl. btw', bedrag: b.totaalIncl });
    return rijen;
  }

  /* Wat er in het appje of de mail komt. Met de route en de kilometers erbij,
     want een bedrag zonder waar het over ging is over een week onleesbaar —
     ook voor de klant, die er misschien drie heeft liggen. */
  function prijsTekst() {
    var C = window.SL.CONFIG;
    var km = Math.round(Number(el('prijs-km').value)) || 0;
    var b = window.SL.bereken(pSoort, km, pTijd, pStops);
    var van = el('prijs-van').value.trim();
    var naar = el('prijs-naar').value.trim();

    var regels = ['Prijsopgave Schaap Logistics'];
    regels.push(b.tarief.naam + (van && naar ? ', ' + van + ' naar ' + naar : ''));
    regels.push('Circa ' + km + ' km' + (pTijd === 'dag' ? '' : ', ' + b.tijdstip.naam));
    regels.push('');
    prijsRegels(b, km).forEach(function (r) {
      regels.push(r.label + ': ' + euroCent.format(r.bedrag));
    });
    regels.push('');
    regels.push(C.ritten[pSoort].buitenland
      ? 'Internationaal gaat op offerte; dit is een richtprijs.'
      : 'De afstand is een schatting. Er wordt gefactureerd op de werkelijk ' +
        'gereden kilometers.');
    return regels.join('\n');
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

    var krabbel = doekje.toDataURL('image/png');
    var voorRit = tekentVoor;

    schrijf('handtekening', { id: voorRit.id, naam: naam, data: krabbel }, function () {
      return Object.assign({}, voorRit, {
        status: 'Uitgevoerd', getekend: naam, getekendOp: new Date().toISOString(),
        handtekening: true, krabbel: krabbel, wacht: true
      });
    }).then(function (data) {
      ververs(data.rit);
      /* Zonder bereik is de krabbel bewaard op de telefoon en gaat hij weg
         zodra er weer iets doorkomt. Het blad mag dicht: opnieuw laten tekenen
         zou een tweede handtekening in de rij zetten. */
      if (data.wacht) {
        sluitTekenblad();
        meldApp('Bewaard op deze telefoon. Wordt verstuurd zodra je bereik hebt.');
      } else if (data.handtekening) {
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

  /* De service worker meteen aanmelden, niet pas als je meldingen aanzet.
     Hij zorgt er namelijk ook voor dat dit scherm opengaat zonder bereik, en
     dat wil je hebben voordat je in een kelder staat — niet erna. Mislukt het
     (een oude browser, of geopend zonder https), dan werkt alles gewoon;
     alleen zonder bereik krijg je dan niets. */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () { /* dan niet */ });
  }

  /* Wat er van de vorige keer nog klaarstond. Sloot je de app af met een
     handtekening in de rij, dan gaat die nu alsnog weg. */
  wachtrij = leesWachtrij();
  tekenOffline();

  window.addEventListener('online', function () {
    tekenOffline();
    /* Staat er iets in de rij, dan haalt het legen daarvan zelf de dag op
       zodra hij leeg is. Anders meteen verversen. */
    if (wachtrij.length) { leegDeWachtrij(); }
    else if (code && waarheen()) { haalDag(); }
  });
  window.addEventListener('offline', tekenOffline);

  /* De browser is niet eerlijk over "online": op een telefoon staat dat al op
     waar zodra er wifi is die nergens heen gaat, en op mobiel internet wisselt
     het per straat. Dus ook gewoon af en toe proberen zolang er iets wacht. */
  setInterval(function () { if (wachtrij.length) { leegDeWachtrij(); } }, 20000);

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
    if (wachtrij.length) { leegDeWachtrij(); }
    haalDag();
  } else {
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
  }
})();
