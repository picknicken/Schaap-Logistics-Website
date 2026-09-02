/* =========================================================================
   Prijscalculator op de homepage. Doet niets op pagina's zonder calculator.
   ========================================================================= */
(function () {
  'use strict';

  var kmInput = document.getElementById('kmInput');
  if (!kmInput) { return; }

  var CONFIG = window.SL.CONFIG;
  var euro   = window.SL.euro;

  var kmRange  = document.getElementById('kmRange');
  var rowsBox  = document.getElementById('calcRows');
  var rowTotal = document.getElementById('rowTotal');
  var rowVat   = document.getElementById('rowVat');
  var pcVan    = document.getElementById('pcVan');
  var pcNaar   = document.getElementById('pcNaar');
  var pcStatus = document.getElementById('pcStatus');
  var calcCta  = document.getElementById('calcCta');

  var ritKnop = {
    standaard: document.getElementById('btnStandaard'),
    spoed:     document.getElementById('btnSpoed'),
    direct:    document.getElementById('btnDirect')
  };
  var tijdKnop = {
    dag:   document.getElementById('btnDag'),
    avond: document.getElementById('btnAvond'),
    nacht: document.getElementById('btnNacht')
  };

  var soort = 'standaard';
  var tijd  = 'dag';

  /* De knop wijst naar het aanvraagformulier op een eigen pagina. Het adres
     staat in de HTML, zodat dit bestand niet hoeft te weten waar die pagina
     staat; hieronder komt alleen de query erachter. */
  var ctaBasis = calcCta ? calcCta.getAttribute('href') : null;

  function huidigeKm() {
    var v = parseInt(kmInput.value, 10);
    if (isNaN(v) || v < 1) { v = 1; }
    if (v > 500) { v = 500; }
    return v;
  }

  function regel(label, bedrag, extraClass) {
    var d = document.createElement('div');
    d.className = 'calc__row' + (extraClass ? ' ' + extraClass : '');
    var a = document.createElement('span'); a.textContent = label;
    var b = document.createElement('span'); b.textContent = euro.format(bedrag);
    d.appendChild(a); d.appendChild(b);
    return d;
  }

  /* Geeft de gemaakte keuzes mee aan het aanvraagformulier, zodat de bezoeker
     ze daar niet opnieuw hoeft in te vullen. De kilometers gaan bewust niet
     mee: het formulier leidt de afstand af uit de ingevulde adressen, zodat de
     prijsindicatie altijd hoort bij wat er daadwerkelijk in de aanvraag staat. */
  function ververCta() {
    if (!ctaBasis) { return; }
    var q = ['dienst=' + soort, 'tijd=' + tijd];
    if (pcVan.value.trim())  { q.push('van='  + encodeURIComponent(pcVan.value.trim())); }
    if (pcNaar.value.trim()) { q.push('naar=' + encodeURIComponent(pcNaar.value.trim())); }
    calcCta.href = ctaBasis + '?' + q.join('&');
  }

  function render() {
    var km = huidigeKm();
    var b  = window.SL.bereken(soort, km, tijd);

    rowsBox.innerHTML = '';
    rowsBox.appendChild(regel('Starttarief', b.tarief.start));
    rowsBox.appendChild(regel(km + ' km × ' + euro.format(b.tarief.km), b.kmSom));
    if (b.correctie > 0) {
      rowsBox.appendChild(regel('Aanvulling tot minimumtarief', b.correctie, 'calc__row--minimum'));
    }
    if (b.tijdstip.toeslag > 0) {
      rowsBox.appendChild(regel(b.tijdstip.naam, b.tijdstip.toeslag, 'calc__row--toeslag'));
    }

    rowTotal.textContent = euro.format(b.totaal);
    rowVat.textContent   = euro.format(b.totaal * (1 + CONFIG.btw)) + ' incl. 21% btw';

    var k;
    for (k in ritKnop)  { ritKnop[k].setAttribute('aria-pressed',  k === soort ? 'true' : 'false'); }
    for (k in tijdKnop) { tijdKnop[k].setAttribute('aria-pressed', k === tijd  ? 'true' : 'false'); }

    ververCta();
  }

  function zetKm(v, bron) {
    v = Math.max(1, Math.min(500, v));
    if (bron !== 'input') { kmInput.value = v; }
    if (bron !== 'range') { kmRange.value = Math.min(v, parseInt(kmRange.max, 10)); }
    render();
  }

  function meldPostcode(tekst, soortMelding) {
    pcStatus.textContent = tekst;
    pcStatus.className = 'pc-status pc-status--' + soortMelding;
  }

  function verwerkPostcodes() {
    var a = window.SL.postcodeUit(pcVan.value);
    var b = window.SL.postcodeUit(pcNaar.value);

    if (!pcVan.value.trim() && !pcNaar.value.trim()) {
      meldPostcode('Vul twee Nederlandse postcodes in voor een automatische schatting.', 'info');
      ververCta();
      return;
    }
    if (!a || !b) {
      meldPostcode('Vul beide postcodes in als vier cijfers, bijvoorbeeld 3011 en 5611.', 'info');
      ververCta();
      return;
    }
    if (!window.SL.regioVan(a) || !window.SL.regioVan(b)) {
      meldPostcode('Onbekende postcode. Voor buitenlandse adressen vragen wij een offerte aan.', 'err');
      ververCta();
      return;
    }

    var km = window.SL.schatAfstand(a, b);
    zetKm(km, 'postcode');
    meldPostcode('Geschatte rijafstand: ongeveer ' + km + ' km. Klopt dat niet? Pas de kilometers hieronder aan.', 'ok');
  }

  kmRange.addEventListener('input', function () { zetKm(parseInt(kmRange.value, 10), 'range'); });
  kmInput.addEventListener('input', function () {
    if (kmInput.value === '') { return; }
    zetKm(huidigeKm(), 'input');
  });
  kmInput.addEventListener('blur', function () { zetKm(huidigeKm(), 'blur'); });

  pcVan.addEventListener('input', verwerkPostcodes);
  pcNaar.addEventListener('input', verwerkPostcodes);

  Object.keys(ritKnop).forEach(function (k) {
    ritKnop[k].addEventListener('click', function () { soort = k; render(); });
  });
  Object.keys(tijdKnop).forEach(function (k) {
    tijdKnop[k].addEventListener('click', function () { tijd = k; render(); });
  });

  render();
})();
