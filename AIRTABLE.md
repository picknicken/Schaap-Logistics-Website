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

## Losse einden in de base

Twee dingen die niet met de koppeling te maken hebben, maar wel opvallen:

- `Opdrachten.Type rit` kent alleen *Normaal* en *Spoed*. De site heeft vier
  diensten. Zet je een aanvraag om, dan is er voor directe spoed en
  internationaal geen passende optie.
- De formules in `Ritten` rekenen met €50 starttarief en €1,50/€2,00 per km.
  Directe spoed (€100 + €2,50) en internationaal ontbreken, dus die berekening
  wijkt af van wat de site je klanten voorrekent.
