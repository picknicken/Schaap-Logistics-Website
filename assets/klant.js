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
                          'vraag Schaap Logistics om een nieuwe.');
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

  function toon(data) {
    ritten = data.ritten || [];
    facturen = data.facturen || [];
    if (data.klant && data.klant.naam) {
      el('kop-klant').textContent = data.klant.naam.toUpperCase();
    }
    badge('badge-zendingen', ritten.filter(function (r) {
      return r.status !== 'Uitgevoerd';
    }).length);
    badge('badge-facturen', facturen.filter(function (f) {
      return (Number(f.openstaand) || 0) > 0;
    }).length);
    tekenZendingen();
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

  function tekenZendingen() {
    var lijst = el('lijst-zendingen');
    lijst.innerHTML = '';
    if (!ritten.length) {
      lijst.appendChild(maak('div', 'leeg', 'Er staan nog geen zendingen op uw naam.'));
      return;
    }
    ritten.forEach(function (r) { lijst.appendChild(tekenZending(r)); });
  }

  function tekenZending(r) {
    var kaart = maak('details', 'kaart');
    kaart.open = r.status !== 'Uitgevoerd';

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

    if (r.bedrag) {
      var b = maak('div', 'bedrag');
      b.appendChild(maak('span', '', 'Bedrag'));
      b.appendChild(maak('b', '', euro.format(r.bedrag) + ' excl. btw'));
      lijf.appendChild(b);
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
    }

    kaart.appendChild(lijf);
    return kaart;
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
      pdf.href = f.pdf;
      pdf.target = '_blank';
      pdf.rel = 'noopener';
      knoppen.appendChild(pdf);
    } else if (f.link) {
      var web = maak('a', 'knop knop--rand', 'Factuur bekijken');
      web.href = f.link;
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
