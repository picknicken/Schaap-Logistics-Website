# Backlog

Wat er nog op de lijst staat, opgeschreven op 4 september 2026. Niets hiervan is
gebouwd. Per punt staat er wat er al is, wat er bij moet, en waar de adder onder
het gras zit.

Voor de volgorde van de livegang: zie `TIJDLIJN.md`. Voor wat de livegang
tegenhoudt: `OPENSTAAND.md`. Dit bestand gaat over wat er daarná bij kan.

---

## 1. Inspreken en de rit staat er

> *"Maak rit aan voor morgenmiddag 15:00 van Das 3 Hellevoetsluis naar
> Goudse Rijpad 3 Alphen aan den Rijn."*

**Wat er al is.** De drie stukken bestaan alle drie: een spreekknop die tekst in
een veld zet, de actie `leesbericht` die er velden uit haalt, en `nieuwerit` die
de rit aanmaakt. Ze staan alleen nog niet achter elkaar.

**Wat erbij moet.** Een knop *Rit inspreken* die de spreekknop en het plakvak
overslaat: je spreekt, het voorstel verschijnt ingevuld, en daaronder staat
**Rit aanmaken**. Jij drukt, zoals je zei.

**De adder.** Straatnamen zijn waar spraakherkenning struikelt. "Das 3" wordt zo
"dass drie", en "Goudse Rijpad" kan van alles worden. Het model kan een
verhaspelde straatnaam niet rechttrekken zonder te gokken, en gokken is precies
wat we hier niet willen. Wat wel kan: de herkende tekst blijft zichtbaar naast
het voorstel, zodat je in één blik ziet wat hij verstaan heeft. En een adres dat
onzeker is komt in het lijstje eronder te staan.

**Kleine klus**, mits het inspreken op jouw telefoon goed genoeg blijkt. Test dat
eerst met de knop die er nu al staat.

---

## 2. Navigeren vanuit de app

**Wat er al is.** Op de ritkaart staat *Route naar ophaaladres*, en bij de
kilometers *Kortste route opzoeken in Maps*.

**Wat erbij moet.** Op iOS opent zo'n link nu Apple Kaarten of Google Maps,
afhankelijk van wat er staat. Netter: één knop die meegaat met de rit —
onderweg naar het ophaaladres vóór het ophalen, naar het afleveradres daarna.
Dat scheelt kiezen op het moment dat je in de auto zit.

**Klein.** Een uur werk.

---

## 3. Alles opvraagbaar en kopieerbaar

**Wat je bedoelt.** Adres, telefoonnummer, referentie, bedrag — kunnen aantikken
en kopiëren, in plaats van overtypen of naar een ander scherm gaan.

**Wat erbij moet.** Een kopieerknopje achter elk veld dat het waard is, en op de
ritkaart alles wat je onderweg nodig hebt in één blok. Ook: het volledige adres
in één keer kopieerbaar, zodat je het in een ander navigatieprogramma kunt
plakken.

**Klein**, en waarschijnlijk het meest dagelijkse gemak van deze hele lijst.

---

## 4. Een mini-mailbox in het portaal

**Hier zit een groot verschil tussen "handig" en "verstandig".**

Om zakelijke mail in het portaal te tonen moet het portaal bij je mailbox kunnen.
Dat betekent dat de inloggegevens van je mail — of een sleutel die net zo veel
kan — in de tussenlaag komen te staan. Vandaag is het portaal beveiligd met
**één gedeeld wachtwoord**. Wie dat wachtwoord heeft, zou dan ook je hele
zakelijke mailbox kunnen lezen. Dat is een flinke stap omhoog in wat er te
verliezen valt.

**Wat ik zou doen in plaats daarvan**, in volgorde van moeite:

1. **Niets.** De mailapp op je telefoon staat één veeg verderop en kan alles wat
   een mini-mailbox zou kunnen, en meer.
2. **Alleen wat met ritten te maken heeft.** Niet je mailbox in het portaal, maar
   binnenkomende aanvragen per mail automatisch als aanvraag in Airtable zetten.
   Dan zie je ze in het portaal waar ze thuishoren, zonder dat er een mailbox
   opengaat.
3. **Wel een echte mailbox**, maar dan pas nadat het portaal per persoon inlogt
   met een eigen wachtwoord (zie punt 6). Niet eerder.

---

## 5. Wat verder handig zou zijn in het portaal

Ideeën die je niet noemde maar die in dezelfde hoek zitten:

- **Wachttijd met een knop.** Start bij aankomst, stop bij vertrek, en hij rondt
  zelf af op het kwartier zoals je tarief het rekent. Nu typ je minuten.
- **Foto bij aflevering**, naast de handtekening. Het sterkste bewijs dat er is.
- ~~**Kilometerstand aan het begin en eind van de dag.**~~ Gebouwd — zie het
  blok Kilometerstand onder de vier getallen in de Ritten-tab.
- **Tankbeurt vastleggen** bij de pomp, in plaats van bonnetjes bewaren.
- **Offline doorwerken.** In een kelder of parkeergarage werkt het portaal nu
  niet. Statussen en handtekeningen lokaal bewaren en versturen zodra er weer
  bereik is.
- **Meldingen op je telefoon** bij een spoedaanvraag, in plaats van mail. Kan nu
  het portaal als app geïnstalleerd is.
- **Dagafsluiting**: ritten, kilometers, omzet, wat er nog niet gefactureerd is
  en wie er te laat betaalt.

---

## 6. Het klantportaal als app, met een account per klant

Dit is de grootste van de lijst, en de enige waar je echt iets nieuws bouwt in
plaats van iets uitbreidt.

**Wat je wilt.** Vaste klanten installeren het portaal op hun computer, loggen in
met hun eigen inlog die ze zelf kunnen wijzigen, zien hun ritten en facturen, en
kunnen zelf een rit aanvragen. Jij kunt op afstand meekijken en de toegang
beperken.

**Wat er al is.** Het klantportaal zelf, met een code per klant. Installeerbaar
maken op een computer is dezelfde ingreep als bij het chauffeursportaal: een
halfuurtje.

**Wat er níét is: echte accounts.** Vandaag is er per klant één code. Wil je een
eigen wachtwoord dat de klant kan wijzigen, dan bouw je een inlogsysteem: veilig
bewaarde wachtwoorden, een vergeten-wachtwoordroute, en verantwoordelijkheid als
het misgaat. **Airtable is geen goede plek om wachtwoorden te bewaren.**

**Het lichtere alternatief dat ik zou aanraden.** Inloggen met een link per
e-mail: de klant vult zijn e-mailadres in, krijgt een link die een uur geldig is,
en is binnen. Geen wachtwoord om te vergeten, geen wachtwoord om te lekken, geen
resetroute om te bouwen. Voor een klant die drie keer per maand kijkt is dat
prettiger, en voor jou is het een fractie van het werk.

**Over toegang blokkeren bij niet betalen.** Technisch een vinkje. Maar bedenk
wat het oplevert: iemand die niet betaalt omdat de factuur bij zijn boekhouding
ligt, wordt buitengesloten en belt jou boos op. Wat wel werkt: het openstaande
bedrag bovenaan zijn portaal tonen, en bij een nieuwe aanvraag melden dat er nog
iets openstaat. Druk zonder ruzie. Blokkeren zou ik bewaren voor het geval dat
het echt misgaat, en dan met de hand.

---

## 7. Klantkortingen

Je vroeg: wat kan er zonder mezelf in de vingers te snijden?

**Wat er al kan.** Per klant staat er in Airtable een eigen starttarief en een
eigen kilometerprijs. Vul je die in, dan rekent de rit ermee — de website toont
het standaardtarief, de factuur jouw afspraak.

**Drie vormen, van veilig naar gevaarlijk:**

| Vorm | Wat het is | Risico |
| --- | --- | --- |
| **Eigen tarief per klant** | Vaste afspraak, staat al in het systeem | Laag. Je ziet per rit wat je overhoudt in Winst per km |
| **Staffel op volume** | Vanaf X ritten per maand een lager tarief | Middel. Je moet maandelijks terugkijken en corrigeren |
| **Procentuele korting op alles** | 10% eraf, ongeacht de rit | Hoog. Bij korte ritten eet dat je minimumtarief op |

**De grens die ik zou vastleggen.** Laat een korting nooit onder je
**minimumtarief van €75** komen, en houd het kilometertarief los van de korting.
Je kosten per kilometer veranderen niet omdat een klant veel rijdt. Wat je kunt
weggeven is het starttarief, want dat is het deel dat schaalt met hoe vaak je
langskomt.

**En het belangrijkste getal dat je nog niet hebt.** In Airtable staat *Winst per
km*, maar dat is per rit. Wat een tariefafspraak veilig maakt is per **klant**
kunnen zien wat er onder de streep overblijft. Dat is een klein veld erbij en
zou ik bouwen vóór de eerste kortingsafspraak, niet erna.

---

## 8. Aparte klantnummers

**Dit bestaat al.** In Airtable heeft elke klant een `Klantnummer` dat zichzelf
ophoogt, en dat staat op de factuur bij *Debiteur*. In de voorbeeldfactuur is dat
1004.

Wat er eventueel bij kan: het nummer ook in het klantportaal tonen, en een eigen
reeks laten beginnen (bijvoorbeeld bij 1000 in plaats van 1) zodat je eerste
klant geen nummer 1 krijgt. Klein.

---

## 9. De inlogpagina's opfrissen

Het chauffeursportaal en het klantportaal hebben allebei nog het oude inlogscherm:
een kop, een veld, een knop. Sinds het logo en de kleuren er zijn past dat niet
meer bij de rest.

**Allebei doen**, en in één keer: hetzelfde scherm, alleen andere tekst. Klein.

---

## Wat ik als eerste zou doen

1. **De inlogschermen en het kopieerbaar maken.** Klein, zichtbaar, en je hebt er
   elke dag wat aan.
2. **Inspreken doortrekken naar een rit.** Bouwt voort op wat er nu al staat.
3. **Navigeren die met de rit meegaat.**
4. **Winst per klant**, vóór je over kortingen praat.
5. **Het klantportaal installeerbaar maken** — een halfuur, en dan zie je of
   klanten het gebruiken voordat je een inlogsysteem bouwt.
6. **Pas daarna** accounts per klant, en de mailbox alleen als je die accounts
   hebt.
