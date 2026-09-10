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
korting. Starttarieven €75 / €100 / €125, kilometerprijzen €1,00 / €1,50 / €2,00,
internationaal €150 + €2,00 met een minimum van €200, alles exclusief btw.

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

### Pushmeldingen

**Staat aan sinds 9 september 2026, en de proefmelding is op de telefoon
binnengekomen.** Je telefoon piept nu bij een spoedaanvraag en bij een klant
die afzegt, ook als het portaal dicht is. Elke minuut kijkt de tussenlaag of er
iets nieuws is; een stempelveld zorgt dat je nooit twee keer hetzelfde bericht
krijgt.

De sleutels zijn eenmalig gezet: `VAPID_PUBLIEK` staat in
`worker-portaal/wrangler.toml` (die hoort openbaar te zijn — je telefoon heeft
hem nodig om zich aan te melden) en `VAPID_PRIVE` staat als **Secret** in
Cloudflare bij *schaap-portaal → Settings → Variables and Secrets*. Die private
helft komt nergens anders te staan.

Moet je ooit een nieuw paar maken — sleutel kwijt, of hij is ergens
terechtgekomen waar hij niet hoort — dan doe je dat met
`scripts/pushsleutels.html`, in je eigen browser. Let op: na een nieuw paar
moet **elke telefoon zich opnieuw aanmelden**. Doe het dus alleen als het moet.

Een nieuwe telefoon aanmelden: portaal openen **vanaf je beginscherm** (niet in
een Safari-tabblad, dan kan iOS het niet), *Meldingen* → **Meldingen
aanzetten** → **Proefmelding**.

**Wat er bewezen is.** `tests/faal-push.mjs` maakt de sleutels in een echte
browser op diezelfde pagina, voert ze aan de echte tussenlaag, en pakt uit wat
er de deur uit gaat — met een eigen uitwerking van het protocol, niet met de
code van de tussenlaag zelf. De tekst komt er leesbaar uit, met de sleutel van
een andere telefoon gaat hij niet open, en de handtekening op het VAPID-bewijs
klopt. Ook de vier manieren waarop je de sleutel verkeerd kunt plakken zijn
nagelopen: dan komt er geen melding, maar valt er ook niets om en blijft geen
aanvraag stilletjes op afgehandeld staan. Die proef draait bij elke wijziging
mee. Dat er werkelijk een melding op het scherm verschijnt is daarna met de
hand vastgesteld — geen enkele proef hier kan dat.

**Wat er nu naar je telefoon gaat.** Vier dingen:

| Wanneer | Wat |
| --- | --- |
| Meteen | Een nieuwe aanvraag via de site — spoed in de titel |
| Meteen | Een klant die een rit afzegt — ook naar de chauffeur die hem zou rijden |
| 's Ochtends | Een factuur die te lang openstaat, met het bedrag erbij. Eén keer per factuur, niet elke dag opnieuw |
| 's Ochtends | Het dagbericht: hoeveel ritten vandaag, wat er nog op *Onderweg* staat, wat er zonder klant hangt, wat er openstaat |

Dat ochtendbericht blijft stil als er niets te melden is. Met opzet: een bericht
dat elke dag zegt dat er niets is, leer je binnen een week wegtikken — en dan mis
je hem op de dag dat er wél iets staat.

Er staan met opzet geen bedragen van losse ritten of klantnamen in die je niet
zelf hebt ingevoerd. Een melding op een vergrendeld scherm is leesbaar voor wie
er toevallig langsloopt.

Een klant die via de site een rit aanvraagt zit al in de eerste regel: dat komt
meteen binnen, met SPOED in de titel als het spoed is.

**Wat er niet in zit, en waarom.** Een melding bij *nieuwe rit aangemaakt* is er
niet: die ritten maak je zelf aan, en je telefoon laten piepen om je te vertellen
wat je net zelf hebt getikt is ruis.

### Wie rijdt er: claimen en vrijgeven

Een rit zonder chauffeur is voor iedereen zichtbaar met **Ik rijd hem** — voor
jou net zo goed als voor een chauffeur. Druk jij erop, dan staat *Shane* op die
rit; drukt een chauffeur, dan zijn eigen naam. Die naam komt uit
`EIGENAAR_NAAM` in `wrangler.toml`; wil je hem anders, pas hem daar aan.

Jij hoeft niet eerst te claimen om te kunnen vertrekken: bij jou staat
*Onderweg* er gewoon naast. Een chauffeur wel — anders rijdt hij een rit die op
niemands naam staat.

**Vrijgeven** haalt de chauffeur er weer af, zodat een ander hem kan oppakken.
Een chauffeur mag dat alleen met zijn eigen rit en alleen zolang hij niet
vertrokken is; jij mag elke geplande rit vrijgeven, ook die van een ander — jij
bent degene die herverdeelt.

### Een chauffeur die zelf ritten oppakt

Een chauffeur ziet in zijn portaal nu ook de ritten van die dag die **nog geen
chauffeur** hebben, met een knop *Ik rijd hem*. Loslaten mag ook, zolang hij
niet vertrokken is — daarna is het geen planning meer maar een probleem waar
iemand van moet weten.

Wat hij daarmee níét kan: een aanvraag van de website aannemen. Daar zit een
prijs aan en dat is jouw beslissing. Hij ziet ook nog steeds geen bedragen, geen
winst en geen klantgegevens buiten wat hij nodig heeft om te rijden.

Zolang jij de enige bent verandert er niets: er zijn geen ritten zonder
chauffeur waar iemand anders op kan drukken.

### Rit of factuur weggooien

Voor een vergissing en voor het uitproberen. Met twee grenzen die er niet uit
kunnen, en het is goed om te weten waarom.

**Een verstuurde factuur gaat niet weg.** Je factuurnummers horen aaneensluitend
te zijn; een gat erin is bij een controle het eerste wat opvalt, en je kunt niet
laten zien wat erin zat. Draai hem terug met een creditnota — die staat al in
`AIRTABLE.md` beschreven en laat wél zien wat er gebeurd is. Een conceptfactuur
mag gewoon weg.

**Een uitgevoerde rit gaat ook niet weg.** Die is gereden: er hangt een
handtekening aan, kilometers die in je dagstaat meetellen, en meestal een
factuur. Zet hem op *Geannuleerd* als hij toch niet doorging.

Wat wél weg mag: een rit die nog gepland staat of onderweg was en nooit is
afgerond, en een conceptfactuur. Twee keer drukken, en het komt niet terug.

### Uitloggen

De knop heet nu *Uitloggen* en brengt je naar de website. Behalve als het
portaal vanaf je beginscherm draait: daar is geen adresbalk en geen terugknop,
en zou je jezelf op de marketingpagina opsluiten. Dan blijft het bij het
inlogscherm.

### Schade vastleggen

Nieuw tabblad **Schade**, en een nieuwe tabel `Schades` in Airtable. Aan je
eigen bus, aan de lading van een klant, of aan iets van een ander.

Je legt vast wát er gebeurde, wanneer, met welk kenteken en de toedracht in je
eigen woorden. Daarna kun je het **schadeformulier uploaden** (pdf of een foto
van het papier) en foto's van de schade zelf toevoegen. De stand loopt van
*Open* via *Gemeld bij verzekeraar* naar *Afgehandeld*; zet je hem op gemeld,
dan vult de tussenlaag de meldingsdatum in — de meeste polissen eisen melding
binnen een paar dagen en die datum wil je later kunnen aanwijzen.

**Waarom dit erin zit.** Een schade die je niet vastlegt is een schade die je
drie maanden later niet meer kunt onderbouwen. Dan staat het woord van de
tegenpartij tegenover jouw herinnering, en dan verlies je. Foto's op de dag zelf
en een toedracht in je eigen woorden zijn het hele verschil.

Er wordt niets berekend en niets automatisch gemeld: melden doe jij bij je
verzekeraar. Dit is de plek waar het bij elkaar blijft.

Het fotoveld neemt alleen foto's aan en het formulierveld ook pdf — een pdf in
het fotoveld zou op de kaart als gebroken plaatje verschijnen. Een chauffeur
ziet dit tabblad niet: er staan bedragen en verzekeringszaken in.

**Wat er níét in staat en wel in je voorwaarden hoort te blijven:** je
aansprakelijkheid voor de lading is al geregeld via AVC 2002 (binnenland) en het
CMR-verdrag (buitenland), met de kilolimieten erin. Dat staat in artikel 8 van
je voorwaarden en dekt de belangrijkste categorie.

### Contracten bij chauffeurs

Bij een chauffeur kun je nu het **contract uploaden**, net als bij een klant, en
staat erbij onder welke afspraak hij rijdt (`Contractsoort`: loondienst, zzp,
uitzend, oproep) en sinds wanneer.

**Wat hier bewust niet gebeurt is het contract opstellen.** Onder welke afspraak
iemand voor je rijdt is een juridische vraag — schijnzelfstandigheid speelt,
en mogelijk de cao Beroepsgoederenvervoer — en die hoort langs iemand die daar
werkelijk in zit. Dit is de bewaarplek, niet de tekst.

### De prijzen op de pagina naast de rekenmachine

Er was één gat in de prijsproeven. `faal-zelfde-som` bewees dat de browser en
de Worker hetzelfde rekenen, en `faal-zelfde-som-airtable` dat Airtable dat ook
doet. Maar de bedragen staan óók als platte tekst op de tarievenpagina, de
homepage en de dienstenpagina, en die tekst rekent nergens mee.

Nu leest een proef die drie pagina's in een echte browser en houdt elk genoemd
bedrag naast `SL.CONFIG`: starttarieven, kilometerprijzen, het minimum, de
toeslagpercentages met hun ondergrens, de stoptoeslag en het wachttarief. Ik heb
hem ook op de proef gesteld door in `site.js` één kilometerprijs te veranderen:
alle drie de pagina's vielen meteen om.

Daarmee is de laatste losse schakel in de prijsketen afgedekt: rekenmachine,
Worker, Airtable én de tekst op de site zeggen aantoonbaar hetzelfde.

### De systeemcheck: waar zit het als er iets niet werkt

Nieuw tabblad **Systeemcheck**, alleen voor jou. Eén knop, en dan loopt de
tussenlaag alle schakels langs en zegt van elk drie dingen: hoe het ervoor
staat, wat er gezien is, en wat je eraan doet. Dat laatste is het punt.
*"Airtable 422"* zegt niets; *"het veld Kilometers heet in Airtable niet meer
zo"* zegt precies wat je moet doen.

Dertien punten:

- **Instellingen** — staat alles er (token, hoofdsleutel, pushsleutels,
  toegestane adressen). Alleen "staat er wel/niet"; wat erin staat wordt nooit
  getoond. Een controle die je geheimen op je scherm zet is zelf het lek.
- **Negen Airtable-tabellen** — bereikbaar, én bestaan alle velden nog die de
  tussenlaag gebruikt. Dat is de belangrijkste: hernoem je in Airtable een veld,
  dan geeft het opslaan vanaf dat moment een 422 en zegt verder niets. Deze
  controle vraagt de velden bij naam op en geeft de melding van Airtable
  ongewijzigd door, mét de naam van het veld dat hij niet kent.
- **De prijsberekening** — heeft een rit met kilometers ook een berekend bedrag?
  Zo niet, dan rekent het formuleveld niet meer en rolt er een factuur van nul
  euro uit. Dat merk je anders pas als de klant belt.
- **Pushmeldingen** — staan er apparaten aangemeld en gaf de laatste poging een
  fout. Het verschil tussen "er komt niets binnen omdat het stuk is" en "er komt
  niets binnen omdat er niets te melden was".
- **De website en de aanvraag-Worker** — antwoorden ze nog. Valt die tweede weg,
  dan komt er geen enkele aanvraag meer binnen, en dat is stilte die je aanziet
  voor een rustige week.
- **Geweigerde pogingen (24 uur)** — één of twee is een typefout van jezelf,
  twintig is iemand die zit te proberen.

**Het is geen virusscanner**, en dat kan ook niet: er is niets om te scannen.
De site is een handvol vaste bestanden en de tussenlaag draait bij Cloudflare;
geen van beide kan iets oplopen. Wat wél gebeurt is dat een schakel wegvalt of
dat er in Airtable iets hernoemd wordt, en dáár kijkt dit naar.

Alles wat hij doet is lezen. Geen enkele controle verandert iets, zodat je hem
kunt draaien terwijl je twijfelt zonder die twijfel erger te maken — en daar is
een faaltest voor die meekijkt of er werkelijk niets wordt weggeschreven.

Draait de controle zelf niet, dan is dát de uitslag: je krijgt één rode regel
die zegt dat het aan de tussenlaag of je verbinding ligt en niet aan Airtable.
Een leeg scherm zou je in de verkeerde hoek laten zoeken.

Bij het bouwen liep hij meteen ergens tegenaan: alle 185 veldnamen die de
tussenlaag gebruikt zijn nagelopen tegen de echte Airtable. Ze kloppen alle 185.

### Wanneer je rijdt, en wanneer je opneemt

Bij de tijdvakken staat nu een venster, en de grens van de nacht is verschoven
van 06:00 naar **08:00**:

| Tijdvak | Venster | Toeslag |
| --- | --- | --- |
| Overdag | ma t/m za, 08:00 – 18:00 | geen |
| Avondrit | ma t/m za, 18:00 – 23:00 | + 20%, min. € 25 |
| Nacht- of weekendrit | 23:00 – 08:00 en de hele zondag | + 40%, min. € 50 |

**Dat verschuift een prijs.** Een rit die om 07:00 wordt opgehaald telde tot nu
toe als dagrit; nu is het een nachtrit met + 40%. Dat is een keuze en geen
detail: wie om zeven uur laadt is om vijf uur opgestaan. Wil je dat niet, dan
zet ik de grens terug op 06:00 of 07:00 — dan moet het venster op de site
meebewegen, want anders staat er 08:00 en rekent hij vanaf 06:00.

**Wanneer je opneemt is iets anders dan wanneer je rijdt**, en dat verschil
staat er nu apart bij:

| | Telefonisch |
| --- | --- |
| Maandag t/m vrijdag | 07:00 – 23:00 |
| Zaterdag | 08:00 – 17:00 |
| Nacht en zondag | op afspraak |

Het aanvraagformulier blijft dag en nacht open — daar is niets op tegen, zolang
erbij staat wanneer er antwoord komt. Kiest iemand een ophaalmoment buiten die
tijden, dan verschijnt onder het tijdveld dat wij het de volgende ochtend
bevestigen en dat bellen sneller gaat.

**En de keuzelijst met tijdvakken loog.** Daar stond met de hand "+ €15" en
"+ €35" in de HTML — de vaste bedragen van vóór de percentages. Precies dezelfde
fout als eerder in het portaal. Hij komt nu uit dezelfde plek als de berekening,
met het venster erbij.

### Het factuurnummer, en waar de klant het moet vermelden

Op de conceptfactuur stond geen nummer en op de echte stond het wel, maar de
betaalzin noemde het niet: er stond "onder vermelding van het factuurnummer" en
dan mocht de klant zelf terugbladeren.

Nu staat het nummer in de betaalzin zelf: *"onder vermelding van factuurnummer
SL-2026-0042"*. Het stond er even ook nog onder de betaalgegevens, maar twee
keer hetzelfde nummer op één vel leest als twee nummers — die is er weer af. Het
nummer wordt één keer uit de adresregel gelezen en twee keer neergezet (bovenaan
en in de betaalzin), zodat ze niet uit elkaar kunnen lopen.

**Op de conceptfactuur staat nu een kenmerk.** Geen factuurnummer, en dat is
geen slordigheid: een factuurnummer is doorlopend en mag geen gaten hebben. Zou
een concept er alvast een krijgen, dan is dat nummer weg zodra het concept geen
factuur wordt — en een gat in de nummering is precies waar de Belastingdienst
naar kijkt. Het kenmerk is `CONCEPT-` plus de ritnaam (`CONCEPT-RIT-0042`), zodat
je er aan de telefoon naar kunt verwijzen; zonder ritnaam wordt het de datum.

De conceptbalk bovenaan legt nu ook uit wanneer het echte nummer er wel komt —
zodra de rit op Uitgevoerd gaat maakt Airtable de factuur aan — en dat *dat*
nummer de klant bij de betaling moet vermelden.

### De kilometers als de rit anders loopt dan afgesproken

Je vroeg of een extra stop niet ook kilometers zou moeten rekenen. Het antwoord
op de vraag zoals hij gesteld is: nee, niet met een vast getal per stop. Een
stop in dezelfde straat is nul kilometer omrijden en een stop twintig kilometer
van de route is er veertig. Elk vast getal is bij de ene rit te veel en bij de
andere te weinig, en dat is precies het soort raden waar een verkeerde factuur
uit komt.

Wat er wél moest gebeuren is jouw tweede idee, en dat is de goede: **bij een
afwijkende afstand reken je per kilometer.** Dat dekt de extra stop, maar ook
een adres dat verderop blijkt te liggen, een afsluiting en een omleiding — de
hele categorie in één regel in plaats van een uitzondering per geval.

**De regel.** De prijs gaat uit van de route over de opgegeven adressen. Wijkt
de werkelijk gereden afstand daar meer dan **10% van af, met een ondergrens van
5 kilometer**, dan factureer je de werkelijk gereden kilometers. Blijft het
verschil binnen die marge, dan geldt de afgesproken afstand.

Waarom een marge en niet gewoon "wij rekenen wat er gereden is": een prijs die je
noemt moet een prijs blijven. Rijdt de navigatie twee kilometer om vanwege
werkzaamheden, dan hoort daar geen naberekening uit te komen — dat kost meer
uitleg dan het opbrengt. Waarom er wel een grens aan zit: veertig kilometer
omrijden rijd je wel en tank je ook, en het stoptarief van € 25 dekt dat niet;
dat is voor het laden en lossen.

De ondergrens van 5 km is er om dezelfde reden als bij de tijdtoeslag: 10% van
een rit van twintig kilometer is twee, en dan zou elke omleiding al meetellen.

**Het werkt beide kanten op.** Valt de rit korter uit dan afgegeven en scheelt
dat meer dan de marge, dan betaalt de klant de kortere afstand. Een marge die
alleen omhoog werkt is geen marge maar een opslag, en dat is precies wat een
klant je nadraagt.

**Op je scherm.** Op de rit staat nu naast `Kilometers` ook
`Geschatte kilometers`: de afstand waarop de prijs is afgegeven. Die wordt één
keer gevuld als de rit ontstaat en daarna nooit meer aangeraakt — anders schuift
het ijkpunt mee met je correctie en valt er niets meer tegen af te zetten.

Onder het veld *Gereden km* staat wat de twee samen betekenen, en dat loopt mee
terwijl je typt: *"30 km afgesproken, 32 gereden — 2 km meer. Dat valt binnen de
marge van ± 5 km, dus houd je de afgesproken 30 km aan."* Met een knop om het
veld in één tik op 30 te zetten, want wat er in het veld staat is wat er
gefactureerd wordt. Buiten de marge staat er wat je mag rekenen en verwijst het
naar de conceptfactuur voor het bedrag.

Het portaal beslist het niet voor je. Het zegt wat de afspraak is; jij tikt het
getal in. Een portaal dat je ingetikte 32 stiekem als 30 factureert is erger dan
geen regel.

**Bij de klant staat het er ook**, want anders kun je het niet rekenen: in de
voorwaarden (artikel 3), als eigen regel in de tarieventabel, en in de tekst
onder een offerte. Die drie zijn herschreven: er stond *"wij factureren de
werkelijk gereden kilometers — ook als dat minder is"*, en dat las alsof er
sowieso nagerekend werd. Nu begint het bij wat er meestal gebeurt (binnen de
marge verandert er niets) en komt de uitzondering daarna. Die drie en de code delen één bron — `kmMarge` in
`assets/site.js` — en een faaltest bewaakt dat de code doet wat er op papier
staat.

### De regels op de factuur staan weer in de goede volgorde

De factuur begon met de kilometers en zette het starttarief daaronder. Dat leest
alsof je halverwege de som instapt, en het was ook niet de volgorde waarin de
calculator op de site het voorrekent. Nu staat het starttarief bovenaan, dan de
kilometers, dan de toeslagen — op de factuur, de conceptfactuur en de offerte,
want dat is één en dezelfde pagina.

De bedragen veranderen niet; alleen de volgorde van de regels. De faaltest
controleert nu naast de optelsom ook de volgorde.

### Een menu in plaats van de tabbladenbalk

Zeven tabbladen passen niet op een telefoonscherm. De balk schuifde, maar wat
erbuiten viel zag je niet — en wat je niet ziet bestaat niet. Daar liep je zelf
tegenaan: *Chauffeurs* stond er wel, maar je vond het niet.

De balk is er nu helemaal uit. Er staat één regel bovenaan: links **waar je
bent**, rechts de menuknop. Drukken geeft alle tabbladen onder elkaar, met de
tellers erbij en een vinkje bij het tabblad waar je staat. Sluit op kiezen, op
ergens anders drukken en op Escape.

**Waarom de balk weg mocht.** Hij liet drie van de zeven zien. Voor die drie
scheelde hij een tik, maar de andere vier verstopte hij — en dat is precies het
probleem dat het menu oplost. Twee manieren om hetzelfde te doen waarvan er één
onbetrouwbaar is, is er één te veel. Het scheelt ook een strook scherm, en dat
is op een telefoon in een bus geen kleinigheid.

**Wat de balk wél deed en het menu moest overnemen: de tellers.** Die stonden op
de knoppen en waren dus altijd in beeld. Nu zitten ze in het menu, en zou je ze
pas zien als je het opent — dan weet je niet dát je hoort te kijken. Daarom
staat er een rood belletje op de menuknop zelf.

Dat belletje telt **alleen ongelezen meldingen**, en niets anders. Niet het
aantal open ritten van vandaag: dat is een gegeven en geen oproep, en dan zou
het altijd branden — een belletje dat altijd brandt kijk je binnen een week
overheen. En niet de aanvragen erbij opgeteld: een nieuwe aanvraag ís al een
melding, dus dan telde dezelfde aanvraag twee keer mee en zei de knop 4 bij twee
dingen. Dat had ik eerst zo gebouwd; de faaltest wees het aan.

Sta je zelf op Meldingen, dan gaat het belletje uit. Een chauffeur ziet dat
tabblad niet en krijgt er dus ook geen belletje over: een rood bolletje dat naar
een tabblad wijst dat voor hem niet bestaat is erger dan geen bolletje.

**De volgorde** is gegroepeerd en niet gegroeid: eerst wat op je ligt te wachten
(Ritten, Aanvragen, Meldingen), dan het vooruitzicht (Planning), dan met wie je
werkt (Klanten, Chauffeurs), en als laatste het gereedschap (Prijs).

### Tabblad Chauffeurs

Wie er voor je rijdt. Je kunt er iemand aanmaken, zijn gegevens bijhouden en
zijn toegangscode opvragen.

**Aanmaken.** Naam, telefoon, e-mail en kenteken. Hij krijgt meteen een code te
zien; geef die door en hij kan in het portaal zijn eigen ritten oppakken.
Dezelfde naam twee keer wordt geweigerd — ritten worden op naam verdeeld, dus
twee keer Piet betekent dat ze elkaars ritten zien.

**Per chauffeur** staat er telefoon, e-mail, kenteken en een notitie voor jou.
Dat laatste is hetzelfde idee als bij een klant: *rijbewijs verloopt in maart*,
*werkt dinsdag en donderdag*. Er is ook een knop om iemand op non-actief te
zetten; dan werkt zijn code niet meer zonder dat je hem hoeft weg te gooien.

**De code opvragen.** Twee knoppen: *Code tonen* geeft de bestaande — dat is wat
je nodig hebt als iemand hem kwijt is. *Nieuwe code* maakt een andere en gooit
de oude weg; dat doe je als een code is rondgestuurd.

Die code komt **niet** mee in het gewone overzicht, alleen als je erop drukt.
Dat is dezelfde afspraak als bij de portaallink van een klant, en om dezelfde
reden: het overzicht wordt bij elk bezoek opgehaald en belandt in het geheugen
van je telefoon. Een code die daarin meelift ligt daar dan ook.

**De naam kun je hier niet wijzigen.** Die staat op elke rit die deze persoon
rijdt; hem hier veranderen zou die ritten losmaken van hun chauffeur. Moet het
toch, doe het dan in Airtable en pas de ritten aan.

### Inloggen met je eigen code, met alle rechten

Je vroeg of de hoofdsleutel aan je chauffeurscode gekoppeld kan worden zonder
die sleutel prijs te geven. Dat kan, en het werkte al: er hoefde niets
gekoppeld te worden. Bij jouw rij in `Chauffeurs` staat **Rol: Eigenaar**, en
de tussenlaag kijkt naar die rol en niet naar wélke code je gebruikte. Je
persoonlijke code geeft dus precies dezelfde rechten als de hoofdsleutel; de
hoofdsleutel zelf blijft waar hij hoort, als secret in Cloudflare.

Dat is bewezen en niet aangenomen: de faaltest logt in met een persoonlijke
eigenaarscode en controleert dat een eigenaarsactie slaagt, dat dezelfde actie
met een gewone chauffeurscode een 403 geeft, en dat het overzicht compleet
binnenkomt.

**Waarom dit beter is dan de hoofdsleutel gebruiken.** In het toegangslogboek
stond de hoofdsleutel eerst als "Eigenaar" — niet te onderscheiden van jou.
Nu heet hij **Hoofdsleutel**, en jij heet **Shane (Eigenaar)**. Log je
voortaan met je eigen code in, dan hoort er nooit meer "Hoofdsleutel" in dat
logboek te verschijnen. Staat het er toch, dan ben jij dat op een ander
apparaat — of iemand anders. Dat verschil zie je alleen als de twee niet
hetzelfde heten.

En je kunt je code laten vervangen zonder aan Cloudflare te komen: *Nieuwe
code* in het tabblad Chauffeurs, klaar.

**Jezelf buitensluiten kan niet.** Nu je in je eigen lijst staat, kun je op je
eigen rij op *Op non-actief* drukken — dat zou je bij de volgende oproep uit je
eigen portaal zetten. Die knop staat er op je eigen rij niet meer, en de
tussenlaag weigert het ook als je het langs de knop om probeert; hetzelfde geldt
voor jezelf terugzetten naar Chauffeur. Je eigen rij staat gemerkt met **Jij**,
zodat je bij meer chauffeurs ziet welke van jou is.

Raak je je persoonlijke code toch kwijt of zet je jezelf per ongeluk uit in
Airtable, dan is de hoofdsleutel er nog. Daar is hij voor.

### De deur van het portaal

Twee dingen bijgezet na een keer goed kijken naar de beveiliging.

**De rem op raden telt nu over meerdere exemplaren.** Cloudflare draait
meerdere kopieën van de tussenlaag naast elkaar, elk met zijn eigen geheugen —
en de teller stond in dat geheugen. Vijftien foute pogingen per vijf minuten
gold dus per kopie en niet in totaal. Nu staat er een teller naast in de cache
van Cloudflare, die alle kopieën in hetzelfde datacentrum delen. Iemand die
vanaf één plek uren achter elkaar codes probeert komt nu niet ver meer.

Sluitend is het niet: met een botnet over de halve wereld ontloop je hem
alsnog. Wat het onmogelijk maakt is de enige aanval die er in de praktijk toe
doet.

**Er is een logboek.** In Airtable, tabel `Toegangslog`. Geweigerde pogingen
altijd, geslaagde toegang één keer per persoon per land per dag. Daar zie je
het aan als er iemand rondneust — en ook als jij zelf ineens vanuit een land
binnenkomt waar je niet bent.

**Wat hier nog wél open staat.** Het bestand `_headers` — met `X-Frame-Options`
en `Referrer-Policy` — doet niets zolang de site op GitHub Pages draait; die
leest het niet. Dat gaat pas gelden bij de verhuizing naar Cloudflare Pages.
Zet die verhuizing dus vóór live gaan en niet erna.

En het belangrijkste blijft buiten mijn bereik: je eigen `PORTAAL_CODE`. Die
staat als secret in Cloudflare, ik heb hem nooit gezien en dat hoort zo. Kun je
hem onthouden, dan is hij te kort. Twijfel je, zet er dan een nieuwe — dat is
één `wrangler secret put` en één keer opnieuw inloggen.

### Als een klant lastig wordt

Drie dingen op de klantkaart in je portaal:

**Een notitie**, bovenaan, boven de cijfers. *"Betaalt altijd te laat."*
*"Alleen vooruitbetaling."* *"Belt over alles."* Dat is wat je wilt lezen
voordat je opneemt. Die notitie is van jou: hij komt nooit in het klantportaal
terecht, en daar staat een proef op die het hele antwoord aan de klant afzoekt
op jouw tekst.

**Zelfbediening uitzetten.** Eén knop. Die klant ziet zijn ritten en facturen
nog gewoon, maar kan niets meer zelf annuleren of wijzigen — hij moet bellen. In
zijn portaal staat waarom de knoppen weg zijn, niet dat hij lastig is. En het is
een echte rem: ook wie het verzoek zelf in elkaar zet komt er niet doorheen.

**Toegang intrekken.** Wist zijn portaalcode. De link die hij heeft werkt
daarna niet meer, ook niet als hij hem had doorgestuurd. Vraagt om twee keer
drukken, want dit is niet terug te draaien: opnieuw uitnodigen geeft hem een
nieuwe code en de oude blijft dood.

Wat er met opzet niet is: een schakelaar per dienst. Een menu vol vinkjes raak
je nooit aan, en de echte knop bij een lastige klant is de volgende rit niet
aannemen. Dat is een telefoontje, geen instelling.

### Wijzigverzoeken: de klant vraagt, jij beslist

Een klant kan in zijn portaal om een wijziging vragen voor een zending die nog
gepland staat — een extra stop, een ander afleveradres, een andere datum of tijd.
Dat komt meteen op je telefoon en staat in je meldingen, met twee knoppen op de
ritkaart: *Ingewilligd* of *Afgewezen*. De klant ziet in zijn portaal wat je
ermee deed, dus dat scheelt het telefoontje "heeft u het gezien".

**Het staat er anders bij per soort rit.** Bij een standaardrit die dagen
vooruit staat klopt "wij kijken ernaar en laten het weten". Bij directe spoed is
diezelfde zin een loze belofte — daar sta je op het punt te vertrekken — dus
daar staat er dat bellen sneller gaat. Bij een spoedrit staat erbij dat het om
vandaag gaat. En bij internationaal staat erbij dat een extra stop of een ander
adres een nieuwe prijsopgave betekent en niet een kleine bijstelling, want zo'n
rit is er een op maat.

De knop blijft in alle gevallen staan: iemand die liever typt dan belt moet dat
kunnen. Wat er verandert is wat je belooft.

Op je telefoon zie je het verschil ook: een wijzigverzoek op een spoedrit of een
directe spoed komt binnen met **SPOEDRIT** ervoor en blijft staan tot je hem
aanraakt. Bij een standaardrit of internationaal is het een gewone melding.

**De klant verandert nooit zelf iets aan de rit.** Een stop erbij kost
vijfentwintig euro en een ander adres verandert de kilometers. Kon de klant dat
zelf zetten, dan bepaalt hij je factuur. Er komt dus een verzoek klaar te staan
en jij drukt op de knop.

**Bij extra stops doet *Ingewilligd* het werk wel.** De klant vult het aantal
apart in, met een getal, en de knop telt dat op bij de stops op de rit — de knop
zegt dan ook *Inwilligen (+2 stops)*, zodat je ziet wat je goedkeurt. Dat scheelt
het handmatig bijtellen waar je naar vroeg.

**Bij de andere soorten blijft het afvinken.** Daar staat een zin, en uit "een
doos mee naar Breda" zelf een aantal kilometers raden geeft een verkeerde
factuur. Ook bij een stopverzoek gaan de kilometers en de adressen niet vanzelf
mee. Pas dat daarna aan met de velden die er al voor zijn, dan klopt de prijs —
en dat is meteen het moment om de klant te laten weten wat het kost.

**De twee mails staan nog aan, met opzet.** `Seintje bij een nieuwe aanvraag`
en `Seintje bij een annulering door de klant` in Airtable blijven voorlopig
staan. De proefmelding bewijst de leiding, niet de praktijk: hij werd gestuurd
terwijl het portaal openstond en de telefoon in de hand lag. Wat nog niet
bewezen is, is een melding om half elf 's avonds met de telefoon in je zak en
het portaal dicht — juist het geval waarvoor het gebouwd is. iOS mag webpush
vertragen of laten vallen als het toestel lang niet gebruikt is.

Laat ze aan tot je een paar échte aanvragen op je scherm hebt zien komen. Pas
dan uitzetten, en één tegelijk. Ze kosten een automatiseringsrun per stuk van
de honderd per maand, dus haast is er niet bij.

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

**866 controles draaien groen**, verdeeld over negen faaltests: 268 in een
echte browser (`faal-portalen` 175, `faal-site` 93), 481 tegen de portaal-Worker
(`faal-portaal` 201, `faal-klantplicht` 195, `faal-toegang` 31, `faal-push` 54),
79 tegen de aanvraag-Worker en 38 op de prijsberekening. Daaronder zitten
controles dat de prijzen op de site kloppen met de calculator, dat een klant
nooit een cent van jouw kosten te zien krijgt, en dat een creditnota naar de
oorspronkelijke factuur verwijst.
