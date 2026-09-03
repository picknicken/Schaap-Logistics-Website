# Aanvragen naar Airtable

**Deze koppeling staat live sinds 2 september 2026.** Een aanvraag via het
formulier komt binnen in de tabel `Website-aanvragen`. Deze notitie beschrijft
hoe het in elkaar zit en wat er bij het installeren misging, zodat je het kunt
naslaan als er iets hapert.

## De hoofdregel

**De Airtable-token mag niet in `assets/site.js`.** De site is statisch: alles
wat in dat bestand staat is voor iedere bezoeker leesbaar. Met zo'n token kan een
willekeurige bezoeker je base uitlezen, aanpassen of leegmaken.

De pagina praat daarom nooit rechtstreeks met Airtable, maar met een eigen
tussenlaag die de token bewaart:

```
formulier op de site  ->  Cloudflare Worker  ->  Airtable API
```

Die Worker staat in [`worker/aanvragen.js`](worker/aanvragen.js) en draait op
`https://schaap-aanvragen.rt5twh6n7h.workers.dev`.

## Wat er al klaar staat

**De tabel.** In de base *Schaap Logistics* staat `Website-aanvragen`, met
kolomnamen die exact overeenkomen met wat de site verstuurt.

| | |
| --- | --- |
| Base | `appLUKMbBBkJUagFs` |
| Tabel | `tblhvOATDAfvBmabA` |

De velden `Datum`, `Geschatte afstand km` en `Prijsindicatie excl btw` hebben een
echt datum-, getal- en valutatype. `Ophaaltijd`, `Aantal colli` en `Gewicht` zijn
bewust tekstvelden: de site stuurt daar vrije tekst ("14:30", "ca. 30 kg").

**De Worker.** Neemt de aanvraag aan, filtert alles weg wat niet in de
kolomlijst staat, laat lege waarden weg (een lege string naar een keuzeveld is
een fout in Airtable), maakt het record aan en hangt daarna pas de foto's eraan.

## Installeren

### 1. Een Airtable-token maken

Op [airtable.com/create/tokens](https://airtable.com/create/tokens) een
persoonlijke toegangstoken aanmaken met:

- scope `data.records:write`
- toegang tot alleen de base *Schaap Logistics*

Kopieer de token; hij is daarna niet meer op te vragen. Plak hem nergens anders
dan in stap 3.

### 2. Cloudflare

Een gratis account op [cloudflare.com](https://dash.cloudflare.com/sign-up).
Verder niets instellen; de Worker maakt zichzelf aan bij het uitrollen.

### 3. De Worker uitrollen

```sh
cd worker
npx wrangler login
npx wrangler secret put AIRTABLE_TOKEN     # token plakken
npx wrangler deploy
```

`deploy` geeft een URL terug, iets als
`https://schaap-aanvragen.<jouwnaam>.workers.dev`.

De base- en tabel-ID en de toegestane herkomst staan al in `wrangler.toml`. De
token staat als secret apart en komt niet in git.

### 4. De site omzetten

In `assets/site.js`, in `CONFIG`:

```js
webhookUrl: 'https://schaap-aanvragen.<jouwnaam>.workers.dev',
```

Committen en pushen. Leeg laten betekent `mailto:`; ingevuld betekent Airtable.
Meer is er niet om te zetten.

### 5. Controleren

Vul het formulier op `/aanvragen/` in met een testaanvraag. Er hoort binnen een
paar seconden een record in `Website-aanvragen` te staan, met `Status` op
*Nieuw*. Gaat het mis, dan zie je de reden in de logs:

```sh
npx wrangler tail
```

## Wat de Worker verstuurt

De pagina POST't een JSON-object met drie sleutels:

```json
{
  "velden": { "Dienst": "Spoedtransport", "Ophaallocatie": "...", "...": "..." },
  "fotos":  [ { "naam": "zending.jpg", "type": "image/jpeg", "data": "data:image/jpeg;base64,..." } ],
  "controle": ""
}
```

`controle` is een verborgen veld in het formulier dat een bezoeker niet ziet en
dus leeg laat. Is het ingevuld, dan komt de aanvraag van een bot; de Worker geeft
dan netjes succes terug en schrijft niets weg.

Lukt het versturen niet, dan blijft het formulier ingevuld staan en krijgt de
bezoeker de melding dat hij kan bellen. Er is bewust **geen** automatische
terugval op `mailto:` — die zou de aanvraag stilletjes in een tweede kanaal
laten belanden.

## Aandachtspunten

- **Foto's.** Die gaan mee als base64 en worden ná het record als bijlage
  toegevoegd. Mislukt dat, dan blijft de aanvraag gewoon staan en zie je de
  bestandsnamen in het veld *Foto's meegestuurd*, zodat je ze kunt opvragen. Een
  fotoprobleem mag nooit een aanvraag kosten.

  Het uploaden gaat via het `uploadAttachment`-endpoint van Airtable, dat base64
  rechtstreeks aanneemt. **Dit is het enige onderdeel dat ik niet vooraf heb
  kunnen verifiëren** — airtable.com was niet bereikbaar vanuit de omgeving waarin
  dit gebouwd is. Werkt het niet, dan zie je dat in `wrangler tail` en is het
  alternatief: de foto's naar eigen opslag (Cloudflare R2) schrijven en Airtable
  de URL geven.

- **Grootte.** De site staat 5 foto's van maximaal 10 MB toe; als base64 loopt een
  aanvraag dan tegen de 65 MB aan. De Worker weigert alles boven 30 MB en slaat
  losse foto's boven 5 MB over. Verlaag `CONFIG.foto.maxMb` naar 5, of laat de
  foto's in de browser verkleinen vóór verzending — dat scheelt een factor tien.

- **Bevestigingsmail.** Bij `mailto:` ziet de aanvrager zijn eigen bericht in zijn
  verzonden items. Via de Worker krijgt hij niets. Wil je een bevestiging, dan
  moet de Worker die versturen, via bijvoorbeeld Resend of Postmark. Nog niet
  ingebouwd.

- **Van aanvraag naar opdracht.** `Website-aanvragen` is een postbus, geen
  administratie. Accepteer je een aanvraag, zet hem dan om in een record in
  `Opdrachten` en leg de link vast in het veld *Opdracht*.

## Wat er bij het installeren misging

Twee dingen die je bij een volgende wijziging tijd besparen.

**Een half geplakte Worker verliest stilletjes één veld.** Bovenin de Worker
staat de lijst met kolommen die doorgelaten worden. Bij het plakken op een
telefoon sneuvelde daar `'Afleverlocatie'` uit, en het gevolg was dat aanvragen
gewoon binnenkwamen — alleen zonder afleveradres, terwijl de afleverpostcode er
wel stond. Geen foutmelding, nergens. Wijzig je de Worker, plak dan altijd het
hele bestand via de kopieerknop op GitHub, nooit met de hand geselecteerd, en
controleer daarna één aanvraag veld voor veld.

**`workers.dev` wordt op veel bedrijfsnetwerken geblokkeerd.** Dat domein wordt
veel voor rommel gebruikt, dus filters gooien het er standaard uit. Op een
werk-pc geeft het formulier dan "Versturen is niet gelukt (Failed to fetch)",
terwijl er niets mis is. Dit raakt ook klanten: die zitten zelf ook achter zulke
filters. De oplossing is de Worker op een eigen domeinnaam zetten
(`aanvragen.schaaplogistics.nl`) zodra dat domein er is — zie hieronder.

## Nog te doen

- **Eigen domeinnaam.** Zet de Worker daarna op een subdomein in plaats van op
  `workers.dev`, zodat bedrijfsnetwerken hem niet blokkeren. In het
  Cloudflare-dashboard onder Domains & Routes.
- **Een gelezen antwoordadres op de bevestigingsmail.** Nu is het een
  noreply-bericht en lopen correcties via het contactformulier; dat is een
  omweg voor een klant die haast heeft.
- **Foto's** zijn nog niet met een echte aanvraag getest.

## De bevestigingsmail

De aanvrager krijgt een ontvangstbevestiging. Dat gebeurt niet in de Worker maar
met een automatisering in Airtable zelf: **Bevestigingsmail naar de aanvrager**
(`wflExituB7crLEIYT`). Geen extra dienst, geen sleutels, en geen wijziging aan de
Worker nodig.

De automatisering start zodra er een rij in `Website-aanvragen` bijkomt, en stuurt
naar het adres in het veld `E-mail`. De aanvraaggegevens worden door Airtable zelf
opgemaakt, zodat bedragen als `€ 213,50` en datums in de Nederlandse notatie
verschijnen in plaats van als ruwe waarden.

Twee dingen om te weten:

- **Het is bewust een noreply-bericht.** Er staat geen antwoordadres in, dus
  antwoorden komen bij Airtable terecht en worden niet gelezen. De mail zegt dat
  zelf en verwijst voor correcties naar het contactformulier op de site. Een
  eigen `noreply@`-adres heeft pas zin met een eigen domeinnaam; zonder dat zou
  je verwijzen naar een domein dat je niet beheert. Er staat om dezelfde reden
  nog geen telefoonnummer in de afsluiting: liever geen contactgegevens dan
  verkeerde.
- **Automatiseringen zijn op het gratis Airtable-plan begrensd** op honderd
  uitvoeringen per maand. Dat is één bevestiging per aanvraag; loop je daar
  tegenaan, dan is een betaald plan nodig.

## De base zelf

Twee dingen aan de administratie die los van de website staan maar hier thuishoren,
omdat ze met de tarieven meebewegen.

### De ritprijs staat op drie plekken

De bedragen leven in `CONFIG` in `assets/site.js` (waar de calculator mee rekent),
als tekst op `/tarieven/`, en in de formule `Automatisch totaal excl. BTW` in de
tabel `Ritten` (waar je facturen op gebaseerd worden). Wijzig je een tarief, pas
het dan op alle drie aan — anders factureer je iets anders dan je op je site belooft.

De tabel `Tarieven` is een naslagoverzicht, geen bron: daar iets wijzigen verandert
niets aan je facturen. Er hoort precies één regel per dienst in te staan. Stonden
er ooit twee regels *Standaard – Normaal* en *Standaard – Spoed* in — restanten
van een eerdere naamgeving, met een spoedtarief van €50 in plaats van €75 — dan
zijn die verwijderd; bij internationaal transport hoort geen kilometerprijs te
staan, want dat gaat op offerte.

#### Een factuur terugdraaien: de creditnota

Een factuur die de deur uit is, mag je niet meer aanpassen — ook niet als het
bedrag fout was. Corrigeren doe je met een creditnota, en daarna eventueel een
nieuwe factuur.

Vul op de factuur eerst `Creditreden` in (die tekst leest de klant) en zet dan
het vinkje **Crediteren** aan. De automatisering **Creditfactuur maken**
(`wflTZBUjJxTmM8ubq`) doet de rest: er komt een creditnota bij te staan met een
eigen factuurnummer, hetzelfde bedrag maar negatief, en een verwijzing naar het
nummer van de factuur die wordt teruggedraaid. Die verwijzing is een wettelijke
eis, geen opmaakkeuze. De oorspronkelijke factuur gaat op *Gecrediteerd*, staat
daarmee op nul open, en het vinkje gaat vanzelf weer uit.

De creditnota blijft op *Concept* staan zodat je hem nakijkt. Versturen gaat
daarna net als bij een gewone factuur, met `Factuur versturen` — de mail past
zichzelf aan: geen betaalverzoek, maar de mededeling dat het bedrag wordt
verrekend of teruggestort.

Drie velden op `Facturen` heten *Tegenboeking …*. Die staan er alleen omdat de
taal waarin automatiseringen geschreven zijn zelf niet kan rekenen: ze zetten er
een minteken voor, zodat de automatisering het negatieve bedrag kan overnemen.
Kijk er verder niet naar.

#### Korting geven

Ging er iets mis — te laat aangekomen, niet alles kon in één keer mee — dan haal
je met het veld `Korting` op de rit een bedrag van de prijs af. Er hoort een
`Reden korting` bij: die komt letterlijk op de factuur te staan, als eigen regel
*Korting — te laat aangekomen*. Dat is met opzet zichtbaar en niet stilletjes
een lager totaal: een klant die je tegemoetkomt, moet dat kunnen zien.

De korting gaat er helemaal aan het eind af, ná het minimumtarief en alle
toeslagen, en mag de rit dus onder de €75 brengen. De btw wordt over het
verlaagde bedrag gerekend. Onder nul kan niet: dan wordt het nul.

Invullen doe je in het chauffeursportaal, op de ritkaart onder Doorberekenen,
**voordat** je de rit op *Uitgevoerd* zet — dat is het moment waarop de factuur
wordt gemaakt. Ben je te laat, dan pas je het bedrag op de factuur zelf nog aan.

#### Wat er wel en niet op de factuur mag

Je eigen kosten en de kosten van de klant zijn twee verschillende dingen:

| Veld op `Ritten` | Van wie | Op de factuur? |
| --- | --- | --- |
| `Brandstofkosten`, `Tol en parkeren`, `Overige ritkosten` | jouw kosten, voor je eigen boekhouding | nee |
| `Extra kosten` (in het portaal: *Doorberekenen*) | wat de klant je terugbetaalt | ja, als losse regel *Doorberekende kosten* |

Brandstof zit al in het kilometertarief — dat is precies waar €1,50 tot €2,50 per
kilometer voor bedoeld is. Zet je je brandstof daarnaast ook nog op de factuur,
dan betaalt de klant twee keer voor dezelfde liters. Dekt het kilometertarief je
kosten niet meer, dan hoort het kilometertarief omhoog (op alle drie de plekken
hierboven), niet een extra regel op de factuur.

Tol, veerpont, parkeergeld of iets dat je onderweg voor de klant moest kopen zijn
wél door te berekenen: die zet je in `Extra kosten`, en dan komt het via de
`Factuurlink` als eigen regel op de factuur te staan.

De formule volgt de website exact: standaard €50 + €1,50/km, spoed €75 + €2,00/km,
directe spoed €100 + €2,50/km, minimum €75 per opdracht, en daarna pas de extra
kosten erbij. Internationaal blijft leeg — dat gaat op offerte, dus vul je
`Totaal excl. BTW` met de hand in. Vul je `Starttarief` of `Km-tarief` zelf in,
dan gaat die afspraak voor op het standaardtarief.

Gecontroleerd tegen de rekenvoorbeelden op `/tarieven/`: 10, 25, 50 en 300 km voor
alle drie de binnenlandse diensten komen op de cent overeen, inclusief het minimum
bij korte ritten.

### Betalingsbewaking

Op `Facturen` staan vier velden die samen laten zien wat er open staat:

| Veld | Wat het doet |
| --- | --- |
| `Betaald` | Telt de gekoppelde betalingen op; deelbetalingen tellen mee |
| `Openstaand` | Totaal min betaald; een gecrediteerde factuur staat op nul |
| `Dagen te laat` | Nul zolang er niets openstaat of de vervaldatum nog niet geweest is |
| `Betalingstermijn klant (dagen)` | Wat er bij die klant is afgesproken |

De automatisering **Facturen te laat markeren** (`wflohgkVPefthWWuj`) kijkt elke
maandagochtend welke facturen over hun vervaldatum zijn terwijl er nog geld
openstaat, en zet die op *Te laat*. Een halfuur later stuurt
**Betalingsherinnering sturen** (`wflWkvVHlNzs8B6gA`) de klant een herinnering
voor de facturen die er nog geen hebben gehad.

### Waarom die twee wekelijks draaien en niet dagelijks

Het gratis Airtable-plan geeft **honderd automatiseringsruns per maand**. Elke
keer dat een trigger afgaat telt mee, ook als er niets te doen is. Deze twee
draaiden allebei dagelijks, en dat kostte samen ruim zestig runs per maand —
voor twee klusjes die op de meeste dagen niets vinden. Er bleven er dan nog
geen veertig over voor het echte werk, terwijl één rit van aanvraag tot betaalde
factuur er vijf à zes verbruikt. Rond de zes ritten per maand zou de hele
administratie stilvallen, zonder waarschuwing.

Wekelijks kosten ze samen negen runs. De prijs daarvan is dat een factuur een
paar dagen te laat kan zijn voordat de status omgaat en de herinnering vertrekt;
bij een betalingstermijn van veertien dagen valt dat weg in de ruis.

Ze konden niet tot één automatisering worden samengevoegd. Airtable staat geen
stap toe ná een herhaallus, en allebei bestaan ze uit *zoek records* gevolgd
door een lus. Een echte samenvoeging zou de tweede lus in de eerste moeten
proppen met een voorwaarde eromheen — moeilijker te lezen, en het scheelt maar
vier runs per maand.

Ga je naar een betaald plan (25.000 runs), zet ze dan gerust weer op dagelijks.

**Let op — een weekschema kent in Airtable geen tijdzone.** De tijd staat
daarom in UTC: 07:00 UTC is 09:00 in de zomer en 08:00 in de winter. Dat
verschuift dus een uur bij de overgang naar wintertijd. Voor een
ochtendklus maakt dat niet uit.

Nog niet gebouwd: een seintje naar Schaap Logistics zelf wanneer dat gebeurt, en
automatische herinneringen naar de klant. Allebei wachten op een e-mailadres.

### Van aanvraag tot factuur

De keten loopt nu door zonder dat je gegevens overtypt. Vier tabellen, drie
overgangen:

`Website-aanvragen` → `Opdrachten` → `Ritten` → `Facturen`

**Aanvraag → opdracht.** Zet op de aanvraag het vinkje `Omzetten naar opdracht`
aan zodra je hem accepteert. De automatisering **Aanvraag omzetten naar opdracht**
(`wflAifOACxeRziDZm`) maakt de opdracht, neemt datum, adressen, type rit en
opmerkingen over, koppelt hem terug aan de aanvraag en zet de status om. Hij
start alleen als er nog géén opdracht aan hangt, dus twee keer aanvinken levert
geen dubbele opdracht op. De **klant** koppel je zelf: de aanvraag heeft alleen
een bedrijfsnaam als tekst, en of dat een bestaande klant is kan Airtable niet
weten.

**Rit → factuur.** Zet een rit op *Uitgevoerd* en de automatisering **Uitgevoerde
rit factureren** (`wflr5jqQPW55xwTNR`) maakt er een conceptfactuur bij, met de
klant, de opdracht en de bedragen uit de rit en de factuurdatum op vandaag. De
status blijft *Concept*, zodat je hem eerst nakijkt. Ook deze start alleen als er
nog geen factuur aan de rit hangt.

**Een rit zonder aanvraag.** Belt iemand je op, dan maak je de rit rechtstreeks
aan in het chauffeursportaal onder *Planning* → **+ Rit buiten de website om**.
Er zit dan geen aanvraag en geen opdracht onder, maar verder verandert er niets:
dezelfde prijsformule, dezelfde bevestiging aan de klant, en dezelfde
conceptfactuur zodra je hem op *Uitgevoerd* zet. Dat is de manier om handmatig
te factureren.

**De loze rit.** Zegt een klant af terwijl je al onderweg bent, dan zet je de rit
op *Geannuleerd*, pas je `Kilometers` aan naar wat je werkelijk gereden hebt en
vink je **Annulering doorbelasten** aan. De automatisering **Geannuleerde rit
doorbelasten** (`wflu0LCjXTvG7ZSj7`) maakt dan dezelfde conceptfactuur, en op de
factuur komt achter de omschrijving *(geannuleerde rit)* te staan. Dat volgt
artikel 9 van de voorwaarden: het starttarief plus de gereden kilometers, met het
minimum van €75. Zegt de klant af vóór je vertrekt, dan laat je het vinkje uit en
gebeurt er niets.

Het moesten twee losse automatiseringen worden omdat een trigger geen
samengestelde voorwaarde aankan — *uitgevoerd* óf *geannuleerd én doorbelasten*
past niet in één filter.

**De klant zegt zelf af.** In het klantportaal staat bij elke zending die nog op
*Gepland* staat een knop om te annuleren. Dan zet het portaal de rit op
*Geannuleerd*, vult `Geannuleerd op` en `Reden annulering`, en vinkt
`Geannuleerd door klant` aan. Op dat vinkje gaat de automatisering **Seintje bij
een annulering door de klant** (`wflt0t7LtWvQDpj5d`) af, zodat je het weet
voordat je in de auto stapt. Dat vinkje zet je nooit zelf aan; het is het
signaal, niet een instelling.

Zo'n annulering is per definitie kosteloos — het portaal laat het alleen toe
zolang de rit gepland staat — dus `Annulering doorbelasten` laat je uit. Is een
rit al *Onderweg*, dan kan de klant niet meer zelf afzeggen en krijgt hij te
zien dat hij moet bellen.

### Het seintje aan jezelf

De klant krijgt een ontvangstbevestiging; jij kreeg niets, en wist dus pas van een
aanvraag als je uit jezelf in Airtable keek. Voor spoedwerk is dat te laat.

**Seintje bij een nieuwe aanvraag** (`wflWygljnGucqKwyV`) mailt je zodra er een
aanvraag binnenkomt. Bij *Spoedtransport* en *Directe spoed* begint het onderwerp
met `SPOED`; bij de rest is het een gewoon bericht. Zet op je telefoon een aparte
melding op dat woord (op een iPhone: markeer de afzender als VIP, of maak in Mail
een melding op het onderwerp), dan hoor je een spoedaanvraag ook 's avonds.

Het adres staat in de twee e-mailonderdelen van de automatisering ingevuld en kun
je daar aanpassen. Wil je een echt sms'je, dan heeft Airtable daar een koppeling
met Twilio voor nodig — een betaalde dienst, ongeveer negen cent per bericht plus
een paar euro per maand voor een nummer. Zodra die koppeling er is, kan er een
sms-onderdeel naast de mail.

### Het factuurnummer

`Factuurnummer` op `Facturen` is een formule: het jaar uit de factuurdatum plus
`Volgnummer`, aangevuld tot vier cijfers — `SL-2026-0001`, net als in de mal.
Blijft leeg zolang factuurdatum of volgnummer ontbreekt.

`Volgnummer` moet type **Autonumber** zijn. Airtable vult hem dan zelf en je kunt
nooit twee keer hetzelfde factuurnummer uitgeven — een eis van de Belastingdienst.
Datzelfde geldt voor `Klantnummer` op `Klanten`, dat als debiteurnummer op de
factuur komt.

### De factuur uitdraaien

`Factuurlink` op `Facturen` is een formule die een adres bouwt naar
`/factuur/` op de website, met alle gegevens in de adresregel. Klik hem aan en de
factuur staat in de opmaak van de mal op je scherm; daar druk je op *Opslaan als
PDF* en sleep je het bestand terug in het veld `PDF`.

De link vult zichzelf uit de gekoppelde rit, klant en opdracht. Daarvoor staan er
opzoekvelden op `Facturen` (`Rit ritdatum`, `Rit ophaaladres`, `Rit afleveradres`,
`Rit kilometers`, `Rit km-tarief`, `Rit starttarief`, `Rit extra kosten`,
`Rit type`, `Klant naam`, `Klant adres`, `Klant BTW-nummer`,
`Klant debiteurnummer`, `Opdracht omschrijving`, `Uw referentie`). Die zijn er
alleen om de factuur te vullen; je hoeft ze niet zelf in te vullen.

De pagina rekent zelf het minimum van €75 per opdracht en de 21% btw, precies
zoals de calculator op de site. Gecontroleerd met een testfactuur: spoed,
109 km, €35 toeslag → €328,00 excl., €68,88 btw, €396,88 incl., gelijk aan wat
Airtable in de rit berekende.

Nog niet automatisch: het aanmaken van de PDF zelf. Dat blijft één handeling per
factuur.

### Het chauffeursportaal

`/portaal/` op de website leest en schrijft ritten. Dat gaat niet via de
aanvraag-Worker maar via een tweede, `schaap-portaal` uit `worker-portaal/`.
Bewust apart: de aanvraag-Worker draait en neemt bestellingen aan, en daar hoort
geen nieuw werk doorheen te lopen.

Het verschil met het aanvraagendpoint is belangrijk. Dat mag iedereen aanroepen,
want het schrijft alleen en kan niets teruglezen. Het portaal leest klantnamen,
telefoonnummers, adressen en bedragen — daar hoort een slot op. Dat slot is de
secret `PORTAAL_CODE`: de telefoon stuurt hem mee als header, de Worker vergelijkt
en weigert de rest.

**Uitrollen:**

```sh
cd worker-portaal
npx wrangler secret put AIRTABLE_TOKEN     # dezelfde token als schaap-aanvragen
npx wrangler secret put PORTAAL_CODE       # je eigen code, lang en willekeurig
npx wrangler deploy
```

De URL die `deploy` teruggeeft typ je één keer over in het inlogscherm van het
portaal; de telefoon onthoudt hem daarna. Je hoeft er dus niets voor in de code
te veranderen. Wil je het toch vastleggen — bijvoorbeeld omdat er meerdere
telefoons komen — dan kan het in `assets/portaal.js` bij `CONFIG.portaalUrl`;
dat gaat dan voor en de vraag verdwijnt uit het inlogscherm.

**Velden die hierbij horen**, allemaal in `Ritten`:

| Veld | Wat het doet |
| --- | --- |
| `Handtekening` | De krabbel van de ontvanger, als afbeelding |
| `Getekend door` | Wie er getekend heeft. Een krabbel zonder naam zegt weinig |
| `Getekend op` | Het tijdstip. Wordt door het portaal gezet |
| `Onderweg sinds` | Wanneer je vertrok. Samen met `Getekend op` de werkelijke ritduur |
| `Afleverbewijs` | *Compleet*, of *Ontbreekt* bij een uitgevoerde rit zonder handtekening |
| `Klantnaam`, `Klant telefoon` | Opzoekvelden; zonder deze ziet het portaal alleen een record-id |

`Onderweg sinds` wordt alleen gezet als het veld nog leeg is, en dat kijkt de
Worker zelf na — niet de telefoon. Twee keer op *Onderweg* drukken mag je
vertrektijd niet verschuiven, en een telefoon met een oude lijst moet dat niet
kunnen veroorzaken.

**De volgorde bij het tekenen is met opzet.** Eerst naam, tijdstip en status
wegschrijven, dan pas de afbeelding uploaden. Mislukt de upload, dan klopt de
administratie nog steeds en meldt het portaal dat opnieuw getekend moet worden.
Andersom zou een gelukte upload bij een mislukte update een handtekening
opleveren die nergens bij hoort.

**De keten in het portaal:**

```
Website-aanvragen  --Aannemen-->  Opdrachten  --Inplannen-->  Ritten  --Uitgevoerd-->  Facturen
     (tabblad            (automatisering        (portaal          (portaal,        (automatisering
      Aanvragen)          in Airtable)           maakt de rit)     handtekening)     in Airtable)
```

Het portaal schrijft nergens iets weg wat een automatisering al doet. *Aannemen*
zet alleen het vinkje `Omzetten naar opdracht` om; de opdracht wordt in Airtable
gemaakt. Zo staat de logica op één plek in plaats van twee die uiteen kunnen lopen.

*Inplannen* is wel nieuw werk: dat maakt een record in `Ritten` uit een opdracht,
met de klantkoppeling, de adressen, het soort transport en de opmerkingen erbij.
Staat er al een rit bij die opdracht, dan weigert de Worker met een 409 tenzij je
bevestigt — anders levert twee keer tikken twee ritten en straks twee facturen op.

Gecontroleerd met zevenentwintig tests op de Worker (vreemde herkomst, foute
code, verzonnen status, rommel-id, een niet-afbeelding als handtekening, de
vertrektijd die niet te vervalsen is, dat *Aannemen* precies één veld aanraakt,
dat een tweede rit op dezelfde opdracht geweigerd wordt, en dat de token nooit in
een foutmelding belandt) en met achtendertig schermtests op het portaal zelf,
tegen een nagebootste Worker.
Wat pas na het uitrollen te controleren is: of Airtable de handtekening
werkelijk als bijlage aanneemt. Dat is hetzelfde uploadpad als de foto's bij een
aanvraag, en dat is nog nooit met echte gegevens getest.

### De interface Administratie

De tabellen zijn breed geworden: `Facturen` heeft er vierendertig, en vijftien
daarvan bestaan alleen om de Factuurlink te vullen. Prima voor de machine,
onwerkbaar voor een mens.

Daarom staat er een interface **Administratie** (`pbdeBhgTbOrgyQynH`) op met vijf
schermen die elk maar één ding tonen:

| Scherm | Wat je ziet |
| --- | --- |
| Te factureren | Ritten op *Uitgevoerd*, met bedrag en of het afleverbewijs compleet is |
| Facturen | Alle facturen met de Factuurlink; tabbladen Concept, Verzonden, Betaald |
| Openstaand | Alleen facturen met een openstaand bedrag, de langst wachtende bovenaan |
| Winst per rit | Kosten invullen en zien wat er onder de streep overblijft, per soort transport |
| Klanten | Klantgegevens, zonder de koppelvelden ertussen |

De tabellen zelf zijn niet aangepast; de interface is een andere bril op dezelfde
gegevens. Verberg in de tabelweergaven zelf gerust de opzoekvelden die met `Rit `
of `Klant ` beginnen — die vullen zichzelf.

### Wat alleen met de hand kan

De koppeling waarmee ik de base bewerk kan velden aanmaken en aanpassen, maar niet
verwijderen, de opmaak van een veld niet instellen, en een automatisering niet
aanzetten. Die drie zijn op 2 september met de hand gedaan:

- De vijf berekende geldvelden staan op twee decimalen: `Automatisch totaal
  excl. BTW`, `BTW bedrag`, `Automatisch totaal incl. BTW`, `Betaald` en
  `Openstaand`. `Dagen te laat` blijft bewust op nul decimalen — dat zijn hele dagen.
- De verouderde velden zijn weg uit `Ritten`, `Opdrachten` en `Tarieven`.
- Beide automatiseringen staan aan.

Op 2 september kwamen daar deze bij, en die staan **nog open**:

- `Volgnummer` op `Facturen` en `Klantnummer` op `Klanten` omzetten naar type
  **Autonumber** (kolomnaam aanklikken → *Edit field* → *Autonumber* → *Save*).
  Zolang dat niet gebeurd is, moet je het volgnummer zelf intypen en kun je per
  ongeluk twee keer hetzelfde factuurnummer uitgeven.
- De automatiseringen **Aanvraag omzetten naar opdracht** en **Uitgevoerde rit
  factureren** aanzetten. Ze zijn compleet en gecontroleerd, maar Airtable maakt
  een nieuwe automatisering altijd uitgeschakeld aan.
- Twee decimalen instellen op `Totale ritkosten`, `Winst`, `Winst per km`,
  `Starttarief effectief` en `Km-tarief effectief`.

Let op bij een volgende opruimronde: `Automatisch totaal incl. BTW` is toen per
ongeluk meeverwijderd en opnieuw aangemaakt. Velden met een `fx`-pictogram rekenen
iets uit; die met een `$` vul je zelf in. Alleen namen met `(verouderd)` of
`(dubbel)` erin mochten weg.

