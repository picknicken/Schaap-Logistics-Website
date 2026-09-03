# Wat er nog open staat

Bijgewerkt op 3 september 2026. Drie soorten werk: dingen die op jou wachten,
dingen die ik kan bouwen, en keuzes die eerst gemaakt moeten worden.

---

## 1. Op jou — dit moet af voordat de site live kan

Zonder deze punten kun je de site niet in Google zetten en kun je geen factuur
versturen die klopt.

| Wat | Waar het staat | Waarom het niet kan wachten |
| --- | --- | --- |
| **IBAN en BIC** | `factuur/index.html`, regel 276-277 | Er staat nu letterlijk `IBAN: [NL00 XXXX 0000 0000 00]` op de factuur. Zo krijg je geen geld binnen. |
| **KvK- en btw-nummer** | de voettekst van alle 11 pagina's, en de factuurkop | Wettelijk verplicht op een factuur, en zonder is je factuur ongeldig |
| **Telefoonnummer en e-mailadres** | nu `06 - 12 34 56 78` en `info@schaaplogistics.nl` — allebei verzonnen | Een klant die belt komt bij een vreemde uit |
| **Voorwaarden en privacyverklaring laten nakijken** | `/voorwaarden/`, `/privacy/` | Ik heb ze geschreven, maar ik ben geen jurist. De aansprakelijkheid staat er inmiddels concreet in (AVC 2002 / CMR); juist dát hoort iemand te bevestigen |
| **Gmail koppelen in Airtable** | Airtable → Automations → Connect Gmail | Zolang dit niet gebeurt, komen al je mails in de spam |
| **`noindex` eruit halen** | alle pagina's | Staat er nu op zodat Google geen halve site indexeert. Als laatste weghalen |

Er staan in totaal **30 plaatsen** in de HTML gemarkeerd met `data-placeholder`;
die vallen geel op als je de pagina bekijkt, dus je kunt ze niet missen.

**De domeinnaam is er** — `schaaplogistics.nl`, geregistreerd bij Strato en
geactiveerd. Hij wijst alleen nog naar Strato's eigen parkeerpagina. Wat er nog
moet gebeuren staat in `README.md` onder *Verhuizen naar schaaplogistics.nl*:
eerst de DNS omzetten, dan pas het bestand `CNAME` in de repo, en daarna de
absolute adressen in `robots.txt`, `sitemap.xml` en Airtable.

Daarmee vallen ook twee andere punten om: het `noreply@`-adres dat nu nergens
naar wijst, en `info@schaaplogistics.nl` op je facturen in plaats van een
gmail-adres.

---

## 2. Wat ik kan bouwen

In volgorde van hoeveel het uitmaakt. Wat er *gebouwd, moet nog aan* bij
staat, staat klaar in Airtable maar is nog uitgeschakeld: alles wat via de API
wordt aangemaakt komt uit als concept, zodat jij het eerst kunt nakijken.

### a. Een seintje aan jou bij een nieuwe aanvraag — *gebouwd, moet nog aan*

De automatisering **Seintje bij een nieuwe aanvraag** (`wflWygljnGucqKwyV`) staat
klaar in Airtable. Zet hem daar aan; hij is nog uit, zoals alles wat via de API
wordt aangemaakt.

Bij *Spoedtransport* en *Directe spoed* begint het onderwerp met `SPOED`. Zet op
je telefoon een aparte melding op dat woord of op de afzender, dan hoor je het
ook 's avonds.

Nog open: een echt sms'je. Airtable kan dat alleen via een koppeling met Twilio,
een betaalde dienst — reken op ongeveer negen cent per bericht plus een paar euro
per maand voor een nummer. Koppel je die ooit, dan is het sms-onderdeel er in vijf
minuten naast gezet.

### b. Internationaal transport heeft geen route

De calculator geeft bij België en Duitsland bewust geen prijs — dat gaat op
offerte. Maar er *is* geen offerteproces. De aanvraag komt binnen zonder bedrag
en daarna is het handwerk. Te bouwen: een offerteregel in Airtable met dezelfde
opmaak als de factuur, plus een knop om hem te mailen.

### c. Annulering — *gebouwd, moet nog aan*

Artikel 9 van de voorwaarden en de tarieventabel zeggen nu allebei hetzelfde: tot
je vertrekt kosteloos, daarna het starttarief plus de gereden kilometers, met een
minimum van €75.

**Jij, als je al onderweg was.** Op `Ritten` staat een vinkje **Annulering
doorbelasten**. Zet de rit op *Geannuleerd*, pas `Kilometers` aan naar wat je
werkelijk gereden hebt en zet het vinkje aan; dan maakt de automatisering
**Geannuleerde rit doorbelasten** (`wflu0LCjXTvG7ZSj7`) er een conceptfactuur bij,
met *(geannuleerde rit)* achter de omschrijving.

**De klant, in zijn eigen portaal.** Bij een zending die nog op *Gepland* staat
staat nu een knop *Deze zending annuleren*, met een bevestigingsstap en ruimte
voor een reden. De rit gaat op *Geannuleerd* en jij krijgt een mail via **Seintje
bij een annulering door de klant** (`wflt0t7LtWvQDpj5d`). Is de rit al *Onderweg*,
dan verdwijnt de knop en krijgt de klant te zien dat hij moet bellen — vanaf dat
moment kost het geld en hoort er een gesprek bij.

Alle drie de automatiseringen staan nog uit en moet je in Airtable aanzetten.

### d. De portaalcode is één gedeeld wachtwoord

Werkt prima zolang alleen jij hem hebt. Lekt hij, dan moet je hem in Cloudflare
vervangen en zijn alle klantlinks nog geldig. Te bouwen als het nodig wordt: een
code die per apparaat geldt, of een inlog per e-mail met een code die vervalt.

### e. Een back-up van Airtable

Er is er geen. Verwijder je per ongeluk een tabel, dan is je administratie weg.

Let op — in een eerdere versie van deze lijst stelde ik voor om de base
wekelijks als bestand in deze repo te zetten. **Dat kan niet.** Deze repo is
openbaar: dan zouden de naam, het adres en het telefoonnummer van al je klanten
op internet komen te staan. Hetzelfde geldt voor de bestandjes die een GitHub
Action achterlaat; ook die zijn bij een openbare repo voor iedereen te
downloaden.

Wat wel kan, van weinig naar veel moeite:

1. **Airtable's eigen snapshots.** Base openen → het menu rechtsboven →
   *Snapshots*. Op het gratis plan bewaart Airtable twee weken terug. Dekt de
   meeste ongelukken (per ongeluk een tabel wissen) en kost je niets.
2. **Base dupliceren.** Eens per maand → *Duplicate base*. Drie klikken, en je
   hebt een bevroren kopie naast je echte base staan.
3. **Een tweede, besloten repo** alleen voor back-ups, met een Action die daar
   wekelijks naartoe schrijft. Dat is de nette oplossing, maar wel een aparte
   repo en een extra sleutel om te beheren.

### f. De PDF van de factuur is nog handwerk

Per factuur: link openen, *Opslaan als PDF*, bestand terugslepen in Airtable. Bij
een paar facturen per maand prima; bij dertig niet meer.

### g. Kleinigheden

- De rem op de Workers geldt per server, niet over alle servers samen. Genoeg
  tegen een klungelige bot, niet tegen iemand die het echt op je gemunt heeft.
  Cloudflare heeft daar eigen instellingen voor.
- Foto's bij een aanvraag zijn nog nooit met een echte aanvraag getest.

---

## 3. Keuzes die eerst gemaakt moeten worden

Hier kan ik niets bouwen voordat jij beslist. Het zijn geen technische maar
zakelijke vragen.

**Welke voorwaarden gelden er?** Ingevuld, maar nog te bevestigen. Artikel 8
verwijst nu naar de AVC 2002 voor binnenlands vervoer (aansprakelijkheid beperkt
tot €3,40 per kilo) en naar het CMR-verdrag voor grensoverschrijdend vervoer
(8,33 SDR per kilo). CMR geldt bij internationaal vervoer van rechtswege, daar
valt niets te kiezen; de AVC 2002 moet je wél zelf van toepassing verklaren, en
op verzoek toesturen. Dat is de gebruikelijke combinatie voor een Nederlandse
koerier, maar laat het bevestigen door een jurist of je brancheorganisatie
voordat je de site live zet. Zonder die verwijzing ben je onbeperkt aansprakelijk
voor de volle waarde van de lading — bij één laptop al duurder dan de rit.

**Ben je verzekerd voor de lading?** Een aansprakelijkheidsverzekering voor je
bedrijf dekt de lading van een ander meestal niet. Hier hoort een goederen- of
vervoerdersaansprakelijkheidsverzekering bij. Dit is het punt waar de AVC 2002
hierboven je alleen beschermt tot €3,40 per kilo — daarboven ben je op je
verzekering aangewezen.

**Btw bij ritten naar België en Duitsland.** De factuurpagina rekent nu altijd
21%. Bij vervoer voor een buitenlands bedrijf met een geldig btw-nummer is de
btw meestal verlegd, en dan hoort er 0% op te staan met de vermelding *"btw
verlegd"*. Vraag dit aan je boekhouder voordat je de eerste internationale rit
factureert.

**Een brandstofclausule in plaats van een vast tarief.** Veel vervoerders werken
met een basistarief plus een dieseltoeslag als percentage, die per kwartaal
meebeweegt met de pompprijs. Dat is de nette manier om te voorkomen dat je bij
een dure diesel geld inlevert, zonder dat je je hele tarievenpagina hoeft om te
gooien. Als je hier iets mee wilt, is dat een aparte klus: tarievenpagina,
calculator, Airtable en factuur tegelijk.

**Het gratis Airtable-plan houdt op bij 100 automatiseringen per maand.** Er
lopen er nu acht, en één rit van aanvraag tot betaalde factuur verbruikt er al
gauw vijf. Rond de vijftien à twintig ritten per maand loop je tegen het plafond
en stopt de boel zonder waarschuwing. Betaald plan of minder automatiseren.

---

## Wat er níét meer open staat

Voor de volledigheid, zodat je niet twee keer naar hetzelfde kijkt: de prijzen
lopen kloppend van calculator naar Airtable naar factuur (inclusief stops,
tijdvak, wachttijd en doorberekende kosten), de klant kan inloggen en zijn eigen
zendingen en facturen zien zonder dat jouw kosten of marge meegaan, de
handtekening wordt gezet én getoond, en de factuur is op een telefoon leesbaar.
