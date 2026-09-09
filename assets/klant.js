/* =========================================================================
   Het klantportaal. Draait op /klant/ en laat een klant zijn eigen zendingen
   en facturen zien — en niets anders.

   Wat hier binnenkomt is al gefilterd door de Worker: die stuurt alleen de
   velden die een klant mag zien. Jouw brandstof-, tol- en overige kosten en
   je winst zitten er niet in, ook niet verstopt. Verbergen op het scherm zou
   niet genoeg zijn: wie het antwoord van de server bekijkt, ziet dan alsnog
   alles. Daarom worden ze niet meegestuurd.
   ========================================================================= */
(function () {
  'use strict';

  var CONFIG = {
    /* Zelfde tussenstukje als het chauffeursportaal; dat herkent aan de code
       of er een chauffeur of een klant aanklopt. Anders dan bij het
       chauffeursportaal staat dit adres hier vast: een klant kan het niet
       weten en moet er ook niet naar gevraagd worden. Verandert de naam van
       de Worker, dan hier en in assets/portaal.js aanpassen. */
    portaalUrl: 'https://schaap-portaal.rt5twh6n7h.workers.dev',
    sleutel: 'sl-klant-code'
  };

  var euro = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2
  });

  var el = function (id) { return document.getElementById(id); };

  var code = '';
  var adres = '';
  var ritten = [];
  var facturen = [];


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

  function datumLang(iso) {
    if (!iso) { return ''; }
    return new Date(iso.slice(0, 10) + 'T12:00:00')
      .toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long' });
  }
  function datumKort(iso) {
    if (!iso) { return ''; }
    return new Date(iso.slice(0, 10) + 'T12:00:00')
      .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function klok(iso) {
    if (!iso) { return ''; }
    return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  /* ------------------------------------------------------- communicatie */

  function verstuur(gegevens) {
    if (!adres) {
      return Promise.reject(new Error('Dit portaal is nog niet ingesteld.'));
    }
    return fetch(adres, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portaal-Code': code },
      body: JSON.stringify(Object.assign({ actie: 'klantoverzicht' }, gegevens || {}))
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401) {
          vergeet();
          throw new Error('Deze toegangscode werkt niet. Controleer hem, of ' +
                          'vraag Schaap Express Transport om een nieuwe.');
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.fout || ('Er ging iets mis (' + res.status + ')'));
        }
        return data;
      });
    }, function () {
      throw new Error('Geen verbinding. Probeer het zo nog eens.');
    });
  }

  /* ------------------------------------------------------------ toegang */

  function vergeet() {
    code = '';
    try { localStorage.removeItem(CONFIG.sleutel); } catch (e) { /* privémodus */ }
    el('app').hidden = true;
    el('slot').hidden = false;
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

  function openen(ingetypt) {
    var knop = el('slot-form').querySelector('button');
    knop.disabled = true;
    knop.textContent = 'Even kijken…';
    code = ingetypt;
    meldSlot('');

    return verstuur().then(function (data) {
      try { localStorage.setItem(CONFIG.sleutel, ingetypt); } catch (e) { /* privé */ }
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
  }

  el('slot-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var ingetypt = el('slot-code').value.trim();
    if (!ingetypt) { return; }
    openen(ingetypt);
  });

  el('uitloggen').addEventListener('click', function () {
    vergeet();
    meldSlot('');
  });

  /* --------------------------------------------------------- tabbladen */

  function kiesTab(naam) {
    ['zendingen', 'facturen'].forEach(function (t) {
      el('tab-' + t).setAttribute('aria-selected', String(t === naam));
      el('paneel-' + t).hidden = (t !== naam);
    });
    window.scrollTo(0, 0);
  }
  ['zendingen', 'facturen'].forEach(function (t) {
    el('tab-' + t).addEventListener('click', function () { kiesTab(t); });
  });

  /* ------------------------------------------------------------- tonen */

  function maak(soort, klasse, tekst) {
    var e = document.createElement(soort);
    if (klasse) { e.className = klasse; }
    if (tekst !== undefined) { e.textContent = tekst; }
    return e;
  }

  /* openHouden is de sleutel van de zending die zojuist is afgezegd. Zonder dat
     klapt de kaart dicht op het moment dat je op Ja drukt, en zie je de
     bevestiging niet die je net verdiend hebt. */
  function toon(data, openHouden) {
    ritten = data.ritten || [];
    facturen = data.facturen || [];
    if (data.klant && data.klant.naam) {
      el('kop-klant').textContent = data.klant.naam.toUpperCase();
    }
    badge('badge-zendingen', ritten.filter(function (r) {
      return r.status !== 'Uitgevoerd' && r.status !== 'Geannuleerd';
    }).length);
    badge('badge-facturen', facturen.filter(function (f) {
      return (Number(f.openstaand) || 0) > 0;
    }).length);
    tekenZendingen(openHouden);
    tekenFacturen();
  }

  function badge(id, aantal) {
    var b = el(id);
    b.textContent = aantal;
    b.hidden = !aantal;
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

  function tekenZendingen(openHouden) {
    var lijst = el('lijst-zendingen');
    lijst.innerHTML = '';
    if (!ritten.length) {
      lijst.appendChild(maak('div', 'leeg', 'Er staan nog geen zendingen op uw naam.'));
      return;
    }
    ritten.forEach(function (r) {
      lijst.appendChild(tekenZending(r, r.sleutel && r.sleutel === openHouden));
    });
  }

  function tekenZending(r, openHouden) {
    var kaart = maak('details', 'kaart');
    kaart.open = openHouden ||
      (r.status !== 'Uitgevoerd' && r.status !== 'Geannuleerd');

    var kop = maak('summary', 'kaart__kop');
    kop.appendChild(maak('span', 'merk s-' + r.status.toLowerCase(), r.status));

    var hoofd = maak('div', 'kaart__hoofd');
    hoofd.appendChild(maak('div', 'kaart__titel', datumLang(r.datum) || 'Zending'));
    hoofd.appendChild(maak('div', 'kaart__regel',
      (r.ophaal || '?') + '  →  ' + (r.aflever || '?')));
    kop.appendChild(hoofd);
    kaart.appendChild(kop);

    var lijf = maak('div', 'kaart__lijf');

    var dl = paarLijst([
      ['Soort', r.type],
      ['Ophalen', r.ophaal],
      ['Bezorgen', r.aflever],
      ['Afstand', r.km ? Math.round(r.km) + ' km' : '']
    ]);
    if (dl) { lijf.appendChild(dl); }

    /* Hoe laat het er ongeveer is. Dat is de vraag waarvoor gebeld wordt, en
       het antwoord staat hier zonder dat er iemand aan de telefoon hoeft. */
    var verwacht = verwachtBlok(r);
    if (verwacht) { lijf.appendChild(verwacht); }

    /* De weg die de zending heeft afgelegd. Dit stond eerder in losse mailtjes;
       nu staat het hier, waar het blijft staan en waar je het kunt terugkijken
       zonder je postvak door te zoeken. Alleen wat er echt is gebeurd krijgt
       een tijdstip; de rest is grijs en staat er om te laten zien wat er nog
       komt. */
    lijf.appendChild(tijdlijn(r));

    if (r.bedrag) {
      var b = maak('div', 'bedrag');
      b.appendChild(maak('span', '', 'Bedrag'));
      b.appendChild(maak('b', '', euro.format(r.bedrag) + ' excl. btw'));
      lijf.appendChild(b);
    }

    /* Een lopend of afgehandeld verzoek staat boven de knoppen: eerst zien wat
       er al ligt, dan pas de vraag of u nog iets wilt. */
    if (r.wijzigStand) { lijf.appendChild(wijzigStand(r)); }
    if (r.magWijzigen) { lijf.appendChild(wijzigBlok(r)); }

    if (r.magAnnuleren) {
      lijf.appendChild(annuleerBlok(r));
    } else if (r.status === 'Geannuleerd') {
      var af = maak('div', 'afgezegd');
      af.appendChild(maak('b', '', 'Geannuleerd'));
      af.appendChild(document.createTextNode(
        r.geannuleerdOp
          ? 'Afgezegd op ' + datumKort(r.geannuleerdOp) + ' om ' + klok(r.geannuleerdOp) + '.'
          : 'Deze zending is afgezegd.'
      ));
      lijf.appendChild(af);
    }

    if (r.afgeleverd || r.getekend) {
      var bewijs = maak('div', 'bewijs');
      var t = maak('div');
      t.appendChild(maak('b', '', 'Afgeleverd'));
      t.appendChild(document.createTextNode(
        'Getekend door ' + (r.getekend || 'de ontvanger') +
        (r.getekendOp ? ' op ' + datumKort(r.getekendOp) + ' om ' + klok(r.getekendOp) : '')
      ));
      bewijs.appendChild(t);
      lijf.appendChild(bewijs);

      /* De krabbel zelf erbij. Dat is waar een afleverbewijs om draait: je
         wilt hem kunnen zien, niet alleen lezen dat hij bestaat. */
      if (r.krabbel) {
        var vak = maak('a', 'krabbel');
        vak.href = veiligAdres(r.krabbel);
        vak.target = '_blank';
        vak.rel = 'noopener';
        var afb = document.createElement('img');
        afb.src = veiligePlaat(r.krabbel);
        afb.alt = 'Handtekening van ' + (r.getekend || 'de ontvanger');
        afb.loading = 'lazy';
        vak.appendChild(afb);
        lijf.appendChild(vak);
      }

      /* De foto's van de aflevering: waar het is neergezet en hoe het erbij
         stond. Dichtgeklapt, want niet iedereen wil dat zien en een kaart met
         vier plaatjes erop is geen kaart meer. De afbeeldingen worden pas
         opgehaald bij het openklappen.

         Zijn er geen foto's meegestuurd, dan staat hier niets. Voor een
         eenmalige klant is dat altijd zo: de tussenlaag stuurt ze niet mee.
         Er staat dan ook nergens dat er iets is dat hij niet mag zien. */
      if (r.fotos && r.fotos.length) { lijf.appendChild(fotovak(r)); }
    }

    kaart.appendChild(lijf);
    return kaart;
  }

  function fotovak(r) {
    var vak = maak('details', 'fotovak');
    var kop = maak('summary', 'fotovak__kop');

    var pijl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pijl.setAttribute('class', 'fotovak__pijl');
    pijl.setAttribute('width', '13');
    pijl.setAttribute('height', '13');
    pijl.setAttribute('viewBox', '0 0 24 24');
    pijl.setAttribute('fill', 'none');
    pijl.setAttribute('stroke', 'currentColor');
    pijl.setAttribute('stroke-width', '3');
    pijl.setAttribute('stroke-linecap', 'round');
    pijl.setAttribute('stroke-linejoin', 'round');
    pijl.setAttribute('aria-hidden', 'true');
    var pad = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pad.setAttribute('d', 'm9 18 6-6-6-6');
    pijl.appendChild(pad);

    kop.appendChild(pijl);
    kop.appendChild(document.createTextNode("Foto's bij de aflevering"));
    kop.appendChild(maak('span', '', r.fotos.length === 1 ? '1 foto'
                                                          : r.fotos.length + ' foto\u2019s'));
    vak.appendChild(kop);

    var raster = maak('div', 'fotos');
    r.fotos.forEach(function (f, nr) {
      var link = maak('a', '');
      link.href = veiligAdres(f.url);
      link.target = '_blank';
      link.rel = 'noopener';
      var plaat = document.createElement('img');
      /* Het adres staat klaar maar wordt pas een src als het vak opengaat.
         Anders haalt elke telefoon die het portaal opent alle foto's op van
         alles wat er ooit bezorgd is. */
      plaat.setAttribute('data-bron', f.klein || f.url);
      plaat.alt = 'Foto ' + (nr + 1) + ' bij deze aflevering';
      plaat.loading = 'lazy';
      link.appendChild(plaat);
      raster.appendChild(link);
    });
    vak.appendChild(raster);

    vak.addEventListener('toggle', function () {
      if (!vak.open) { return; }
      Array.prototype.forEach.call(raster.querySelectorAll('img[data-bron]'), function (plaat) {
        plaat.src = veiligePlaat(plaat.getAttribute('data-bron'));
        plaat.removeAttribute('data-bron');
      });
    });
    return vak;
  }

  /* Afzeggen kan in het portaal alleen zolang de rit nog gepland staat. Is de
     chauffeur al vertrokken, dan zegt de Worker dat er gebeld moet worden — dan
     kost het geld en hoort er een mens aan te pas te komen.

     Twee stappen: eerst een knop, dan pas het echte afzeggen. Eén verkeerde tik
     op een telefoon mag geen zending afzeggen. */
  /* ------------------------------------------------ hoe laat is het er

     De vraag waarvoor gebeld wordt. Het antwoord is een schatting en wordt ook
     als schatting opgeschreven: een tijdvak van drie kwartier, geen tijdstip
     op de minuut. Een minuut die op het scherm staat is een belofte, en een
     eenmansbedrijf dat in de file staat kan die niet nakomen — dan is een
     scherm dat zweeg beter geweest dan een scherm dat zich vergiste.

     Twee gevallen. Staat de zending nog gepland, dan rekenen we vanaf het
     afgesproken ophaaltijdstip en is de marge ruim. Is de chauffeur vertrokken,
     dan rekenen we vanaf dat moment en kan de marge krapper: dan is de helft
     van de onzekerheid — of hij op tijd wegkomt — al voorbij.

     Wat er niet in zit: druk verkeer, een wegafsluiting, en een klant die bij
     het laden nog even een tweede pallet klaarzet. Dat staat er ook onder. */
  var VAST_MIN = 20;      /* laden, lossen, en de stad in en uit */
  var SNELHEID = 75;      /* gemiddeld over de hele rit, niet op de snelweg */

  function rijminuten(km) {
    return VAST_MIN + Math.round((Number(km) || 0) / SNELHEID * 60);
  }

  /* Naar beneden op het kwartier, zodat er nooit een tijd staat als 10:07 —
     dat leest als een toezegging. */
  function opKwartier(d, omhoog) {
    var m = d.getMinutes();
    var uit = new Date(d.getTime());
    uit.setSeconds(0, 0);
    uit.setMinutes(omhoog ? Math.ceil(m / 15) * 15 : Math.floor(m / 15) * 15);
    return uit;
  }

  function uurMinuut(d) {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  /* Het vertrekmoment waar we vanaf rekenen, of null als we het niet weten.
     Zonder ophaaltijd geen schatting: een tijdvak dat op niets berust is
     erger dan geen tijdvak. */
  function vertrekVan(r) {
    if (r.onderwegOp) { return { moment: new Date(r.onderwegOp), onderweg: true }; }
    if (!r.datum || !/^\d{1,2}:\d{2}$/.test(String(r.tijd || ''))) { return null; }
    var d = new Date(r.datum.slice(0, 10) + 'T' + ('0' + r.tijd).slice(-5) + ':00');
    if (isNaN(d.getTime())) { return null; }
    return { moment: d, onderweg: false };
  }

  function verwachtBlok(r) {
    if (r.status === 'Geannuleerd' || r.afgeleverd || r.getekend) { return null; }
    if (!r.km) { return null; }
    var van = vertrekVan(r);
    if (!van) { return null; }

    var rij = rijminuten(r.km);
    var vroeg = new Date(van.moment.getTime() + rij * 60000);
    /* Onderweg is de helft van de onzekerheid voorbij, dus mag het venster
       krapper. Gepland telt ook het risico mee dat het laden uitloopt. */
    var laat = new Date(vroeg.getTime() + (van.onderweg ? 20 : 45) * 60000);

    /* Is het venster al voorbij, dan hoort er niets te staan. Een zending van
       vorige week die nog op gepland staat, of een rit die op Onderweg is
       blijven hangen: dan is er iets anders aan de hand, en een tijdvak dat
       vanmorgen al verstreken was is geen antwoord maar ruis. Wat er dan wél
       staat is de tijdlijn eronder, met wanneer wij vertrokken. */
    if (laat.getTime() < Date.now()) { return null; }

    var vak = maak('div', 'verwacht');
    vak.appendChild(maak('b', '', 'Verwacht bij u tussen ' +
      uurMinuut(opKwartier(vroeg, false)) + ' en ' +
      uurMinuut(opKwartier(laat, true))));
    vak.appendChild(maak('span', '', van.onderweg
      ? 'Geschat vanaf het moment dat wij vertrokken, op ' + Math.round(r.km) +
        ' km. Druk verkeer telt niet mee.'
      : 'Geschat op de afgesproken ophaaltijd en ' + Math.round(r.km) +
        ' km. Druk verkeer en wachten bij het laden tellen niet mee.'));
    return vak;
  }

  function tijdlijn(r) {
    var af = r.afgeleverd || r.getekend;
    var weg = !!r.onderwegOp || af;
    var stappen = [
      { naam: 'Aangevraagd', klaar: true, moment: '' },
      { naam: 'Ingepland',   klaar: !!r.bevestigdOp || weg,
        moment: r.bevestigdOp, extra: r.datum ? 'voor ' + datumKort(r.datum) : '' },
      { naam: 'Onderweg',    klaar: weg, moment: r.onderwegOp },
      { naam: 'Afgeleverd',  klaar: af, moment: r.getekendOp,
        extra: r.getekend ? 'getekend door ' + r.getekend : '' }
    ];
    if (r.status === 'Geannuleerd') {
      stappen = stappen.slice(0, 2).concat([
        { naam: 'Geannuleerd', klaar: true, moment: r.geannuleerdOp }
      ]);
    }

    var lijst = maak('ol', 'tijdlijn');
    stappen.forEach(function (st) {
      var li = maak('li', 'tijdlijn__stap' + (st.klaar ? ' tijdlijn__stap--klaar' : ''));
      li.appendChild(maak('span', 'tijdlijn__stip'));
      var tekst = maak('div');
      tekst.appendChild(maak('b', '', st.naam));
      var onder = st.moment
        ? datumKort(st.moment) + ' om ' + klok(st.moment)
        : (st.klaar ? (st.extra || '') : '');
      if (st.klaar && st.extra && st.moment) { onder += ' \u00b7 ' + st.extra; }
      if (onder) { tekst.appendChild(maak('span', 'tijdlijn__wanneer', onder)); }
      li.appendChild(tekst);
      lijst.appendChild(li);
    });
    return lijst;
  }

  function annuleerBlok(r) {
    var vak = maak('div', 'afzeggen');
    var start = maak('button', 'knop knop--rand', 'Deze zending annuleren');
    start.type = 'button';

    var vraag = maak('div', 'afzeggen__vraag');
    vraag.hidden = true;
    vraag.appendChild(maak('p', '', 'Weet u het zeker? Zolang wij nog niet zijn ' +
      'vertrokken kost annuleren u niets. Wij krijgen er meteen bericht van.'));

    var reden = document.createElement('textarea');
    reden.rows = 2;
    reden.maxLength = 500;
    reden.placeholder = 'Reden (mag u openlaten)';
    reden.setAttribute('aria-label', 'Reden van annuleren');
    vraag.appendChild(reden);

    var rij = maak('div', 'knoppen');
    var door = maak('button', 'knop knop--waarschuwing', 'Ja, annuleren');
    door.type = 'button';
    var terug = maak('button', 'knop knop--rand', 'Toch niet');
    terug.type = 'button';
    rij.appendChild(door);
    rij.appendChild(terug);
    vraag.appendChild(rij);

    start.addEventListener('click', function () {
      start.hidden = true;
      vraag.hidden = false;
      reden.focus();
    });
    terug.addEventListener('click', function () {
      vraag.hidden = true;
      start.hidden = false;
    });
    door.addEventListener('click', function () {
      door.disabled = true;
      terug.disabled = true;
      door.textContent = 'Bezig…';
      verstuur({ actie: 'klantannuleer', rit: r.sleutel, reden: reden.value })
        .then(function (data) {
          meldApp('');
          toon(data, r.sleutel);
        })
        .catch(function (fout) {
          meldApp(fout.message);
          door.disabled = false;
          terug.disabled = false;
          door.textContent = 'Ja, annuleren';
        });
    });

    vak.appendChild(start);
    vak.appendChild(vraag);
    return vak;
  }

  /* Wat er met een eerder verzoek is gebeurd. Zonder dit blok moet de klant
     bellen om te vragen of we het gezien hebben, en dat telefoontje is precies
     wat dit portaal hoort te besparen. */
  function wijzigStand(r) {
    /* Alles hieronder komt van de tussenlaag. Normaal is dat tekst, maar deze
       code hoort ook overeind te blijven als er een getal of een object staat
       — anders klapt het hele portaal eruit op een veld dat er niet toe doet.
       Zie tests/faal-portalen.mjs. */
    var stand = String(r.wijzigStand || '');
    var soort = String(r.wijzigSoort || '');
    var tekstVan = String(r.wijzigverzoek || '');
    var vak = maak('div', 'afgezegd');
    var kop = stand === 'Open' ? 'Uw verzoek ligt bij ons'
            : stand === 'Ingewilligd' ? 'Uw verzoek is doorgevoerd'
            : 'Uw verzoek is niet doorgevoerd';
    vak.appendChild(maak('b', '', kop));

    var wat = (soort ? soort.toLowerCase() + ': ' : '') + tekstVan;
    vak.appendChild(document.createTextNode(
      wat + (r.wijzigOp ? ' (doorgegeven op ' + datumKort(r.wijzigOp) + ')' : '')));

    if (stand === 'Open') {
      vak.appendChild(maak('p', '', 'Wij kijken ernaar en laten het weten. ' +
        'Verandert er iets aan de prijs, dan hoort u dat vooraf.'));
    } else if (stand === 'Afgewezen') {
      vak.appendChild(maak('p', '', 'Bel ons gerust als u wilt weten waarom, ' +
        'of als het toch anders moet.'));
    }
    return vak;
  }

  /* Een wijziging vragen. Nadrukkelijk vragen en niet zelf zetten: een stop
     erbij of een ander afleveradres verandert de prijs, en die spreken we
     samen af. Daarom staat dat er ook met zoveel woorden bij. */
  function wijzigBlok(r) {
    var vak = maak('div', 'afzeggen');
    var start = maak('button', 'knop knop--rand', 'Wijziging doorgeven');
    start.type = 'button';

    var vraag = maak('div', 'afzeggen__vraag');
    vraag.hidden = true;
    vraag.appendChild(maak('p', '', 'Wat moet er anders? Wij kijken ernaar en ' +
      'laten het weten. Verandert er iets aan de prijs — bijvoorbeeld bij een ' +
      'extra stop of een verder afleveradres — dan hoort u dat vooraf.'));

    var kies = document.createElement('select');
    kies.setAttribute('aria-label', 'Waar gaat het over');
    ['Extra stop', 'Ander afleveradres', 'Andere datum of tijd', 'Iets anders']
      .forEach(function (naam) {
        var o = document.createElement('option');
        o.value = naam;
        o.textContent = naam;
        kies.appendChild(o);
      });
    vraag.appendChild(kies);

    var tekst = document.createElement('textarea');
    tekst.rows = 3;
    tekst.maxLength = 1000;
    tekst.placeholder = 'Bijvoorbeeld: er moet een doos mee naar Breda, ' +
                        'Hoofdstraat 12, onderweg.';
    tekst.setAttribute('aria-label', 'Wat er anders moet');
    vraag.appendChild(tekst);

    var rij = maak('div', 'knoppen');
    var door = maak('button', 'knop', 'Versturen');
    door.type = 'button';
    var terug = maak('button', 'knop knop--rand', 'Toch niet');
    terug.type = 'button';
    rij.appendChild(door);
    rij.appendChild(terug);
    vraag.appendChild(rij);

    start.addEventListener('click', function () {
      start.hidden = true;
      vraag.hidden = false;
      tekst.focus();
    });
    terug.addEventListener('click', function () {
      vraag.hidden = true;
      start.hidden = false;
    });
    door.addEventListener('click', function () {
      if (tekst.value.trim().length < 3) {
        meldApp('Schrijf even wat er anders moet.');
        tekst.focus();
        return;
      }
      door.disabled = true;
      terug.disabled = true;
      door.textContent = 'Bezig\u2026';
      verstuur({ actie: 'klantwijzig', rit: r.sleutel,
                 soort: kies.value, tekst: tekst.value })
        .then(function (data) {
          meldApp('');
          toon(data, r.sleutel);
        })
        .catch(function (fout) {
          meldApp(fout.message);
          door.disabled = false;
          terug.disabled = false;
          door.textContent = 'Versturen';
        });
    });

    vak.appendChild(start);
    vak.appendChild(vraag);
    return vak;
  }

  function tekenFacturen() {
    var lijst = el('lijst-facturen');
    lijst.innerHTML = '';
    if (!facturen.length) {
      lijst.appendChild(maak('div', 'leeg', 'Er staan nog geen facturen open of klaar.'));
      return;
    }
    facturen.forEach(function (f) { lijst.appendChild(tekenFactuur(f)); });
  }

  function tekenFactuur(f) {
    var open = (Number(f.openstaand) || 0) > 0;
    var kaart = maak('details', 'kaart');
    kaart.open = open;

    var kop = maak('summary', 'kaart__kop');
    kop.appendChild(maak('span', 'merk ' + (open ? 's-open' : 's-betaald'),
      open ? 'Open' : 'Voldaan'));

    var hoofd = maak('div', 'kaart__hoofd');
    hoofd.appendChild(maak('div', 'kaart__titel', f.nummer || 'Factuur'));
    hoofd.appendChild(maak('div', 'kaart__regel',
      datumKort(f.datum) + (f.vervalt ? '  ·  vervalt ' + datumKort(f.vervalt) : '')));
    kop.appendChild(hoofd);
    kaart.appendChild(kop);

    var lijf = maak('div', 'kaart__lijf');

    var b = maak('div', 'bedrag');
    b.appendChild(maak('span', '', open ? 'Openstaand' : 'Totaal'));
    b.appendChild(maak('b', '', euro.format(open ? f.openstaand : f.totaal)));
    lijf.appendChild(b);

    var dl = paarLijst([
      ['Totaal', euro.format(f.totaal || 0)],
      ['Betaald', f.betaald ? euro.format(f.betaald) : ''],
      ['Vervaldatum', datumKort(f.vervalt)]
    ]);
    if (dl) { lijf.appendChild(dl); }

    var knoppen = maak('div', 'knoppen');
    if (f.pdf) {
      var pdf = maak('a', 'knop knop--rand', 'Factuur als PDF');
      pdf.href = veiligAdres(f.pdf);
      pdf.target = '_blank';
      pdf.rel = 'noopener';
      knoppen.appendChild(pdf);
    } else if (f.link) {
      var web = maak('a', 'knop knop--rand', 'Factuur bekijken');
      web.href = veiligAdres(f.link);
      web.target = '_blank';
      web.rel = 'noopener';
      knoppen.appendChild(web);
    }
    if (knoppen.children.length) { lijf.appendChild(knoppen); }

    kaart.appendChild(lijf);
    return kaart;
  }

  /* ---------------------------------------------------------- opstarten */

  adres = CONFIG.portaalUrl;
  try {
    code = localStorage.getItem(CONFIG.sleutel) || '';
  } catch (e) {
    code = '';
  }

  /* Een link met de code erin is gemakkelijk voor de klant, maar hij moet niet
     in de adresbalk blijven staan: dan gaat hij mee in een schermfoto of in de
     geschiedenis van een gedeelde computer. Overnemen en meteen wissen. */
  var uitLink = new URLSearchParams(window.location.search).get('code');
  if (uitLink) {
    code = uitLink.trim();
    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch (e) { /* oudere browser */ }
  }

  if (code && adres) {
    el('slot').hidden = true;
    el('app').hidden = false;
    verstuur().then(function (data) {
      /* Ook een code die uit de link kwam onthouden. Anders moet de klant bij
         elk bezoek de mail weer opzoeken, en dat doet niemand twee keer. */
      try { localStorage.setItem(CONFIG.sleutel, code); } catch (e) { /* privé */ }
      toon(data);
    }).catch(function (fout) {
      el('app').hidden = true;
      el('slot').hidden = false;
      meldSlot(fout.message);
    });
  }
})();
