# Schaap Express Transport — website

Statische site voor Schaap Express Transport: zakelijk koeriers- en spoedtransport.
Geen build-stap, geen framework, geen dependencies — platte HTML met één
stylesheet en vier scriptbestanden.

**Live:** https://schaaplogistics.nl/

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
| `klant/index.html` | `/klant/` | Klantportaal: eigen zendingen en facturen, met een eigen code |
| `404.html` | — | Wordt door GitHub Pages getoond bij een onbekend adres |

```
assets/
  site.css                alle opmaak, voor alle pagina's
  site.js                 tarieven, afstandsberekening, e-mail, menu — op elke pagina
  calculator.js           de prijscalculator op de homepage
  aanvraag.js             het aanvraagformulier
  contact.js              het berichtformulier
  portaal.js              het chauffeursportaal
  klant.js                het klantportaal
  logo-schaap-express-wit.png      het hele woordmerk, wit — de voettekst en
                                   de twee portalen
  logo-schaap-express.png          hetzelfde, donker — bovenaan de factuur
  logo-schaap-express-kop-wit.png  zonder de regel TRANSPORT, voor de menubalk;
                                   die regel is op 32 pixels hoog niet leesbaar
  logo-schaap-express-kop.png      hetzelfde, donker
  favicon.png                      het tabbladpictogram
  favicon-bron.html                de bron daarvan, foto maken op 256x256
  deelkaart.jpg           1200x630, het plaatje dat WhatsApp en LinkedIn tonen
  deelkaart-bron.html     de bron daarvan; foto maken op 1200x630 en opslaan
  inter.woff2             het lettertype, op onze eigen server
  inter-OFL.txt           de licentie die daarbij hoort (SIL Open Font License)
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

Deze lijst gaat alleen over de website. Het volledige overzicht van wat er nog
open staat — ook aan de kant van Airtable, de mail en de zakelijke keuzes die nog
gemaakt moeten worden — staat in `OPENSTAAND.md`.

- [ ] **Zet de site weer op indexeerbaar.** Zolang het een concept is met
      voorbeeldgegevens staat er op alle zeven pagina's
      `<meta name="robots" content="noindex,nofollow">`, zodat Google geen
      verzonnen telefoonnummer oppikt. Dat terugdraaien is de laatste handeling
      vóór livegang — vergeet je het, dan is je site onvindbaar:

      ```sh
      grep -rl 'noindex,nofollow' --include='*.html' . \
        | grep -v -e '^./factuur/' -e '^./portaal/' -e '^./klant/' \
        | xargs sed -i 's/noindex,nofollow/index,follow/'
      ```

      `factuur/`, `portaal/` en `klant/` blijven bewust op `noindex`: dat zijn
      besloten schermen met klantgegevens en die horen niet in Google.

      `robots.txt` en `sitemap.xml` staan er al klaar voor. Die blokkeren de
      besloten schermen expres níét: ze dragen zelf een `noindex`, en die regel
      kan een zoekmachine alleen lezen als hij de pagina mag ophalen.

- [ ] **Adressen in `robots.txt` en `sitemap.xml`.** Beide wijzen nu naar
      `picknicken.github.io`. Komt er een eigen domeinnaam, dan moeten ze mee.

- [ ] **Algemene voorwaarden en privacyverklaring laten nakijken.** Ze staan er
      (`/voorwaarden/` en `/privacy/`, gelinkt vanuit elke voettekst), maar het
      zijn concepten met gaten erin — dat zegt de pagina zelf ook. Het gat dat er
      het meest toe doet is de keuze tussen AVC 2002 en CMR: dat bepaalt waar je
      aansprakelijk voor bent als er lading beschadigt. Zonder die keuze ben je
      onbeperkt aansprakelijk. Laat ze nakijken door iemand die er verstand van
      heeft voordat de site live gaat.

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

`/factuur/` toont één factuur in de opmaak van de mal van Schaap Express Transport, klaar
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

Drie tabbladen, met een teller erop zodat je in één blik ziet waar iets ligt.

**Ritten** — de dag die je rijdt.

- Bovenaan het aantal ritten, hoeveel er nog openstaan, de kilometers en de omzet
  van die dag. Met pijltjes blader je naar gisteren of morgen.
- **Status omzetten.** *Onderweg* legt meteen het vertrektijdstip vast, zodat je
  achteraf ziet hoe lang een rit werkelijk duurde.
- **Route starten.** Bij een geplande rit wijst de knop naar het ophaaladres, bij
  een rit die onderweg is naar het afleveradres. Opent Google Maps op de telefoon,
  zonder sleutel of account.
- **Laten tekenen.** De ontvanger zet zijn handtekening op je scherm en typt zijn
  naam. Die gaan als afleverbewijs bij de rit in Airtable, en de rit springt op
  *Uitgevoerd* — waarmee de conceptfactuur zichzelf aanmaakt.

**Aanvragen** — wat er via de site binnenkomt en nog niet is afgehandeld.

- Alles wat de bezoeker invulde: route, zending, colli, gewicht, de
  prijsindicatie die hij te zien kreeg.
- **Aannemen** zet het vinkje *Omzetten naar opdracht* om; de automatisering in
  Airtable maakt de opdracht. Het portaal doet dat werk bewust niet zelf over —
  twee plekken die hetzelfde doen lopen vroeg of laat uiteen.
- **Afwijzen**, en knoppen om te bellen of te mailen.
- Het soort transport heeft een eigen kleur, zodat een directe spoed tussen
  twintig regels uitspringt.

**Planning** — opdrachten waar nog geen rit bij staat.

- **Inplannen** maakt de rit, met de gewenste datum van de klant al ingevuld, en
  neemt klant, adressen, soort transport en opmerkingen over.
- **Klant koppelen** bij een opdracht zonder klant: kies een bestaande, of maak
  er een aan met naam, adres, telefoon, e-mail en betalingstermijn. De klant gaat
  meteen mee naar de ritten die er al onder hangen — anders staat de opdracht wel
  op naam en de rit niet, en komt er straks een factuur zonder klant uit.

Dat inplannen was de ontbrekende schakel. Een aanvraag werd een opdracht, maar
niets maakte daar een rit van — en het portaal toont ritten. Een aangenomen
aanvraag leek daardoor te verdwijnen.

Twee dingen die bewust zo zijn:

**Het adres van de Worker hoeft niet in de code.** Laat `CONFIG.portaalUrl` in
`assets/portaal.js` leeg, dan vraagt het inlogscherm er zelf om en onthoudt de
telefoon het. Dat scheelt na het uitrollen een wijziging, een commit en een push
— stappen waar het makkelijk misgaat en die niets opleveren. Vul je het veld wel
in, dan gaat dat voor en verdwijnt de vraag uit het inlogscherm.

Het adres blijft staan als je op *Sluiten* drukt; alleen de code raak je kwijt.
Anders zou je bij elke keer sluiten die hele `workers.dev`-URL opnieuw moeten
overtypen.

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

### Een rit buiten de website om

Werk dat telefonisch binnenkomt heeft geen aanvraag en geen opdracht. Onder
*Planning* staat daarom bovenaan **+ Rit buiten de website om**: datum, tijd,
soort rit, de twee adressen, kilometers, stops, tijdvak en eventueel meteen de
klant. Daarna loopt hij precies dezelfde weg als elke andere rit — dezelfde
prijsformule, dezelfde bevestigingsmail aan de klant, en dezelfde factuur zodra
je hem op *Uitgevoerd* zet.

De klant mag je overslaan; dan staat de rit met een waarschuwing in je lijst en
koppel je hem later op de ritkaart. Zonder klant komt er geen factuur uit.

De vier soorten rit staan als vaste lijst in de Worker. Een verzonnen naam zou
in Airtable een nieuwe keuze aanmaken die stilletjes geen tarief heeft —
dezelfde reden waarom het tijdvak een keuzelijst is en geen tekstveld.

### Het aanvraagformulier bij een rit naar het buitenland

Binnenlands is postcode en huisnummer genoeg: daaruit schat de site de afstand en
dus de prijs. Naar België en Duitsland kan dat niet — die schatting werkt op
Nederlandse postcodes, en een Belgische postcode van vier cijfers zou daar een
Nederlandse regio uit halen. Een verzonnen afstand is erger dan geen, dus voor
het buitenland wordt er niets geschat.

Kies je *Internationaal transport*, dan schakelt het tweede blok om: het vraagt
om het volledige adres, de voorbeelden in de velden worden buitenlands, en er
staat een regel onder waarom. Een adres dat te weinig zegt (`2000 Antwerpen`)
wordt geweigerd zodra je het veld verlaat en opnieuw bij het versturen. De grens
is ruim gehouden — een huisnummer of postcode en minstens drie woorden — want een
formulier dat te streng is kost je de aanvraag.

Binnenlands blijft alles zoals het was: `3011 AA 12` komt er gewoon door.

### Het menu op een telefoon

Onder 1040px klapt de menubalk in. De knop rechtsboven draagt het woord **Menu**
naast het icoon en wordt **Sluiten** met een kruisje zodra het openstaat — een
rijtje streepjes zonder woord erbij is voor veel mensen een raadsel. Het menu
sluit ook met Escape of door ernaast te tikken.

In het opengeklapte menu staat elk item op een eigen regel met een streep
ertussen en een pijltje rechts, zodat het leest als een lijst om uit te kiezen.
De pagina waar je bent krijgt een amberkleurige balk en het label *Je bent hier*
in plaats van dat pijltje. Inloggen staat onderaan als volle knop.

Onder 360px (een oude iPhone SE) wordt de bovenbalk krap: daar staan wat
kleinere marges en een iets kleinere bedrijfsnaam, zodat alles op één regel past
en er niets weg hoeft.

### Het portaal op je beginscherm zetten

Het chauffeursportaal is te installeren als app. Op een iPhone: open
`/portaal/` in Safari, tik onderin op **Deel** en daarna op **Zet op
beginscherm**. Op Android biedt Chrome het zelf aan.

Daarna staat er een pictogram tussen je andere apps, opent het scherm
schermvullend zonder adresbalk, en ben je meteen binnen omdat de toegangscode al
op het toestel staat. Het is dezelfde pagina, alleen anders verpakt: geen App
Store, geen ontwikkelaarsaccount, en niets aparts om te onderhouden.

Wat het mogelijk maakt: `portaal/manifest.webmanifest`, een `apple-touch-icon`,
en de vier `meta`-regels in de kop van `portaal/index.html`. De pictogrammen
staan in `assets/app-icoon-*.png` en komen uit `assets/favicon-bron.html`; die
met `-masker` in de naam heeft extra ruimte rondom omdat Android een pictogram
bijsnijdt tot een cirkel.

In de browser staat er bovenaan eenmalig een tip die uitlegt hoe je hem
installeert, want iOS vraagt daar zelf niet om. Die verschijnt niet in de
geinstalleerde app en verdwijnt voorgoed na een tik op *Later*.

Twee dingen die het **niet** is: er is geen offline modus, en pushmeldingen op
je telefoon zitten er niet in. Dat laatste kan op een geinstalleerde webapp
(iOS 16.4 en hoger) maar is apart werk; nu gaat het spoedseintje per mail.

### Een appje omzetten in een rit

In het formulier *Rit buiten de website om* staat een vak waarin je het bericht
van een klant plakt. De tussenlaag leest eruit wat erin staat en vult de velden:
datum, tijd, soort rit, de twee adressen, de klant en een opmerking. Wat het
model niet zeker wist komt eronder als lijstje te staan, want dat is precies wat
jij moet nalopen.

Het is een **voorstel**, geen rit. Er wordt niets aangemaakt tot je onderaan op
*Rit aanmaken* drukt, en velden die jij al hebt ingevuld blijven staan.

Twee dingen doet het met opzet niet. Het rekent geen prijs uit — dat doet
Airtable, met dezelfde formule als de website, en die moet elke keer hetzelfde
uitkomen. En het verzint geen adres dat er niet staat: ontbreekt het huisnummer,
dan zie je dat in het lijstje eronder.

**Aanzetten.** Dit is het enige onderdeel dat geld kost per keer. Zet er een
sleutel van de Anthropic-API op:

```sh
cd worker-portaal
wrangler secret put ANTHROPIC_API_KEY
```

Zonder die sleutel antwoordt de tussenlaag met 501 en blijft het vak verborgen —
een knop die niets doet is erger dan geen knop. Het portaal hoort dat via het
veld `kan.leesbericht` in het overzicht.

Dit is ook de reden dat `worker-portaal/` een `package.json` heeft en de
aanvraag-Worker niet: de Anthropic-SDK is de enige afhankelijkheid van dit
project. De GitHub Action draait er een `npm install` voor; wrangler bundelt hem
mee. `node_modules/` staat in `.gitignore`.

### Inspreken in plaats van typen

Naast het plakvak en onder de opmerking staat een knop **Inspreken**, die de
spraakherkenning van de browser gebruikt. Dat kost niets en er gaat geen sleutel
aan te pas. Kan je browser het niet, dan blijft de knop weg.

Op een iPhone staat er trouwens ook een microfoontje op het toetsenbord zelf, en
dat werkt in elk veld van dit scherm — probeer dat eerst, misschien is het al
genoeg.

## Het klantportaal

`/klant/` is de kant die je klanten zien. Elke klant krijgt een eigen code en
ziet daarmee **alleen zijn eigen** zendingen en facturen: status, route, wie er
getekend heeft en wanneer, wat het kost, wat er nog openstaat, en de PDF van de
factuur.

Dezelfde Worker bedient beide portalen. Welke van de twee je krijgt hangt af van
de code die meekomt, en die splitsing zit helemaal bovenin: klantacties staan in
een eigen functie met een eigen lijst, dus een klantcode kan een chauffeursactie
niet eens bereiken. Dat is met opzet zo gebouwd en niet met een reeks controles
per actie — dan vergeet je er een.

**Wat een klant nooit te zien krijgt**, en dat wordt afgedwongen in de Worker en
niet op het scherm: `Brandstofkosten`, `Tol en parkeren`, `Overige ritkosten`,
`Totale ritkosten`, `Winst` en `Winst per km`. Die velden worden niet
meegestuurd. Verbergen in de pagina zou niet genoeg zijn — wie het antwoord van
de server bekijkt, ziet dan alsnog alles.

Ook niet zichtbaar: interne ritnamen, opmerkingen bij een rit, telefoonnummers,
record-ids, en uiteraard alles wat aan een andere klant hangt. Dat laatste zit
structureel dicht: het portaal vraagt niet "geef alle ritten en filter" maar
"geef de ritten die aan deze klant hangen".

**Zelf afzeggen.** Bij een zending die nog op *Gepland* staat, staat een knop
*Deze zending annuleren*. Twee handelingen: eerst de knop, dan een bevestiging
met ruimte voor een reden — één verkeerde tik op een telefoon mag geen zending
afzeggen. De rit gaat daarna in Airtable op *Geannuleerd*, met het moment en de
reden erbij, en jij krijgt er meteen een mail over.

Zodra een rit *Onderweg* is, verdwijnt de knop, en probeert iemand het toch
buiten de pagina om, dan weigert de Worker het met de boodschap dat er gebeld
moet worden. Dat is met opzet: vanaf dat moment kost afzeggen geld (artikel 9
van de voorwaarden) en hoort daar een gesprek bij, geen knop.

Om die knop aan een zending te kunnen hangen zonder record-ids weg te geven,
krijgt elke zending een vaste, betekenisloze sleutel van zestien tekens. De
Worker rekent hem terug door de sleutels van de zendingen van díe klant uit te
rekenen en te kijken welke past. Een sleutel opent dus niets, en de zending van
een ander is onbereikbaar — die staat niet in de lijst waar het zoeken begint.

**Een code uitdelen.** Maak je een klant aan via het chauffeursportaal, dan komt
er vanzelf een code op het veld `Portaalcode`. In de interface *Administratie* →
*Klanten* staat daarnaast `Portaallink`: die link mag je doorsturen, de code zit
erin en de klant hoeft niets over te typen. Behandel hem als een wachtwoord.

Intrekken doe je door dat veld leeg te maken of te wijzigen; de oude code werkt
dan meteen niet meer.

Het portaal onthoudt de code op het apparaat van de klant, en haalt hem uit de
adresbalk zodra de pagina open is — zodat hij niet in schermfoto's of in de
geschiedenis van een gedeelde computer blijft staan.

## De algemene voorwaarden

Voorwaarden binden een klant alleen als hij ze **vóór of bij** het sluiten van de
overeenkomst krijgt aangeboden, in een vorm die hij kan bewaren. Een link in de
voettekst is dat niet: dan kan hij de bepalingen achteraf laten vernietigen, en
dan valt ook artikel 8 weg — precies de bepaling die de aansprakelijkheid
beperkt tot €3,40 per kilo. Daarom hangt er een ketting aan vast.

**Op de site.** Boven de voorwaarden staat de versiedatum en een knop *Download
als PDF*. Op het aanvraagformulier staat een verplicht vinkje met een link naar
de pagina, naar de PDF en naar de privacyverklaring, en de versie erbij.

**In de tussenlaag.** `worker/aanvragen.js` controleert het akkoord nog een keer:
wat er in een browser gebeurt is geen bewijs. Ontbreekt het akkoord, dan komt de
aanvraag niet binnen. De versie moet gelijk zijn aan `VOORWAARDEN_VERSIE` in de
Worker, zodat een oude pagina uit de cache van een browser geen akkoord kan
opleveren op een tekst die niet meer geldt. De Worker schrijft zelf
`Voorwaarden geaccepteerd` in Airtable, met **zijn eigen** tijdstempel.

**In de bevestigingsmail.** Die noemt de geaccepteerde versie en stuurt de PDF-link
mee. Dat is het aanbod op papier; het vinkje was de aanvaarding.

### De voorwaarden wijzigen

Vier handelingen, en ze horen bij elkaar. Sla je er één over, dan weigert de
tussenlaag elke aanvraag met "de voorwaarden zijn gewijzigd".

1. Pas de tekst aan in `voorwaarden/index.html` en zet de nieuwe datum in
   `<span id="vwVersie">`.
2. Zet dezelfde datum in `CONFIG.voorwaardenVersie` in `assets/site.js`.
3. Zet dezelfde datum in `VOORWAARDEN_VERSIE` in `worker/aanvragen.js`, en rol
   die Worker opnieuw uit.
4. Maak de PDF opnieuw:

   ```sh
   python3 -m http.server 8080          # in een tweede venster
   node scripts/maak-voorwaarden-pdf.mjs http://127.0.0.1:8080
   ```

   Staat Playwright niet in dit project maar globaal, wijs er dan naar met
   `PLAYWRIGHT_PAD=/pad/naar/playwright/index.js`.

Oude akkoorden blijven staan zoals ze waren: in `Voorwaarden geaccepteerd` staat
per aanvraag welke versie gold. Dat is precies waarvoor dat veld er is.

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

## De Workers uitrollen

`.github/workflows/worker-uitrollen.yml` rolt allebei de Workers uit zodra er op
`main` iets aan verandert. Eenmalig instellen: GitHub → *Settings* → *Secrets and
variables* → *Actions* → *New repository secret*, naam `CLOUDFLARE_API_TOKEN`,
waarde een Cloudflare-sleutel met de template *Edit Cloudflare Workers*.

Dat bestaat om één reden: uitrollen ging steeds mis op het met de hand plakken
van die sleutel in een terminal. Eén spatie of regeleinde erin en wrangler krijgt
een halve sleutel, met een foutmelding die daar niets over zegt. Nu staat hij
eenmalig in de repository-instellingen en raakt niemand hem meer aan.

Beide Workers worden uitgerold, ook als er maar één veranderd is. Uitrollen van
ongewijzigde code doet niets, en zo staat wat er draait altijd gelijk aan wat er
in git staat — precies wat er eerder misging toen er met de hand een regel uit de
Worker sneuvelde.

Met de hand kan ook, vanuit `worker/` of `worker-portaal/`:

```sh
npx wrangler deploy
```

## Publiceren

GitHub Pages staat op branch `main`, map `/` (root). `.nojekyll` zorgt dat de
bestanden ongewijzigd geserveerd worden in plaats van door Jekyll te gaan.

Aanpassing doorvoeren: bewerken, committen, pushen. Pages publiceert de nieuwe
versie binnen ongeveer een minuut.

### Het adres: schaaplogistics.nl

De site staat op `https://schaaplogistics.nl/`. Het domein is geregistreerd bij
Strato; de DNS wijst met A- en AAAA-records naar GitHub Pages, en `www` gaat via
een CNAME naar `picknicken.github.io`. Het bestand `CNAME` in de root vertelt
GitHub welk domein bij deze repo hoort — weghalen betekent terug naar het oude
adres, dus laat hem staan.

Het oude `picknicken.github.io/Schaap-Logistics-Website/...` stuurt door naar het
nieuwe adres, met pad en zoekterm en al. Links die al de deur uit zijn (een
uitnodiging voor het klantportaal, een factuurlink) blijven dus werken.

Twee dingen om te weten:

- **Er staat één A- en één AAAA-record.** GitHub geeft er vier van elk; met
  alleen de eerste werkt het, maar heeft dat ene adres een storing, dan is de
  site onbereikbaar. De andere zes er alsnog bij zetten kost niets:
  `185.199.109.153`, `185.199.110.153`, `185.199.111.153` en
  `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
- **`Enforce HTTPS`** staat in de repo-instellingen onder Pages. Die kun je pas
  aanzetten als GitHub een certificaat heeft aangemaakt, wat een kwartier tot
  een paar uur duurt.

Blijf bij Strato van de MX- en TXT-records af: daar hangt de e-mail aan.

Deze plekken dragen het adres en moeten mee als het ooit weer verandert:
`CNAME`, `robots.txt`, `sitemap.xml`, `TOEGESTANE_ORIGIN` in beide
`wrangler.toml`-bestanden, de formules `Factuurlink` op `Facturen` en
`Portaallink` op `Klanten`, en de links in de tekst van de
e-mailautomatiseringen.
