/* =========================================================================
   De service worker van het chauffeursportaal.

   Twee taken: pushmeldingen aannemen, en zorgen dat het portaal opengaat als
   je geen bereik hebt.

   Over dat tweede stond hier eerst dat er bewust niet gecachet werd, omdat een
   portaal nooit een oud scherm mag tonen zonder dat je dat ziet. Dat blijft
   staan en het is de reden dat hier alleen de app zelf in de cache gaat — de
   pagina, het script, het pictogram. Geen ritten, geen statussen, geen
   bedragen: die komen via POST bij de tussenlaag vandaan en daar komt deze
   service worker niet aan. Wat er van de laatste dag bewaard wordt regelt het
   portaal zelf, met de tijd erbij op het scherm.

   Onderscheppen kan alleen binnen de eigen map. Daarom staat portaal.js naast
   deze pagina en niet in assets/ — anders zou je zonder bereik een pagina
   krijgen zonder script, en dat is een leeg scherm met een titel.

   Wordt geregistreerd zodra het portaal opent, niet pas bij meldingen.
   ========================================================================= */

/* Hoog dit op als er iets aan de cachestrategie verandert; bij het activeren
   wordt alles wat een andere naam heeft weggegooid. */
var CACHE = 'schaap-portaal-1';

/* Wat er meteen bij het installeren in moet, zodat het portaal ook opengaat
   als de eerste keer dat je geen bereik hebt tegelijk de eerste keer is dat je
   hem opent. De rest komt vanzelf in de cache bij gebruik. */
var KERN = ['./', './portaal.js?v=20260908', './manifest.webmanifest'];

/* Hoe lang we op het netwerk wachten voordat we teruggrijpen op de cache.
   Helemaal geen bereik merkt de browser zelf meteen; één streepje is erger,
   want dan blijft een verzoek hangen. Vier seconden staan met een dooie
   verbinding naar een scherm te kijken is precies wat je onderweg niet wilt. */
var GEDULD = 4000;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then(function (kast) { return kast.addAll(KERN); })
      /* Lukt het voorvullen niet — bijvoorbeeld omdat je juist nu geen bereik
         hebt — dan gaat de installatie gewoon door. De cache vult zich dan bij
         het eerste bezoek mét bereik. Een mislukte installatie zou betekenen
         dat er helemaal geen service worker komt. */
      .catch(function () { return null; })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (namen) {
        return Promise.all(namen.map(function (naam) {
          return naam === CACHE ? null : caches.delete(naam);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Netwerk eerst, cache als terugval. In die volgorde en niet andersom: met
   bereik hoor je altijd de verse versie te krijgen, zodat een wijziging er
   meteen op staat en niemand op een cache zit te wachten die vanzelf verloopt.
   Zonder bereik krijg je wat er de laatste keer stond.

   Alleen GET binnen de eigen map. De tussenlaag draait op een ander adres en
   praat via POST; daar blijven we vanaf. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  var adres = new URL(e.request.url);
  if (adres.origin !== self.location.origin) { return; }
  if (adres.pathname.indexOf(new URL('./', self.location.href).pathname) !== 0) { return; }

  e.respondWith(
    haalMetGeduld(e.request)
      .then(function (res) {
        /* Alleen een echt antwoord bewaren. Een 404 of een foutpagina in de
           cache stoppen betekent dat je hem zonder bereik ook terugkrijgt. */
        if (res && res.ok) {
          var kopie = res.clone();
          caches.open(CACHE).then(function (kast) { kast.put(e.request, kopie); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(e.request).then(function (uit) {
          if (uit) { return uit; }
          /* Een pagina die er niet is: dan toch maar de startpagina van het
             portaal, want daar staat het inlogscherm en die kent de weg. */
          if (e.request.mode === 'navigate') { return caches.match('./'); }
          throw new Error('niet in de cache');
        });
      })
  );
});

function haalMetGeduld(verzoek) {
  return new Promise(function (klaar, mislukt) {
    var af = false;
    var wekker = setTimeout(function () {
      if (!af) { af = true; mislukt(new Error('te traag')); }
    }, GEDULD);
    fetch(verzoek).then(function (res) {
      clearTimeout(wekker);
      if (!af) { af = true; klaar(res); }
    }, function (fout) {
      clearTimeout(wekker);
      if (!af) { af = true; mislukt(fout); }
    });
  });
}

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
