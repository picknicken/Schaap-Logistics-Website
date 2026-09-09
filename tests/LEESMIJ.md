# Faaltests

Deze vier bestanden testen niet of iets werkt. Ze proberen het stuk te krijgen.

Dat is een ander soort proef dan de gewone tests, en hij hoort er apart te
staan. Een gewone test vraagt: doet de knop wat de knop moet doen. Deze vragen:
wat gebeurt er als iemand iets instuurt wat niemand hoort in te sturen — een
lege waarde, een tekst van honderdduizend tekens, een negatief bedrag, een
stukje script, een adres dat `javascript:` heet, een verzoek van vier tekens.

Ze zijn geschreven op 9 september 2026 en hebben toen zestien echte fouten
gevonden. Wat er is dichtgetimmerd staat in de commit die ze toevoegde.

## Draaien

Twee zonder browser — die roepen de Workers rechtstreeks aan met een
nagebootste Airtable:

```sh
cd tests
node faal-aanvragen.mjs      # het openbare aanvraagadres
node faal-portaal.mjs        # het portaal: rollen, grenzen, lekken
node faal-zelfde-som.mjs     # rekent de prijs op de server na tegen de browser
```

Twee met een browser. Zet eerst de site op een adres neer — een gewone
bestandsserver is genoeg, deze proeven zetten de tussenlaag zelf klaar:

```sh
python3 -m http.server 8097 --bind 127.0.0.1     # in een tweede venster
cd tests
node faal-site.mjs           # de factuurpagina en de rekenmachine
node faal-portalen.mjs       # beide portalen met vijandige gegevens
```

Staat Playwright niet op de standaardplek, wijs er dan naar met
`PLAYWRIGHT_PAD=/pad/naar/playwright/index.js`. Draait de site op een ander
adres, dan `SITE_ADRES=http://127.0.0.1:8080`.

Elk bestand eindigt met `alles goed` of met het aantal fouten, en geeft een
foutcode terug als er iets misgaat. Zo kunnen ze later in een GitHub Action.

## Waar ze naar kijken

**`faal-aanvragen.mjs`** — het enige adres van dit hele bouwwerk dat voor
iedereen open staat. Herkomst, methode, rommel in plaats van JSON, de
voorwaarden, wat er wel en niet naar Airtable doorgaat, lengte en type van elke
waarde, de foto's, de rem, de honeypot, en wat er gebeurt als Airtable dwarsligt.

**`faal-zelfde-som.mjs`** — de prijs staat op twee plekken: `assets/site.js`
toont hem, `worker/aanvragen.js` bewaart hem. Deze proef rekent ruim
zestienhonderd combinaties van dienst, tijdvak, stops en postcodes aan beide
kanten na. Wijkt er één cent af, dan valt hij om. Draai hem altijd als je een
tarief wijzigt.

**`faal-portaal.mjs`** — drie soorten bezoekers en de vraag wat elk van de drie
te zien of te doen krijgt dat niet voor hem is. Formule-injectie in de codes,
de grens tussen chauffeur en eigenaar, de grens tussen klant en de rest,
grenswaarden op alle getallen, en pushmeldingen als achterdeur.

**`faal-site.mjs`** — de factuurpagina krijgt alles uit de adresregel, dus
iedereen die een link kan maken bepaalt wat erop staat. Script, onzinbedragen,
en of subtotaal, btw en totaal altijd op elkaar aansluiten.

**`faal-portalen.mjs`** — hier doen we alsof de tussenlaag is overgenomen of
gewoon kapot is. Script in elk veld, `javascript:`-adressen, velden die er niet
zijn, een antwoord dat geen JSON is, en een geheugen van de telefoon vol rommel.

## Wat ze niet doen

Ze raken Airtable niet aan en ze sturen geen echt verkeer de deur uit: de
Workers krijgen een nagebootste Airtable, en de portalen krijgen een
nagebootste tussenlaag. Je kunt ze dus zo vaak draaien als je wilt.

Ze zeggen ook niets over de gewone werking. Dat is wat de andere proeven doen;
groen hier betekent alleen dat het niet stukging, niet dat het klopt.
