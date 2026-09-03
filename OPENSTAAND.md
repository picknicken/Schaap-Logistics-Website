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
| **Voorwaarden en privacyverklaring laten nakijken** | `/voorwaarden/`, `/privacy/` | Ik heb ze geschreven, maar ik ben geen jurist. Er staan bewust gaten in (zie punt 3) |
| **Gmail koppelen in Airtable** | Airtable → Automations → Connect Gmail | Zolang dit niet gebeurt, komen al je mails in de spam |
| **`noindex` eruit halen** | alle pagina's | Staat er nu op zodat Google geen halve site indexeert. Als laatste weghalen |

Er staan in totaal **30 plaatsen** in de HTML gemarkeerd met `data-placeholder`;
die vallen geel op als je de pagina bekijkt, dus je kunt ze niet missen.

**Een eigen domeinnaam** (`schaaplogistics.nl`) lost drie dingen tegelijk op: de
spam, het `noreply@`-adres dat nu nergens naar wijst, en `info@` op je facturen
in plaats van een gmail-adres. Ongeveer €10 per jaar.

---

## 2. Wat ik kan bouwen

In volgorde van hoeveel het uitmaakt.

### a. Een seintje aan jou bij een nieuwe aanvraag — *dit is het grootste gat*

De klant krijgt nu netjes een ontvangstbevestiging. Jij krijgt niets. Je weet pas
van een aanvraag als je zelf in Airtable kijkt. Voor een spoedbedrijf is dat het
verkeerde model: iemand die om 23:00 een directe spoedrit aanvraagt verwacht
binnen minuten iets te horen.

Te bouwen: een automatisering die je een mail (en eventueel een pushbericht)
stuurt zodra er een aanvraag binnenkomt, met het adres, het type rit en de prijs
erin, zodat je vanaf je telefoon kunt beslissen.

### b. Internationaal transport heeft geen route

De calculator geeft bij België en Duitsland bewust geen prijs — dat gaat op
offerte. Maar er *is* geen offerteproces. De aanvraag komt binnen zonder bedrag
en daarna is het handwerk. Te bouwen: een offerteregel in Airtable met dezelfde
opmaak als de factuur, plus een knop om hem te mailen.

### c. Annulering en loze rit

Nergens geregeld: niet in de tarieven, niet in de voorwaarden, geen veld in
Airtable. Zegt een klant af terwijl je onderweg bent, dan heb je geen grond om
iets in rekening te brengen. Dit kost je vroeg of laat geld. Zie ook punt 3.

### d. De portaalcode is één gedeeld wachtwoord

Werkt prima zolang alleen jij hem hebt. Lekt hij, dan moet je hem in Cloudflare
vervangen en zijn alle klantlinks nog geldig. Te bouwen als het nodig wordt: een
code die per apparaat geldt, of een inlog per e-mail met een code die vervalt.

### e. Een back-up van Airtable

Er is er geen. Verwijder je per ongeluk een tabel, dan is je administratie weg.
Te bouwen: een wekelijkse GitHub Action die de hele base als bestand in de repo
zet. Kost niets en draait vanzelf.

### f. De PDF van de factuur is nog handwerk

Per factuur: link openen, *Opslaan als PDF*, bestand terugslepen in Airtable. Bij
een paar facturen per maand prima; bij dertig niet meer.

### g. Kleinigheden

- `robots.txt` en `sitemap.xml` (pas zinvol als `noindex` eraf gaat)
- De rem op de Workers geldt per server, niet over alle servers samen. Genoeg
  tegen een klungelige bot, niet tegen iemand die het echt op je gemunt heeft.
  Cloudflare heeft daar eigen instellingen voor.
- Foto's bij een aanvraag zijn nog nooit met een echte aanvraag getest.

---

## 3. Keuzes die eerst gemaakt moeten worden

Hier kan ik niets bouwen voordat jij beslist. Het zijn geen technische maar
zakelijke vragen.

**Welke voorwaarden gelden er?** In `/voorwaarden/` staat nu *"AVC 2002 / CMR —
nog vaststellen"*. Dit bepaalt waar je aansprakelijk voor bent als er iets
kapotgaat. AVC 2002 is de Nederlandse standaard voor binnenlands wegvervoer en
beperkt je aansprakelijkheid tot ongeveer €3,40 per kilo; CMR geldt voor
internationaal. Kies je niets, dan ben je onbeperkt aansprakelijk voor de volle
waarde van de lading. Dat is bij één laptop al duurder dan de rit.

**Ben je verzekerd voor de lading?** Een aansprakelijkheidsverzekering voor je
bedrijf dekt de lading van een ander meestal niet. Hier hoort een goederen- of
vervoerdersaansprakelijkheidsverzekering bij.

**Wat is je annuleringsregeling?** Bijvoorbeeld: kosteloos tot een uur voor
ophalen, daarna het starttarief, en als je al onderweg bent de gereden
kilometers. Zeg wat je wilt en ik zet het in de voorwaarden, de tarieven en
Airtable tegelijk.

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
