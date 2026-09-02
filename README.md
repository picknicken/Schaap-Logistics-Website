# Schaap Logistics — website

Statische site voor Schaap Logistics: zakelijk koeriers- en spoedtransport.
Geen build-stap, geen framework, geen dependencies — platte HTML met één
stylesheet en vier scriptbestanden.

**Live:** https://picknicken.github.io/Schaap-Logistics-Website/

## Lokaal bekijken

Een los bestand openen door erop te dubbelklikken werkt, maar dan lopen de links
tussen de pagina's dood: `file://` zoekt bij een adres als `diensten/` niet
vanzelf naar `index.html` en toont een lege map. Start daarom een klein
webservertje in de map van het project:

```sh
python3 -m http.server 8000     # of: npx http-server -p 8000
```

Daarna staat de site op http://localhost:8000/. Op GitHub Pages speelt dit niet;
die serveert `diensten/index.html` wel gewoon op `/diensten/`.

## Indeling

| Bestand | URL | Inhoud |
| --- | --- | --- |
| `index.html` | `/` | Hero met prijscalculator, diensten als tegels, doorverwijzingen |
| `diensten/index.html` | `/diensten/` | De vier transportvormen uitgewerkt |
| `tarieven/index.html` | `/tarieven/` | Tariefkaarten, rekenvoorbeelden, toeslagen, internationaal |
| `aanvragen/index.html` | `/aanvragen/` | Aanvraagformulier in vijf stappen met live prijsindicatie |
| `werkwijze/index.html` | `/werkwijze/` | Van aanvraag tot factuur in zeven stappen, plus "waarom" |
| `contact/index.html` | `/contact/` | Contactgegevens en berichtformulier |
| `404.html` | — | Wordt door GitHub Pages getoond bij een onbekend adres |

```
assets/
  site.css        alle opmaak, voor alle pagina's
  site.js         tarieven, afstandsberekening, e-mail, menu — op elke pagina
  calculator.js   de prijscalculator op de homepage
  aanvraag.js     het aanvraagformulier
  contact.js      het berichtformulier
worker/
  aanvragen.js    Cloudflare Worker die aanvragen in Airtable zet
  wrangler.toml   instellingen voor het uitrollen (zonder geheimen)
```

`worker/` hoort niet bij de site; het is de tussenlaag die op Cloudflare draait.
GitHub Pages serveert de map wel mee, maar er staat niets gevoeligs in — de
Airtable-token zit in de secrets van Cloudflare, niet in git.

`site.js` moet vóór de andere scripts geladen worden; het zet `window.SL` klaar
met `CONFIG` en de reken- en verzendfuncties. De drie andere bestanden schakelen
zichzelf uit als hun onderdeel niet op de pagina staat, zodat één script op een
pagina zonder dat onderdeel niets stukmaakt.

## Hoe de prijzen werken

De tarieven staan in `CONFIG` bovenaan `assets/site.js`. Postcodes worden omgezet
naar een geschatte rijafstand via de middelpunten van de Nederlandse
postcoderegio's (de eerste twee cijfers) plus een wegfactor van 1,25. Nauwkeurig
genoeg voor een indicatie, niet voor navigatie.

De knop onder de calculator linkt naar `/aanvragen/` en geeft de gekozen dienst,
het tijdvak en de postcodes mee in de URL
(`/aanvragen/?dienst=spoed&tijd=nacht&van=3011&naar=5611`), zodat het formulier
ingevuld openklapt. De kilometers gaan bewust niet mee: het formulier leidt de
afstand af uit de adressen die er staan, zodat de indicatie hoort bij wat er
daadwerkelijk in de aanvraag komt.

## Aanpassen

**Header en footer staan in elk HTML-bestand.** Platte HTML kent geen
templating, dus een wijziging aan het menu of de footer moet in alle zeven
bestanden. Dat is de prijs voor een site zonder build-stap.

De bedragen staan op twee plekken: in `CONFIG` (waar de calculator mee rekent) en
als tekst in de tariefkaarten en tabellen op `/tarieven/`. Wijzig je een tarief,
pas het dan op allebei aan.

## Checklist vóór livegang

Er staan nog placeholder-gegevens in de site, en door de opsplitsing staan ze nu
in meerdere bestanden. Zoek op `PLACEHOLDER` om ze te vinden.

- [ ] **Zet de site weer op indexeerbaar.** Zolang het een concept is met
      voorbeeldgegevens staat er op alle zeven pagina's
      `<meta name="robots" content="noindex,nofollow">`, zodat Google geen
      verzonnen telefoonnummer oppikt. Dat terugdraaien is de laatste handeling
      vóór livegang — vergeet je het, dan is je site onvindbaar:

      ```sh
      grep -rl 'noindex,nofollow' --include='*.html' . \
        | xargs sed -i 's/noindex,nofollow/index,follow/'
      ```

- [ ] **Algemene voorwaarden en privacyverklaring.** De footer stelt nu dat er
      algemene voorwaarden van toepassing zijn, maar er staat nergens een link
      naar zo'n document. Voeg ze toe, of haal die zin weg zolang ze er niet zijn.
      Een privacyverklaring hoort er sowieso te komen: het formulier verzamelt
      naam, telefoonnummer, e-mailadres, adressen en foto's en zet die door naar
      Cloudflare en Airtable.

- [ ] **Telefoonnummer** — nu `06 - 12 34 56 78` / `tel:+31612345678`, verspreid
      over alle zeven HTML-bestanden: header en footer van elke pagina, plus de
      contactsectie en een paar knoppen. Dat zijn 18 `tel:`-links en 17 keer de
      zichtbare tekst, dus vervang ze allebei:

      ```sh
      grep -rl '31612345678' --include='*.html' . \
        | xargs sed -i 's/+31612345678/+31XXXXXXXXX/g; s/06 - 12 34 56 78/06 - XX XX XX XX/g'
      ```

- [ ] **E-mailadres** — nu `info@schaaplogistics.nl`: 16 keer in de HTML (steeds
      als `mailto:`-link én als zichtbare tekst) en één keer in `CONFIG.email` in
      `assets/site.js`. Vergeet die laatste niet, anders komen de aanvragen op
      het verkeerde adres binnen:

      ```sh
      grep -rl 'info@schaaplogistics.nl' --include='*.html' --include='*.js' . \
        | xargs sed -i 's/info@schaaplogistics\.nl/JOUW@ADRES.nl/g'
      ```

- [ ] **KvK-nummer** in de footer (`nog invullen`), in alle zeven bestanden.
- [ ] **Btw-nummer** in de footer (`nog invullen`), in alle zeven bestanden.
- [ ] **Tarieven controleren**, op beide plekken (zie hierboven).

Controleer na een `sed`-ronde met `grep -rn PLACEHOLDER .` of er niets is blijven
staan.

## Formulieren versturen

Eén instelling bepaalt waar een aanvraag heen gaat: `CONFIG.webhookUrl` in
`assets/site.js`.

**Leeg** (zoals nu): het formulier opent het e-mailprogramma van de bezoeker met
alles al ingevuld. Werkt zonder server, en dus prima op GitHub Pages.

**Ingevuld**: de aanvraag gaat als JSON naar die URL, die hem in Airtable zet.
Dat is de Cloudflare Worker in `worker/aanvragen.js` — zie `AIRTABLE.md` voor het
installeren ervan.

> Zet nooit een Airtable-token in `assets/site.js`. Alles in dat bestand is
> leesbaar voor iedere bezoeker; daarom staat de token in de Worker.

## Publiceren

GitHub Pages staat op branch `main`, map `/` (root). `.nojekyll` zorgt dat de
bestanden ongewijzigd geserveerd worden in plaats van door Jekyll te gaan.

Aanpassing doorvoeren: bewerken, committen, pushen. Pages publiceert de nieuwe
versie binnen ongeveer een minuut.
