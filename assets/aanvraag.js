/* =========================================================================
   Het aanvraagformulier op /aanvragen/: live samenvatting, foto's, versturen.
   Doet niets op pagina's zonder dat formulier.
   ========================================================================= */
(function () {
  'use strict';

  var ritForm = document.getElementById('ritForm');
  if (!ritForm) { return; }

  var CONFIG = window.SL.CONFIG;
  var euro   = window.SL.euro;

  /* De versie van de voorwaarden waarmee deze bezoeker akkoord gaat, zichtbaar
     naast het vinkje. Staat op een plek: CONFIG.voorwaardenVersie. */
  var versieVak = document.getElementById('voorwaardenVersie');
  if (versieVak) { versieVak.textContent = CONFIG.voorwaardenVersie; }

  var samRijen = document.getElementById('samRijen');
  var samPrijs = document.getElementById('samPrijs');
  var samNoot  = document.getElementById('samNoot');

  function veld(id) {
    var el = document.getElementById(id);
    return el && el.value.trim() ? el.value.trim() : '';
  }

  function gekozenDienst() {
    var el = document.querySelector('#ritForm input[name="dienst"]:checked');
    return el ? el.value : 'standaard';
  }

  function tijdSleutelUit(naam) {
    var k;
    for (k in CONFIG.tijden) {
      if (CONFIG.tijden[k].naam === naam) { return k; }
    }
    return 'dag';
  }

  /* Bij spoed en directe spoed kiest de klant geen tijdvak. Spoed is per
     definitie zo snel mogelijk; een keuze tussen "overdag" en "avond" hoort
     daar niet bij. Wat hij wel weet is vanaf wanneer de zending klaarstaat, en
     daar leiden we het tijdvak — en dus de toeslag — zelf uit af. */
  function isSpoed() {
    var r = CONFIG.ritten[gekozenDienst()];
    return !!(r && r.spoed);
  }

  /* Het tijdvak dat voor deze aanvraag geldt: bij spoed afgeleid uit datum en
     tijd, anders wat de klant zelf koos. */
  function tijdSleutel() {
    if (isSpoed()) {
      return window.SL.tijdvakUit(veld('r-datum'), veld('r-tijd'));
    }
    return tijdSleutelUit(veld('r-tijdstip'));
  }

  function aantalStops() {
    return window.SL.stopsUit(veld('r-stops'));
  }

  /* Zet het derde blok in de stand die bij de gekozen dienst hoort. */
  function ververWanneer() {
    var spoed = isSpoed();
    document.getElementById('tijdvakVeld').hidden = spoed;
    document.getElementById('spoedNoot').hidden = !spoed;
    document.getElementById('labelTijd').textContent =
      spoed ? 'Vanaf wanneer staat het klaar?' : 'Gewenste ophaaltijd';
    document.getElementById('wanneerNoot').textContent =
      spoed ? 'Wij bevestigen wanneer wij er kunnen zijn'
            : 'Datum en gewenste ophaaltijd';
  }

  /* Zet het tweede blok in de stand die bij de gekozen dienst hoort.

     Binnenlands is postcode en huisnummer genoeg: daaruit schat de site de
     afstand en dus de prijs. Naar het buitenland kan die schatting niet, dus
     rekenen wij de route met de hand na — en daarvoor is een postcode alleen te
     weinig. Vandaar dat het formulier dan om het hele adres vraagt, met de
     reden erbij, en het ook echt controleert. */
  var VOORBEELD = {
    binnen: ['3011 AA 12, Rotterdam', '5611 AB 5, Eindhoven'],
    buiten: ['Meir 1, 2000 Antwerpen, Belgi\u00eb', 'K\u00f6nigsallee 1, 40212 D\u00fcsseldorf, Duitsland']
  };

  /* Deze functie wordt bij elke toetsaanslag aangeroepen, samen met de
     samenvatting. Alleen bij een echte dienstwissel iets doen: anders wist hij
     de melding over een onvolledig adres weer weg zodra je verder typt. */
  var laatsteDienst = null;

  function ververAdres() {
    var dienst = gekozenDienst();
    if (dienst === laatsteDienst) { return; }
    laatsteDienst = dienst;

    var buitenland = !!(CONFIG.ritten[dienst] || {}).buitenland;
    var op = document.getElementById('r-opPc');
    var af = document.getElementById('r-afPc');
    var paar = buitenland ? VOORBEELD.buiten : VOORBEELD.binnen;

    document.getElementById('buitenlandNoot').hidden = !buitenland;
    document.getElementById('waarNoot').textContent = buitenland
      ? 'Volledig adres, met straat en huisnummer'
      : 'Postcode en huisnummer is genoeg';
    op.placeholder = paar[0];
    af.placeholder = paar[1];

    /* Een melding van de vorige dienst hoort niet bij de nieuwe. */
    [op, af].forEach(function (v) { v.setCustomValidity(''); });
  }

  /* Een adres waarmee je een route kunt opzoeken: een huisnummer of postcode,
     en meer dan een enkel woord. Bewust ruim — een aanvraagformulier dat te
     streng is kost je de aanvraag, en jij belt toch na. */
  function adresIsCompleet(tekst) {
    var t = String(tekst || '').trim();
    return t.length >= 10 && /\d/.test(t) && t.split(/[\s,]+/).filter(Boolean).length >= 3;
  }

  function keurAdressen() {
    var buitenland = !!(CONFIG.ritten[gekozenDienst()] || {}).buitenland;
    ['r-opPc', 'r-afPc'].forEach(function (id) {
      var v = document.getElementById(id);
      if (buitenland && v.value.trim() && !adresIsCompleet(v.value)) {
        v.setCustomValidity('Vul het volledige adres in: straat, huisnummer, ' +
                            'postcode, plaats en land.');
      } else {
        v.setCustomValidity('');
      }
    });
  }

  /* ===================== keuzes overnemen van de calculator ===================== */

  /* De knop onder de calculator op de homepage linkt hierheen met de gemaakte
     keuzes in de URL. Die vullen we alvast in. */
  function neemKeuzesOver() {
    var q = new URLSearchParams(window.location.search);
    if (!q.toString()) { return; }

    var dienst = q.get('dienst');
    if (dienst) {
      var radio = document.querySelector('#ritForm input[name="dienst"][value="' + dienst + '"]');
      if (radio) { radio.checked = true; }
    }

    var tijd = q.get('tijd');
    var tv   = document.getElementById('r-tijdstip');
    if (tijd && tv && CONFIG.tijden[tijd]) { tv.value = CONFIG.tijden[tijd].naam; }

    var stops = q.get('stops');
    if (stops && window.SL.stopsUit(stops) > 0) {
      document.getElementById('r-stops').value = window.SL.stopsUit(stops);
    }

    if (q.get('van'))  { document.getElementById('r-opPc').value = q.get('van'); }
    if (q.get('naar')) { document.getElementById('r-afPc').value = q.get('naar'); }
  }

  /* ===================== samenvatting ===================== */

  function samRij(label, waarde) {
    var d = document.createElement('div');
    d.className = 'sam__rij';
    var a = document.createElement('span'); a.textContent = label;
    var b = document.createElement('span'); b.textContent = waarde;
    d.appendChild(a); d.appendChild(b);
    return d;
  }

  function ververSamenvatting() {
    var dienst = gekozenDienst();
    var rit    = CONFIG.ritten[dienst];
    var tKey   = tijdSleutel();
    var stops  = aantalStops();
    var op     = veld('r-opPc');
    var af     = veld('r-afPc');

    ververWanneer();
    ververAdres();

    samRijen.innerHTML = '';
    samRijen.appendChild(samRij('Dienst', rit.naam));
    if (op) { samRijen.appendChild(samRij('Ophalen', op)); }
    if (af) { samRijen.appendChild(samRij('Afleveren', af)); }
    if (stops > 0) {
      samRijen.appendChild(samRij('Extra stops', String(stops)));
    }
    if (veld('r-datum')) { samRijen.appendChild(samRij('Datum', veld('r-datum'))); }
    if (veld('r-tijd')) {
      samRijen.appendChild(samRij(
        isSpoed() ? 'Klaar vanaf' : 'Ophaaltijd', veld('r-tijd')));
    }
    if (CONFIG.tijden[tKey].toeslag > 0) {
      samRijen.appendChild(samRij('Tijdvak', CONFIG.tijden[tKey].naam));
    }

    /* Buitenland: het tarief staat vast, maar de afstand kunnen wij hier niet
       schatten. Die schatting werkt op Nederlandse postcodes, en een Belgische
       postcode van vier cijfers zou daar een Nederlandse regio uit halen — een
       verzonnen afstand is erger dan geen. Dus tonen wij wel het tarief en de
       ondergrens, en bevestigen wij het bedrag zodra de route bekend is. */
    if (rit.buitenland) {
      samPrijs.textContent = 'vanaf ' + euro.format(rit.minimum);
      samNoot.textContent  = 'Naar Belgi\u00eb en Duitsland rekenen wij ' + euro.format(rit.start) +
                             ' starttarief plus \u20ac ' + rit.km.toFixed(2).replace('.', ',') +
                             ' per kilometer, met ' +
                             'een minimum van ' + euro.format(rit.minimum) + '. De afstand naar het ' +
                             'buitenland rekenen wij met de hand na, dus bevestigen wij het ' +
                             'exacte bedrag zodra wij uw route hebben bekeken.';
      return;
    }

    var km = window.SL.schatAfstand(window.SL.postcodeUit(op), window.SL.postcodeUit(af));
    if (km === null) {
      samPrijs.textContent = '—';
      samNoot.textContent  = 'Vul hierboven een ophaal- en afleverpostcode in voor een ' +
                             'prijsindicatie. De definitieve prijs wordt bevestigd na ' +
                             'controle van de opdracht.';
      return;
    }

    var b = window.SL.bereken(dienst, km, tKey, stops);
    samRijen.appendChild(samRij('Geschatte afstand', km + ' km'));
    samPrijs.textContent = euro.format(b.totaal);
    samNoot.textContent  = 'Indicatie op basis van een geschatte rijafstand van ' + km +
                           ' km' + (stops > 0
                             ? ' en ' + stops + (stops === 1 ? ' extra stop' : ' extra stops')
                             : '') +
                           ', excl. btw. De definitieve prijs wordt bevestigd na ' +
                           'controle van de opdracht.' +
                           (isSpoed()
                             ? ' Wij laten zo snel mogelijk weten hoe laat wij er kunnen zijn.'
                             : '');
  }

  /* ===================== foto's bij de aanvraag ===================== */

  var fotoInput = document.getElementById('r-fotos');
  var fotoLijst = document.getElementById('fotoLijst');
  var fotoNoot  = document.getElementById('fotoNoot');
  var fotos     = [];   /* de daadwerkelijk gekozen bestanden */

  function leesbareGrootte(bytes) {
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return Math.round(bytes / 1024) + ' kB'; }
    return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }

  function meldFoto(tekst, fout) {
    fotoNoot.textContent = tekst;
    fotoNoot.className = 'fotonoot' + (fout ? ' fotonoot--err' : '');
  }

  function toonFotos() {
    fotoLijst.innerHTML = '';

    fotos.forEach(function (bestand, i) {
      var li = document.createElement('li');

      var img = document.createElement('img');
      img.alt = '';
      img.src = URL.createObjectURL(bestand);
      img.addEventListener('load', function () { URL.revokeObjectURL(img.src); });

      var naam = document.createElement('span');
      naam.className = 'naam';
      naam.textContent = bestand.name;

      var grootte = document.createElement('span');
      grootte.className = 'grootte';
      grootte.textContent = leesbareGrootte(bestand.size);

      var weg = document.createElement('button');
      weg.type = 'button';
      weg.setAttribute('aria-label', bestand.name + ' verwijderen');
      weg.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
        '<path d="M18 6 6 18M6 6l12 12"/></svg>';
      weg.addEventListener('click', function () {
        fotos.splice(i, 1);
        toonFotos();
      });

      li.appendChild(img); li.appendChild(naam);
      li.appendChild(grootte); li.appendChild(weg);
      fotoLijst.appendChild(li);
    });

    if (!fotos.length) {
      meldFoto('', false);
      return;
    }
    if (!CONFIG.webhookUrl) {
      meldFoto(fotos.length + (fotos.length === 1 ? ' foto gekozen. ' : " foto's gekozen. ") +
               'Voeg ze straks als bijlage toe aan de e-mail die opent — een website ' +
               'zonder server kan bestanden niet zelf versturen.', false);
    } else {
      meldFoto(fotos.length + (fotos.length === 1 ? ' foto' : " foto's") +
               ' wordt meegestuurd met de aanvraag.', false);
    }
  }

  fotoInput.addEventListener('change', function () {
    var gekozen = Array.prototype.slice.call(fotoInput.files);
    var geweigerd = [];

    gekozen.forEach(function (bestand) {
      if (fotos.length >= CONFIG.foto.maxAantal) {
        geweigerd.push(bestand.name + ' (maximaal ' + CONFIG.foto.maxAantal + " foto's)");
        return;
      }
      if (bestand.size > CONFIG.foto.maxMb * 1024 * 1024) {
        geweigerd.push(bestand.name + ' (groter dan ' + CONFIG.foto.maxMb + ' MB)');
        return;
      }
      if (bestand.type.indexOf('image/') !== 0) {
        geweigerd.push(bestand.name + ' (geen afbeelding)');
        return;
      }
      var dubbel = fotos.some(function (f) {
        return f.name === bestand.name && f.size === bestand.size;
      });
      if (!dubbel) { fotos.push(bestand); }
    });

    fotoInput.value = '';   /* zodat hetzelfde bestand opnieuw gekozen kan worden */
    toonFotos();

    if (geweigerd.length) {
      meldFoto('Niet toegevoegd: ' + geweigerd.join(', ') + '.', true);
    }
  });

  /* ===================== aanvraag opbouwen en versturen ===================== */

  /* Eén plek die bepaalt hoe een ritaanvraag eruitziet. De sleutels hieronder
     zijn precies de kolomnamen in Airtable — zie AIRTABLE.md. Wijzig je hier
     een naam, wijzig hem dan ook in de tabel. */
  function bouwAanvraag() {
    var dienst = gekozenDienst();
    var rit    = CONFIG.ritten[dienst];
    var op     = veld('r-opPc');
    var af     = veld('r-afPc');
    var tKey   = tijdSleutel();
    var stops  = aantalStops();
    var km     = rit.buitenland ? null : window.SL.schatAfstand(window.SL.postcodeUit(op), window.SL.postcodeUit(af));
    var prijs  = km === null ? null : window.SL.bereken(dienst, km, tKey, stops).totaal;

    return {
      'Status':                   'Nieuw',
      'Bron':                     'Website',
      'Dienst':                   rit.naam,
      'Tijdvak':                  CONFIG.tijden[tKey].naam,
      'Ophaallocatie':            op,
      'Ophaalpostcode':           window.SL.postcodeUit(op) || '',
      'Afleverlocatie':           af,
      'Afleverpostcode':          window.SL.postcodeUit(af) || '',
      'Datum':                    veld('r-datum'),
      'Ophaaltijd':               veld('r-tijd'),
      'Extra stops':              stops ? String(stops) : '',
      'Omschrijving':             veld('r-omschrijving'),
      'Aantal colli':             veld('r-colli'),
      'Gewicht':                  veld('r-gewicht'),
      'Afmetingen':               veld('r-afmetingen'),
      'Bedrijf':                  veld('r-bedrijf'),
      'Contactpersoon':           veld('r-naam'),
      'Telefoon':                 veld('r-tel'),
      'E-mail':                   veld('r-mail'),
      'Opmerkingen':              veld('r-opmerking'),
      'Geschatte afstand km':     km,
      'Prijsindicatie excl btw':  prijs
    };
  }

  /* Velden die alleen voor Airtable bedoeld zijn, of die onderaan in een eigen
     blok komen te staan. Die horen niet in de opsomming van de e-mail. */
  var NIET_IN_MAIL = ['Status', 'Bron', 'Omschrijving', 'Opmerkingen'];

  /* Leesbare namen voor in de e-mail; de sleutels blijven de Airtable-kolommen. */
  var MAIL_LABEL = {
    'Geschatte afstand km':    'Geschatte afstand',
    'Prijsindicatie excl btw': 'Prijsindicatie'
  };

  /* Zet een aanvraag om in leesbare regels voor de e-mail. */
  function alsTekst(kop, data) {
    var regels = [kop, ''];

    Object.keys(data).forEach(function (sleutel) {
      var w = data[sleutel];
      if (w === null || w === '') { return; }
      if (NIET_IN_MAIL.indexOf(sleutel) !== -1) { return; }
      if (sleutel === 'Prijsindicatie excl btw') { w = euro.format(w) + ' excl. btw'; }
      if (sleutel === 'Geschatte afstand km')    { w = w + ' km'; }
      regels.push(((MAIL_LABEL[sleutel] || sleutel) + ':').padEnd(22) + w);
    });

    if (data['Omschrijving']) { regels.push('', 'Goederen:', data['Omschrijving']); }
    if (data['Opmerkingen'])  { regels.push('', 'Opmerkingen:', data['Opmerkingen']); }
    if (fotos.length) {
      regels.push('', "Foto's (als bijlage toevoegen):");
      fotos.forEach(function (f) { regels.push('  - ' + f.name); });
    }
    return regels;
  }

  /* Leest een bestand in als data-URL, zodat het als JSON mee kan. */
  function leesBestand(bestand) {
    return new Promise(function (klaar, mislukt) {
      var lezer = new FileReader();
      lezer.onload  = function () { klaar({ naam: bestand.name, type: bestand.type, data: lezer.result }); };
      lezer.onerror = function () { mislukt(new Error('Kan ' + bestand.name + ' niet lezen.')); };
      lezer.readAsDataURL(bestand);
    });
  }

  /* Stuurt de aanvraag als JSON naar de tussenlaag die naar Airtable schrijft.
     Alleen actief zodra CONFIG.webhookUrl is ingevuld. */
  function verstuurViaWebhook(data, noot, knop) {
    var oudeTekst = knop.textContent;
    knop.disabled = true;
    knop.textContent = 'Bezig met versturen…';
    noot.style.color = '';
    noot.style.fontWeight = '';
    noot.textContent = 'Uw aanvraag wordt verstuurd…';

    Promise.all(fotos.map(leesBestand))
      .then(function (bijlagen) {
        return fetch(CONFIG.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            velden: data,
            fotos: bijlagen,
            /* Het formulier laat niet versturen zonder dit vinkje, maar de
               tussenlaag controleert het zelf nog een keer: wat er in de
               browser gebeurt is geen bewijs. De versie gaat mee, het moment
               zet de tussenlaag er zelf bij. */
            voorwaarden: !!(document.getElementById('r-akkoord') || {}).checked,
            voorwaardenVersie: CONFIG.voorwaardenVersie,
            /* Verborgen veld tegen bots; een mens laat dit leeg. */
            controle: veld('r-controle')
          })
        });
      })
      .then(function (res) {
        if (!res.ok) { throw new Error('Server antwoordde met ' + res.status); }
        noot.textContent = 'Uw aanvraag is verstuurd. U hoort zo snel mogelijk van ons ' +
                           'met een prijs en een ophaaltijd.';
        noot.style.color = '#12a15c';
        noot.style.fontWeight = '600';
        ritForm.reset();
        fotos = [];
        toonFotos();
        ververSamenvatting();
        knop.textContent = 'Aanvraag verstuurd';
      })
      .catch(function (fout) {
        noot.textContent = 'Versturen is niet gelukt (' + fout.message + '). ' +
                           'Belt u ons gerust even, dan regelen we het direct.';
        noot.style.color = '#c8351a';
        noot.style.fontWeight = '600';
        knop.disabled = false;
        knop.textContent = oudeTekst;
      });
  }

  ritForm.addEventListener('submit', function (e) {
    e.preventDefault();
    keurAdressen();
    if (!ritForm.checkValidity()) { ritForm.reportValidity(); return; }

    var data = bouwAanvraag();
    var noot = document.getElementById('ritNote');

    if (CONFIG.webhookUrl) {
      verstuurViaWebhook(data, noot, ritForm.querySelector('button[type=submit]'));
      return;
    }

    window.SL.verstuurViaMail(
      data['Dienst'] + ': ' + (data['Ophaallocatie'] || '?') + ' naar ' + (data['Afleverlocatie'] || '?'),
      alsTekst('Ritaanvraag via de website', data),
      noot,
      'de aanvraag'
    );
  });

  ritForm.addEventListener('input', ververSamenvatting);
  ritForm.addEventListener('change', ververSamenvatting);

  /* Ook nakijken zodra je het adresveld verlaat. Bij het versturen gebeurt het
     ook, maar dan hoor je het pas als je al klaar dacht te zijn. Niet tijdens
     het typen: dan staat het veld halverwege je eerste woord al op fout. */
  ['r-opPc', 'r-afPc'].forEach(function (id) {
    var v = document.getElementById(id);
    if (v) {
      v.addEventListener('blur', function () {
        keurAdressen();
        if (v.validationMessage) { v.reportValidity(); }
      });
    }
  });

  neemKeuzesOver();
  ververSamenvatting();
})();
