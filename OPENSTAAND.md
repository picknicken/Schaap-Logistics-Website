# Wat er nog open staat

Bijgewerkt op 3 september 2026, nagekeken tegen de werkelijke stand van de site,
de Workers en de Airtable-base.

Wil je weten in welke **volgorde** je dit doet en wanneer, kijk dan in
[TIJDLIJN.md](TIJDLIJN.md). Dit bestand zegt *wat* er nog moet; dat bestand zegt
*wanneer*.

Vier soorten werk, in volgorde van hoe hard het knelt:

1. **Wat de livegang tegenhoudt** — gegevens die alleen jij hebt
2. **Wat je moet beslissen** — zakelijke keuzes, geen technische
3. **Wat ik nog kan bouwen** — af te spreken wanneer
4. **Kleine dingen** — losse eindjes

---

## 0. De naamswissel: nog één ronde te gaan

De naam is **Schaap Express Transport** en het logo staat erin. Wat nog wacht op
het domein:

| Wat | Waarom het nog niet kan |
| --- | --- |
| **Het domein** | `schaaplogistics.nl` staat nog in 21 bestanden, in `CNAME`, in de DNS bij Strato, in twee `wrangler.toml`, en in de Airtable-formules `Factuurlink` en `Portaallink` |
| **`info@schaaplogistics.nl`** | Hangt aan het domein |
| **De mailteksten in Airtable** | Alle dertien automatiseringen ondertekenen met de oude naam en linken naar het oude domein. Die twee dingen zitten in dezelfde regels, dus ik doe ze in één ronde zodra het domein bekend is |
| **Het deelplaatje** | `assets/deelkaart.jpg` draagt het nieuwe logo maar nog geen adres; het domein komt links onderin te staan |

Laat `schaaplogistics.nl` daarna aflopen. Dat adres is precies wat botst met
Schaap Logistics B.V. in Breda, en zolang je het aanhoudt houd je die botsing in
stand.

### De naam toetsen — een half uur werk

Doe dit voordat je bij de KvK inschrijft, en zeker voordat je een bus laat
beletteren. Je toetst drie dingen die los van elkaar staan.

**1. Bestaande handelsnamen — Handelsregister van de KvK, gratis zoeken.**
Zoek niet alleen op de hele naam maar ook op de delen: *Schaap Express*,
*Schaap Transport*, *Schaap Koeriers*, en gewoon *Schaap* in combinatie met de
branchecodes voor goederenvervoer over de weg (49.41) en expediteurs en
bevrachters (52.29). Noteer per treffer drie dingen: welke activiteit, welke
plaats, en sinds wanneer.

**2. Merken — het merkenregister van het BOIP (Benelux) en eSearch van het
EUIPO (Europees), allebei gratis.** Een Europees merk geldt ook hier, dus kijk
in allebei. Let op klasse 39: transport, verpakking en opslag van goederen.
Staat de naam daar op naam van een ander, dan is er niets te bespreken.

**3. De praktijk — Google en de domeinnamen.** Zoek de naam tussen
aanhalingstekens en bekijk drie pagina's resultaten. Kijk wie de .nl en de .com
heeft (whois via SIDN voor .nl). Staat er al een vervoerder op die naam
bovenaan, dan is de verwarring er in het echt, wat een register ook zegt.

**Hoe je de uitkomst leest.** Drie vragen bepalen het:

- Zit de ander in transport of logistiek? Zelfde branche betekent dat verwarring
  al snel wordt aangenomen.
- Waar werkt hij? Landelijk telt overal; alleen bij een echt plaatselijk bedrijf
  helpt afstand.
- Wie was eerder? De oudere handelsnaam wint, en jij bent de nieuwkomer.

Drie keer ongunstig betekent: die naam houdt geen stand.

**Wat de KvK je níét vertelt.** Ze controleren bij inschrijving niet of je naam
mag, en inschrijven geeft je geen recht op de naam. Een groen licht van de balie
is dus geen groen licht. Hetzelfde geldt voor het BOIP: die toetst bij
registratie niet op oudere merken, bezwaar komt later van de merkhouder zelf.

**Wanneer je ervoor betaalt.** Twijfel je na stap 1 tot 3, laat dan een
merkgemachtigde een beschikbaarheidsonderzoek doen. Reken op een paar honderd
euro voor de Benelux; vraag vooraf een prijs. Dat is goedkoop naast opnieuw
beletteren, opnieuw drukken en klanten die je onder een andere naam kennen.

**En als de naam wel houdt:** leg hem dan zelf vast als Benelux-woordmerk in
klasse 39. Rond de €250 voor tien jaar. Dan moet de volgende opzij, en niet jij.

**Voor deze naam specifiek.** Het deel dat in het hoofd van een klant blijft
hangen is *Schaap*; *Express* en *Transport* zijn allebei soortwoorden die
iedereen in deze branche gebruikt. "Schaap Express Transport" en "Schaap
Logistics" komen daarmee allebei neer op Schaap plus vervoer. Een soortwoord
ertussen schuiven maakt zelden genoeg verschil. Houd er rekening mee dat de
uitkomst is dat het niet mag.

---

## 1. Wat de livegang tegenhoudt

Dit zijn geen bouwklussen. Het zijn gegevens die alleen jij hebt, en zonder deze
kun je de site niet in Google zetten en geen factuur versturen die klopt.

| Wat | Waar | Waarom het niet kan wachten |
| --- | --- | --- |
| **IBAN en BIC** | `factuur/index.html`, regel 285-286 | Er staat nu letterlijk `IBAN: [NL00 XXXX 0000 0000 00]`. Zo krijg je geen geld binnen. |
| **KvK- en btw-nummer** | voettekst van elke pagina + de factuurkop | Wettelijk verplicht; zonder is je factuur ongeldig |
| **Telefoonnummer** | `06 - 12 34 56 78`, op negen pagina's | Verzonnen nummer. Wie belt komt bij een vreemde uit |
| **E-mailadres** | `info@schaaplogistics.nl` | Bestaat nog niet; het domein is er wel |
| **Vestigingsplaats** | `/voorwaarden/`, `/privacy/` | Hoort in je algemene voorwaarden |
| **Voorwaarden laten nakijken** | `/voorwaarden/`, `/privacy/` | Ik heb ze geschreven, ik ben geen jurist. Zie punt 2 |
| **`noindex` eruit** | twaalf pagina's | Als allerlaatste, anders pikt Google een verzonnen nummer op |

Er staan **29 plekken** in de HTML met `data-placeholder`. Die vallen geel op als
je de pagina bekijkt, dus je kunt ze niet missen.

Eén plek valt niet geel op, omdat hij onzichtbaar is: het blokje bedrijfsgegevens
onderaan de `<head>` van `index.html` dat Google uitleest voor het kaartje naast
de zoekresultaten. Daar horen `telephone`, `email`, `address`, `vatID` en `taxID`
in zodra je ze hebt. Ik heb er bewust geen voorbeeldnummer in gezet: een verzonnen
telefoonnummer op die plek komt rechtstreeks in Google terecht en krijg je er
daarna moeilijk weer uit.

### Je e-mail komt nog steeds in de spam

Gecontroleerd: er is nog geen enkele e-mailkoppeling in Airtable. Alle post — de
ontvangstbevestiging, de ritbevestiging, de factuur, de herinnering, én je eigen
SPOED-seintje — gaat dus via Airtable's afzender, die voor jouw domein niets kan
aantonen. Dat is precies het patroon waar Gmail en Outlook op filteren.

Twee stappen, in deze volgorde:

1. **Maak `info@schaaplogistics.nl` aan bij Strato.** Het domein is er al.
2. **Koppel Gmail in Airtable** (Automations → het e-mailonderdeel → *Connect
   Gmail*). Dan gaan de mails echt vanaf jouw adres en komen ze aan. Ik kan dat
   niet voor je doen: die koppeling vraagt jouw Google-inlog.

Zolang dat niet gebeurt: markeer je eigen seintje één keer als *Geen spam* en
maak in Gmail een filter met **"Nooit naar Spam sturen"**. Anders mis je een
spoedaanvraag omdat het bericht in een map belandde waar je niet kijkt.

---

## 2. Wat je moet beslissen

Hier kan ik niets bouwen voordat jij beslist. Geen technische vragen.

**Ben je verzekerd voor andermans lading?** Een gewone
bedrijfsaansprakelijkheidsverzekering dekt de spullen van een klant meestal niet.
Hier hoort een goederen- of vervoerdersaansprakelijkheidsverzekering bij. Dit is
het punt waar het echt om geld gaat: artikel 8 beperkt je aansprakelijkheid tot
€3,40 per kilo (AVC 2002), maar dát bedrag moet je dan nog steeds zelf kunnen
betalen als er iets misgaat.

**Kloppen de voorwaarden?** Artikel 8 verwijst nu naar de AVC 2002 voor
binnenlands vervoer en het CMR-verdrag voor grensoverschrijdend vervoer. CMR
geldt internationaal van rechtswege — daar valt niets te kiezen. De AVC 2002 moet
je zelf van toepassing verklaren en op verzoek toesturen. Dat is de gebruikelijke
combinatie voor een Nederlandse koerier, maar laat het bevestigen door een jurist
of je brancheorganisatie voordat de site live gaat.

**Btw bij ritten naar België en Duitsland.** De factuurpagina rekent nu altijd
21%. Bij vervoer voor een buitenlands bedrijf met een geldig btw-nummer is de btw
meestal verlegd: 0%, met de vermelding *btw verlegd* op de factuur. Vraag dit aan
je boekhouder vóór de eerste internationale factuur. Zeg wat het wordt en ik bouw
het in — de factuurpagina en de formules kunnen het aan.

**Een brandstofclausule?** Veel vervoerders werken met een basistarief plus een
dieseltoeslag als percentage, die per kwartaal meebeweegt met de pompprijs. Dat
voorkomt dat je bij dure diesel inlevert zonder je hele tarievenpagina om te
gooien. Wil je dat, dan is het één klus over tarievenpagina, calculator, Airtable
en factuur tegelijk.

**Het Airtable-plan.** Het gratis plan geeft honderd automatiseringsruns per
maand. Sinds de twee ochtendklussen wekelijks draaien kost dat er negen, dus
blijft er ruim negentig over. Eén rit van aanvraag tot betaalde factuur kost er
vijf à zes: je zit dus rond de vijftien ritten per maand. Genoeg voorlopig, maar
geen oneindig plafond. Ga je daaroverheen, dan is een betaald plan (25.000 runs)
het eerlijke antwoord.

---

## 3. Wat ik nog kan bouwen

### a. De PDF van de factuur is handwerk

Per factuur: link openen, *Opslaan als PDF*, bestand terugslepen in Airtable. Bij
een paar facturen per maand prima; bij dertig niet meer. Automatiseren kan, maar
vraagt een externe dienst die HTML naar PDF omzet — dus een account en waarschijnlijk
een paar euro per maand.

### b. Er is geen back-up van je administratie

Verwijder je per ongeluk een tabel, dan is alles weg. **Let op: dit kan niet in
deze repo** — die is openbaar, dus dan zouden de naam, het adres en het
telefoonnummer van al je klanten op internet staan. Hetzelfde geldt voor
bestanden die een GitHub Action achterlaat.

Wat wel kan, van weinig naar veel moeite:

1. **Airtable's eigen snapshots** — base openen → menu rechtsboven →
   *Snapshots*. Gratis plan bewaart twee weken. Dekt de meeste ongelukken.
2. **Base dupliceren** — eens per maand, drie klikken, bevroren kopie.
3. **Een tweede, besloten repo** met een Action die daar wekelijks naartoe
   schrijft. De nette oplossing, maar een extra repo en een extra sleutel.

### c. De portaalcode is één gedeeld wachtwoord

Werkt prima zolang alleen jij hem hebt. Lekt hij, dan moet je hem in Cloudflare
vervangen. Te bouwen als het nodig wordt: een code per apparaat, of inloggen met
een code per e-mail die vervalt.

### d. Een echt sms'je bij spoed

Nu gaat het seintje per mail, met `SPOED` in het onderwerp. Een sms kan Airtable
alleen via een koppeling met Twilio: ongeveer negen cent per bericht plus een paar
euro per maand voor een nummer. Koppel je die, dan zet ik het sms-onderdeel er in
vijf minuten naast.

---

## 4. Kleine dingen

- **`Enforce HTTPS` aanzetten** in de repo-instellingen onder Pages, zodra GitHub
  het certificaat voor `schaaplogistics.nl` heeft aangemaakt.
- **De overige DNS-records bij Strato.** Er staat nu één A- en één AAAA-record;
  GitHub geeft er vier van elk. Met één werkt het, maar heeft dat ene adres een
  storing dan is de site onbereikbaar. De andere zes: `185.199.109.153`,
  `185.199.110.153`, `185.199.111.153` en `2606:50c0:8001::153`,
  `2606:50c0:8002::153`, `2606:50c0:8003::153`.
- **De rem op de Workers** geldt per server, niet over alle servers samen. Genoeg
  tegen een klungelige bot, niet tegen iemand die het echt op je gemunt heeft.
  Cloudflare heeft daar eigen instellingen voor als het ooit nodig is.
- **Foto's bij een aanvraag** zijn nog nooit met een echte aanvraag getest.
- **`robots.txt` en `sitemap.xml`** staan klaar en wijzen naar het juiste domein.

---

## Wat er níét meer open staat

Zodat je niet twee keer naar hetzelfde kijkt.

**De keten klopt van begin tot eind.** Prijs op de site = prijs in Airtable =
prijs op de factuur, inclusief stops, tijdvak, wachttijd, doorberekende kosten en
korting. Starttarieven €75 / €100 / €125, kilometerprijzen €1,50 / €2,00 / €2,50,
internationaal €150 + €2,00 met een minimum van €200.

**Het klantportaal** laat een klant zijn eigen zendingen en facturen zien, zijn
handtekening bekijken en een geplande rit zelf afzeggen — zonder dat jouw kosten
of marge ooit meegaan.

**Het chauffeursportaal** doet planning, statussen, handtekening, kosten, korting,
een rit buiten de website om, en het versturen van een portaaluitnodiging.

**Je klant hoort het zodra zijn zending is afgeleverd.** Zet je een rit op
Uitgevoerd, dan gaat er een bericht uit met wie er getekend heeft en wanneer, en
een verwijzing naar het afleverbewijs in zijn portaal.

**De algemene voorwaarden zijn bindend gemaakt.** Een verplicht vinkje bij de
aanvraag, een PDF om te bewaren, een tussenlaag die geen aanvraag zonder akkoord
doorlaat, en een bevestigingsmail die de aanvaarde versie noemt. Welke versie
iemand accepteerde en wanneer staat in `Voorwaarden geaccepteerd`.

**Twaalf automatiseringen in Airtable draaien.** Bevestigingsmail, aanvraag
omzetten, rit bevestigen, rit factureren, geannuleerde rit doorbelasten,
creditfactuur maken, factuur versturen, betalingsherinnering, facturen te laat
markeren, uitnodiging klantportaal, seintje bij een aanvraag, seintje bij een
annulering.

### Vier automatiseringen uitzetten in Airtable

Je hebt gekozen voor **drie mails naar de klant**: de orderbevestiging, de
factuur en de betalingsherinnering. De rest is een melding in het portaal
geworden. Uitzetten kan ik niet via de koppeling — dat is de schakelaar
rechtsboven in elke automatisering.

| Zet uit | Waarom | Waar het nu staat |
| --- | --- | --- |
| `Seintje bij een nieuwe aanvraag` | Ging naar jezelf | Tabblad **Meldingen**, spoed in het rood |
| `Seintje bij een annulering door de klant` | Ging naar jezelf | Tabblad **Meldingen** |
| `Afleverbericht naar de klant` | Ging naar de klant | De tijdlijn in het klantportaal |
| `Facturen te laat markeren` | Verhuisd naar de tussenlaag | Draait nu elke ochtend via de Worker |

**Aan laten:** `Orderbevestiging naar de klant`, `Factuur naar de klant sturen`,
`Betalingsherinnering sturen`. Dat zijn je drie.

Ook aan laten, en dat zijn er twee die je waarschijnlijk niet bedoelde:

- `Aanvraag omzetten naar opdracht` en `Uitgevoerde rit factureren` draaien op
  een voorwaarde die na de verhuizing nooit meer waar is. Ze kosten dus niets en
  zijn een vangnet als de tussenlaag omvalt. Waarom dat veilig is staat in
  `AIRTABLE.md`.
- `Uitnodiging klantportaal versturen`. **Die mail kan geen portaalmelding
  worden**, want hij is precies het bericht waarmee een klant zijn portaal
  krijgt. Zet je hem uit, dan komt niemand er meer in. Hij gaat één keer per
  klant, dus hij kost je vrijwel niets.

### Pushmeldingen: drie stappen, eenmalig

Gebouwd. Je telefoon piept nu bij een spoedaanvraag en bij een klant die
afzegt, ook als het portaal dicht is. Elke minuut kijkt de tussenlaag of er
iets nieuws is; een stempelveld zorgt dat je nooit twee keer hetzelfde bericht
krijgt.

1. **Maak de sleutels.** Open `scripts/pushsleutels.html` in je browser en druk
   op *Sleutels maken*. Dat gebeurt in je eigen browser: er wordt niets
   verstuurd of opgeslagen, ook niet naar mij.
2. **`VAPID_PUBLIEK`** zet je in `worker-portaal/wrangler.toml` tussen de lege
   aanhalingstekens. Die mag openbaar zijn — je telefoon heeft hem nodig om
   zich aan te melden. Push naar `main` en de Worker rolt zichzelf uit.
3. **`VAPID_PRIVE`** zet je als **Secret** in Cloudflare, bij
   *schaap-portaal → Settings → Variables and Secrets*. Die stuur je nooit
   door — niet naar mij, niet via WhatsApp, niet in een document.

Daarna: open het portaal **vanaf je beginscherm** (niet in een Safari-tabblad,
dan kan iOS het niet), ga naar *Meldingen* en druk op **Meldingen aanzetten**.
Druk meteen daarna op **Proefmelding** — piept je telefoon, dan staat het.

**Wat ik niet heb kunnen testen.** Dat de versleuteling klopt is wél bewezen:
een test pakt uit wat de tussenlaag verstuurt en leest de tekst terug, en het
VAPID-bewijs wordt op handtekening gecontroleerd. Maar of Apple die melding
daadwerkelijk op jouw scherm zet, kan hier niemand aantonen. Dat weet je pas
met die proefmelding. Werkt hij niet, laat het me weten met wat er op het
scherm staat.

Zodra de proefmelding werkt kun je `Seintje bij een nieuwe aanvraag` en
`Seintje bij een annulering door de klant` uitzetten in Airtable. Niet eerder:
zolang push niet bewezen werkt is die mail je enige seintje.

### Eenmalige klanten en vaste klanten

Nieuwe klanten beginnen als **eenmalig**. Hun factuur gaat per mail, precies
zoals altijd — een portaal is daar nergens voor nodig. Komt iemand terug, dan
zet je hem in het portaal onder Planning om naar **vaste klant**; dan pas krijgt
hij een uitnodiging, een termijn van dertig dagen en is een eigen tarief zinvol.

Bij vier ritten of meer meldt het portaal dat iemand geen eenmalige klant meer
is, zodat het onderscheid niet verwatert.

Wat je zelf nog kunt opruimen: het veld `Status` op `Klanten` staat nog op
*Todo / In progress / Done* uit het Airtable-sjabloon en doet niets.

### De aanvrager houdt zijn mail

Afgesproken: `Bevestigingsmail naar de aanvrager` blijft aan. Iemand die het
formulier invult is nog geen klant en heeft dus geen portaal — die mail kan
nergens anders heen, en het is het eerste wat een nieuwe klant van je bedrijf
ziet. Dat maakt vier mails naar buiten in plaats van drie:

| Mail | Naar wie | Wanneer |
| --- | --- | --- |
| Ontvangstbevestiging | de aanvrager | formulier ingevuld |
| Orderbevestiging | de klant | jij plant de rit in |
| Factuur | de klant | jij zet het vinkje om |
| Betalingsherinnering | de klant | maandagochtend, als er te lang openstaat |

Plus de uitnodiging voor het klantportaal, één keer per klant. Die kan niet
weg: hij ís de toegang tot het portaal.

**De kilometerstand staat in het portaal.** Onder de vier getallen van de dag in
de Ritten-tab zit een blok *Kilometerstand*: beginstand bij vertrek, eindstand bij
thuiskomst. Daarnaast staat wat je die dag hebt gefactureerd, en het verschil
daartussen.

Dat verschil is het punt, en daarom is het niet — zoals je voorstelde — de
optelsom van de ritten geworden. De kilometers van een rit lopen van ophaaladres
naar afleveradres: dat is wat de klant betaalt. De teller telt ook het rijden
naar de eerste klant, het rijden naar huis, omrijden en tanken, en dat is bij een
koerier al gauw een derde van de dag. Een optelsom van de ritten kan dus nooit
aantonen dat je onder de 500 privékilometers blijft — hij telt per definitie
alleen wat je hebt verkocht. Zonder dat bewijs is het bijtelling. Vandaar twee
getallen naast elkaar in plaats van één, met een vakje om het verschil te
verklaren.

Het kost je twee keer een getal overtypen per dag. Dat is de goedkoopste
verzekering in dit hele systeem.

**Het domein** `schaaplogistics.nl` is live, met een doorstuur vanaf het oude
adres zodat verstuurde links blijven werken.

**De site zelf is nagelopen op snelheid, vindbaarheid en toegankelijkheid.**
Het lettertype staat op onze eigen server (scheelt een verbinding met Google en
haalt de laatste privacyvraag uit de privacyverklaring), er is een deelplaatje
voor WhatsApp en LinkedIn, elke pagina heeft een canonieke link, de koppen lopen
netjes van h1 naar h2 zonder gaten, en de foutpagina werkt weer — die verwees na
de domeinverhuizing nog naar het oude adres en kwam daardoor zonder opmaak en met
dode links binnen.

**181 portaaltests, 140 schermtests, 160 portaal-Workertests, 43 klanttests en
alle overige Worker-tests** draaien groen, waaronder controles dat de prijzen op de site kloppen met de calculator, dat een klant nooit een cent van
jouw kosten te zien krijgt, en dat een creditnota naar de oorspronkelijke factuur
verwijst.
