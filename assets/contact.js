/* =========================================================================
   Het berichtformulier op /contact/. Doet niets op pagina's zonder dat
   formulier.
   ========================================================================= */
(function () {
  'use strict';

  var contactForm = document.getElementById('contactForm');
  if (!contactForm) { return; }

  function veld(id) {
    var el = document.getElementById(id);
    return el && el.value.trim() ? el.value.trim() : '-';
  }

  contactForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!contactForm.checkValidity()) { contactForm.reportValidity(); return; }

    window.SL.verstuurViaMail('Bericht via de website: ' + veld('c-onderwerp'), [
      'Bericht via de website',
      '',
      'Onderwerp:       ' + veld('c-onderwerp'),
      'Bedrijf:         ' + veld('c-bedrijf'),
      'Contactpersoon:  ' + veld('c-naam'),
      'Telefoon:        ' + veld('c-tel'),
      'E-mail:          ' + veld('c-mail'),
      '',
      veld('c-bericht')
    ], document.getElementById('contactNote'), 'het bericht');
  });
})();
