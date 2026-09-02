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
| `factuur/index.html` | `/factuur/` | Factuur op papierformaat, gevuld vanuit de adresregel |
| `portaal/index.html` | `/portaal/` | Chauffeursportaal: ritten van de dag, statussen, handtekeningen |
| `404.html` | — | Wordt door GitHub Pages getoond bij een onbekend adres |

```
assets/
  site.css                alle opmaak, voor alle pagina's
  site.js                 tarieven, afstandsberekening, e-mail, menu — op elke pagina
  calculator.js           de prijscalculator op de homepage
  aanvraag.js             het aanvraagformulier
  contact.js              het berichtformulier
  portaal.js              het chauffeursportaal
  logo-sl-wit.png         beeldmerk, wit — in de donkere header en footer
  logo-sl.png             beeldmerk, zwart
  logo-volledig-wit.png   beeldmerk plus woordmerk, wit
  logo-volledig.png       beeldmerk plus woordmerk, zwart — bovenaan de factuur
  favicon.png             het tabbladpictogram
worker/
  aanvragen.js    Cloudflare Worker die aanvragen in Airtable zet
  wrangler.toml   instellingen voor het uitrollen (zonder geheimen)
worker-portaal/
  portaal.js      tweede Worker, voor het chauffeursportaal
  wrangler.toml   instellingen voor het uitrollen (zonder geheimen)
```

Twee Workers en niet één, met opzet: `schaap-aanvragen` draait en neemt aanvragen
aan. Daar wil je niet in hoeven snijden om aan het portaal te werken, en een fout
in het portaal mag nooit het aanvraagformulier meeslepen.

De `worker`-mappen horen niet bij de site; het is de tussenlaag die op Cloudflare draait.
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
bestanden. Dat is de prijs voor een site zonder build-stap. `factuur/index.html`
telt hier niet mee: dat is een losstaande printpagina met een eigen kop.

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
        | grep -v -e '^./factuur/' -e '^./portaal/' \
        | xargs sed -i 's/noindex,nofollow/index,follow/'
      ```

      `factuur/index.html` en `portaal/index.html` blijven bewust op `noindex`:
      dat zijn interne hulpmiddelen met klantgegevens en die horen niet in Google.

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

## De factuur

`/factuur/` toont één factuur in de opmaak van de mal van Schaap Logistics, klaar
om te printen of als PDF op te slaan. De pagina heeft geen database: alles komt
uit de adresregel.

```
/factuur/?nr=SL-2026-0001&datum=2026-09-15&klant=Voorbeeld%20BV&km=109&kmtarief=2&start=75&toeslag=35
```

Zonder gegevens in de adresregel toont hij een voorbeeldfactuur, zodat je meteen
ziet hoe het eruitziet.

| Sleutel | Betekenis |
| --- | --- |
| `nr`, `datum`, `ritdatum` | Factuurnummer en de twee datums (`JJJJ-MM-DD`) |
| `debiteur`, `klantbtw`, `ref` | Klantnummer, btw-nummer van de klant, hun eigen ordernummer |
| `opdracht` | Het opdrachtnummer |
| `klant`, `adres`, `plaats` | Het adresblok. Staat `plaats` er niet, dan wordt de laatste regel van `adres` de woonplaats |
| `van`, `naar`, `oms` | Route en omschrijving van de opdracht |
| `km`, `kmtarief` | Regel 10: kilometers maal tarief |
| `start` | Regel 20: het starttarief |
| `toeslag`, `toeslagoms` | Regel 30: een toeslag met omschrijving |
| `termijn` | Betalingstermijn in dagen (standaard 14) |
| `minimum` | Het minimum per opdracht (standaard 75) |

De pagina rekent zelf de 21% btw en vult zo nodig aan tot het minimumtarief, als
regel 40. Bedragen mogen met een punt of een komma.

Je hoeft die adresregel nooit zelf te typen: in Airtable staat op elke factuur het
veld `Factuurlink`, dat hem uit de gekoppelde rit, klant en opdracht opbouwt. Zie
`AIRTABLE.md`.

## Het chauffeursportaal

`/portaal/` is de kant van de site die klanten nooit zien: de ritten van de dag op
je telefoon, met knoppen om de status om te zetten, een route te starten en de
ontvanger te laten tekenen. Nergens naartoe gelinkt vanaf de site — zet hem op je
beginscherm als snelkoppeling.

Wat het kan:

- **De dag overzien.** Bovenaan het aantal ritten, hoeveel er nog openstaan, de
  kilometers en de omzet van die dag. Met pijltjes blader je naar gisteren of morgen.
- **Status omzetten.** *Onderweg* legt meteen het vertrektijdstip vast, zodat je
  achteraf ziet hoe lang een rit werkelijk duurde.
- **Route starten.** Bij een geplande rit wijst de knop naar het ophaaladres, bij
  een rit die onderweg is naar het afleveradres. Opent Google Maps op de telefoon,
  zonder sleutel of account.
- **Laten tekenen.** De ontvanger zet zijn handtekening op je scherm en typt zijn
  naam. Die gaan als afleverbewijs bij de rit in Airtable, en de rit springt op
  *Uitgevoerd* — waarmee de conceptfactuur zichzelf aanmaakt.

Twee dingen die bewust zo zijn:

**De toegangscode is een gedeeld wachtwoord, geen account.** Het past bij één man
met één telefoon. Wie de code heeft, ziet alle ritten en klantgegevens. Raakt je
telefoon kwijt, wijzig dan `PORTAAL_CODE` in Cloudflare — dat apparaat is er dan
meteen uit. Komt er ooit een tweede chauffeur bij, dan is dit het eerste wat moet
veranderen.

**Bij het tekenen gaat de administratie voor de krabbel.** Eerst de naam, het
tijdstip en de status vastleggen, dan pas de afbeelding uploaden. Mislukt die
upload, dan klopt de administratie nog steeds en zegt het portaal dat opnieuw
getekend moet worden. In Airtable springt het veld `Afleverbewijs` dan op
*Ontbreekt*, zodat het niet stilletjes wegzakt.

Het portaal werkt niet offline. Val je onderweg uit bereik, dan zegt het dat er
niets verstuurd is en probeer je het opnieuw zodra je weer bereik hebt.

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
