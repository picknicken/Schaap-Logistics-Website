# Faaltests

Deze acht bestanden testen niet of iets werkt. Ze proberen het stuk te krijgen.

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
node faal-zelfde-som-airtable.mjs   # en tegen de formule in Airtable
node faal-klantplicht.mjs    # geen factuur zonder klant, en de dagmeldingen
```

`faal-portaal.mjs` laadt de portaal-Worker, en die importeert de Anthropic-SDK
voor het lezen van een appje. Staat `worker-portaal/node_modules` er nog niet,
draai dan eerst eenmalig `npm install` in die map.

Twee met een browser. Zet eerst de site op een adres neer — een gewone
bestandsserver is genoeg, deze proeven zetten de tussenlaag zelf klaar:

```sh
python3 -m http.server 8097 --bind 127.0.0.1     # in een tweede venster
cd tests
node faal-site.mjs           # de factuurpagina en de rekenmachine
node faal-portalen.mjs       # beide portalen met vijandige gegevens
node faal-push.mjs           # de sleutelpagina en de hele pushketen
```

Staat Playwright niet op de standaardplek, wijs er dan naar met
`PLAYWRIGHT_PAD=/pad/naar/playwright/index.js`. Draait de site op een ander
adres, dan `SITE_ADRES=http://127.0.0.1:8080`.

Elk bestand eindigt met `alles goed` of met het aantal fouten, en geeft een
foutcode terug als er iets misgaat.

Ze draaien ook vanzelf: `.github/workflows/faaltests.yml` voert ze alle acht uit
bij elke push naar `main` en bij elke pull request. Die workflow staat los van
`worker-uitrollen.yml` omdat die laatste alleen mag afgaan als er werkelijk
iets aan een Worker verandert, en `on:` in GitHub Actions per workflow geldt
en niet per taak.

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

**`faal-zelfde-som-airtable.mjs`** — dezelfde vraag, maar voor de derde kopie:
de formule `Automatisch totaal excl. BTW` op de tabel Ritten, die bepaalt wat er
werkelijk gefactureerd wordt. Dat is de gevaarlijkste van de drie — belooft de
site €287 en factureert Airtable €310, dan merkt de klant het en jij niet.

Hij draait in twee lagen. Zonder sleutel toetst hij een transcriptie van de
formule, die hier in het bestand staat, over ruim duizend combinaties tegen
`bereken()` uit site.js. Dat betrapt een tarief dat je op de site wijzigt en in
Airtable vergeet. Wat die laag per definitie niet kan zien is dat iemand de
formule in Airtable zélf heeft aangepast — dan verandert de transcriptie immers
niet mee. Daarvoor is de tweede laag:

```sh
AIRTABLE_TOKEN=pat... node faal-zelfde-som-airtable.mjs
```

Dan haalt hij de werkelijke formule uit de base en controleert of de bedragen
die site.js noemt er letterlijk in staan. Draai dat na elke tariefwijziging. De
sleutel hoort in je terminal en nergens anders — niet in dit bestand, niet in de
workflow, niet in een appje.

**`faal-portaal.mjs`** — drie soorten bezoekers en de vraag wat elk van de drie
te zien of te doen krijgt dat niet voor hem is. Formule-injectie in de codes,
de grens tussen chauffeur en eigenaar, de grens tussen klant en de rest,
grenswaarden op alle getallen, en pushmeldingen als achterdeur.

**`faal-klantplicht.mjs`** — een factuur zonder klant is niet te versturen en
niet te innen: naam, adres, btw-nummer en debiteurnummer komen alle vier via de
koppeling uit Klanten. Deze proef bewaakt waar die rem wel en niet zit. Wel op
het knopje Uitgevoerd, want daar sta je achter je bureau. Niet op het aftekenen,
want daar sta je bij de klant op de stoep en is je bewijs van aflevering meer
waard dan een factuur die een dag later komt. En omdat een rem die werk laat
liggen alleen maar een ander gat maakt: koppel je later alsnog een klant aan een
afgeronde rit, dan hoort die factuur er alsnog te komen — precies één keer.

Hier staan ook de meldingen in: het bericht over facturen die te lang openstaan
(dat maar één keer per factuur mag komen), het ochtendbericht (dat stil hoort te
blijven als er niets te melden is), en het wijzigverzoek.

Dat laatste is het enige waarmee een klant iets aan een lopende rit kan
veranderen — en juist daarom verandert het niets. Een extra stop kost
vijfentwintig euro en een ander afleveradres verandert de kilometers; kon de
klant dat zelf zetten, dan bepaalt hij je factuur. De proef controleert dus niet
alleen dat het verzoek aankomt, maar vooral dat de rit erna nog exact hetzelfde
is: dezelfde kilometers, geen stop erbij, hetzelfde adres, dezelfde status.
Verder de grenzen die een portaal voor buitenstaanders nodig heeft — alleen je
eigen zending, alleen zolang hij gepland staat, één verzoek tegelijk, en een
verzonnen soort dat wordt teruggebracht in plaats van doorgegeven aan Airtable.

**`faal-site.mjs`** — de factuurpagina krijgt alles uit de adresregel, dus
iedereen die een link kan maken bepaalt wat erop staat. Script, onzinbedragen,
en of subtotaal, btw en totaal altijd op elkaar aansluiten.

**`faal-push.mjs`** — de meldingen, van `scripts/pushsleutels.html` tot aan de
pushdienst. Die sleutelpagina is het enige stuk van dit bouwwerk dat één keer
met de hand wordt bediend, en als hij een sleutel in het verkeerde formaat
afgeeft merk je dat aan niets: de pushdienst neemt het pakketje netjes aan met
een 201 en de telefoon gooit het stilletjes weg. Deze proef maakt de sleutels in
een echte browser, voert ze aan de echte Worker, en maakt het versleutelde
pakketje weer open zoals een telefoon dat doet — met een eigen uitwerking van
RFC 8291, niet met de code van de Worker, want anders bewijs je alleen dat de
Worker het eens is met zichzelf. Verder: de handtekening op het VAPID-bewijs,
een verlopen abonnement dat de rest niet meesleept, een pushdienst die plat
ligt, en de vier manieren waarop je de sleutel verkeerd kunt plakken.

**`faal-portalen.mjs`** — hier doen we alsof de tussenlaag is overgenomen of
gewoon kapot is. Script in elk veld, `javascript:`-adressen, velden die er niet
zijn, een antwoord dat geen JSON is, en een geheugen van de telefoon vol rommel.

## Wat ze niet doen

Ze raken Airtable niet aan en ze sturen geen echt verkeer de deur uit: de
Workers krijgen een nagebootste Airtable, en de portalen krijgen een
nagebootste tussenlaag. Je kunt ze dus zo vaak draaien als je wilt.

En één ding in het bijzonder: `faal-push.mjs` bewijst niet dat er een melding
op een telefoon verschijnt. Dat kan geen enkele proef hier. Het bericht gaat
correct ondertekend en versleuteld de deur uit en is met de sleutel van de
telefoon weer open te maken — daarmee houdt het op. Of Apple of Google hem
doorzet, of iOS hem toont, en of de telefoon het portaal überhaupt vanaf het
beginscherm heeft geopend: dat zie je alleen door op **Proefmelding** te
drukken en te kijken of het ding piept.

Ze zeggen ook niets over de gewone werking. Dat is wat de andere proeven doen;
groen hier betekent alleen dat het niet stukging, niet dat het klopt.
