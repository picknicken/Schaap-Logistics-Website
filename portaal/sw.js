/* =========================================================================
   De service worker van het chauffeursportaal.

   Hij doet één ding: pushmeldingen aannemen en laten zien. Bewust géén
   caching. Een portaal dat ritten, statussen en bedragen toont mag nooit een
   oud scherm uit het geheugen opdiepen — dan sta je bij een klant naar de
   planning van gisteren te kijken en weet je niet dat het oud is. Een lege
   pagina bij slecht bereik is vervelend; een verkeerde pagina is erger.

   Wordt geregistreerd vanuit assets/portaal.js, alleen als je meldingen
   aanzet. Zet je ze uit, dan blijft hij staan maar doet hij niets.
   ========================================================================= */

/* Meteen de nieuwe versie laten gelden, in plaats van te wachten tot alle
   tabbladen dicht zijn. Er is hier geen cache die eronder vandaan kan vallen,
   dus dat is hier gevaarloos. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

var STANDAARD = {
  titel: 'Chauffeursportaal',
  tekst: 'Er is iets nieuws. Open het portaal om te kijken.',
  tag: 'schaap'
};

self.addEventListener('push', function (e) {
  var bericht = Object.assign({}, STANDAARD);

  /* De tekst zit versleuteld in het bericht en de browser pakt hem uit. Lukt
     dat niet — een oudere versie van de tussenlaag, of een seintje zonder
     inhoud — dan tonen we de algemene tekst. Liever een vage melding dan
     helemaal geen, want dan mis je de spoedrit. */
  try {
    if (e.data) { bericht = Object.assign(bericht, e.data.json()); }
  } catch (fout) {
    try { if (e.data) { bericht.tekst = e.data.text(); } } catch (nog) { /* laat staan */ }
  }

  e.waitUntil(self.registration.showNotification(bericht.titel, {
    body: bericht.tekst,
    icon: '../assets/app-icoon-192.png',
    badge: '../assets/app-icoon-192.png',
    /* Dezelfde tag vervangt een eerdere melding over hetzelfde. Twee keer een
       seintje over dezelfde aanvraag levert zo één regel op je scherm op. */
    tag: bericht.tag || STANDAARD.tag,
    renotify: true,
    requireInteraction: !!bericht.spoed,
    data: { url: bericht.url || './' }
  }));
});

/* Aantikken opent het portaal. Staat het al open, dan springen we daarheen in
   plaats van een tweede venster te maken. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var doel = new URL((e.notification.data && e.notification.data.url) || './',
                     self.location.href).href;

  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (vensters) {
      for (var i = 0; i < vensters.length; i++) {
        if (vensters[i].url.indexOf(self.registration.scope) === 0 && 'focus' in vensters[i]) {
          return vensters[i].focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(doel) : null;
    }));
});
