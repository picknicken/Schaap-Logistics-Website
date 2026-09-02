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
    portaalUrl: '',
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

    verstuur('ritten', { dag: dag }).then(function (data) {
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
    el('lijst').innerHTML = '<div class="leeg">Ritten ophalen…</div>';
    meldApp('');
    verstuur('ritten', { dag: dag })
      .then(toon)
      .catch(function (fout) {
        meldApp(fout.message);
        el('lijst').innerHTML = '';
      });
  }

  function toon(data) {
    ritten = data.ritten || [];
    el('dag-naam').textContent = dagNaam(dag);
    el('dag-datum').textContent = datumLang(dag);
    tekenTegels();
    tekenLijst();
  }

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
    var kaart = maak('details', 'rit' + (klaar ? ' rit--klaar' : ''));
    kaart.open = !klaar;

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
