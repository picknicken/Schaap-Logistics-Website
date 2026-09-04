# Backlog

Wat er nog op de lijst staat, opgeschreven op 4 september 2026. Op de doorgestreepte
punten na is hiervan niets gebouwd. Per punt staat er wat er al is, wat er bij moet,
en waar de adder onder het gras zit.

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
eerst met de knop die er nu al staat. Let op: het plakvak en de spreekknop blijven
verborgen zolang er geen `ANTHROPIC_API_KEY` bij de portaal-Worker staat — zie
`OPENSTAAND.md`.

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

**Half gebouwd.** In het tabblad Klanten staat achter telefoon, e-mail en adres
een kopieerknop, en het adres komt er in één keer uit zodat je het in een ander
navigatieprogramma kunt plakken.

**Wat er nog bij moet.** Hetzelfde op de ritkaart: het ophaal- en afleveradres,
de referentie en het telefoonnummer van de klant, in één blok met alles wat je
onderweg nodig hebt.

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

**Het getal dat een tariefafspraak veilig maakt, staat er inmiddels.** Op de
tabel `Klanten` staan nu *Winst totaal*, *Aantal ritten*, *Kilometers totaal*,
*Winst per rit* en *Winstmarge*. Kijk daar naar voordat je een korting toezegt,
niet erna. Wat er nog niet in zit zijn je vaste lasten — zie punt 11.

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

## 10. Minder mail naar de klant

**Aan gelaten op 4 september.** Alle drie de ritberichten staan aan: de
ontvangstbevestiging bij de aanvraag, de orderbevestiging bij het inplannen, en
het afleverbericht. De klant krijgt dus drie mails per rit.

**Waarom dat voor nu prima is.** Meer berichten is minder onzekerheid bij de
klant en minder telefoontjes bij jou. Bij spoedvervoer is "hij is aangekomen" het
bericht waar iemand de hele dag op wacht.

**Waarom je het later misschien toch wilt.** Twee redenen. Elke mail kost een
automatiseringsrun, en op het gratis Airtable-plan heb je er honderd per maand —
een rit van aanvraag tot betaalde factuur kost er nu zes à zeven in plaats van
vijf à zes. En vaste klanten die vijf keer per week rijden krijgen vijftien
berichten per week over dingen die ze in hun portaal kunnen zien.

**Wat je dan uitzet, in Airtable, met de schakelaar rechtsboven in de
automatisering:**

| Automatisering | Wat vervalt | Waar het dan staat |
| --- | --- | --- |
| *Bevestigingsmail naar de aanvrager* | "we hebben uw aanvraag ontvangen" | De orderbevestiging volgt meestal binnen een dag |
| *Afleverbericht naar de klant* | "uw zending is afgeleverd" | De tijdlijn per zending in het klantportaal |

**De valkuil.** De voorwaarden gaan nu twee keer mee: in de ontvangstbevestiging
én in de orderbevestiging. Zet je de ontvangstbevestiging uit, dan blijft de
orderbevestiging over — en dat is juridisch de betere plek, want volgens artikel 4
komt de overeenkomst tot stand op het moment dat jij de opdracht bevestigt. Zet ze
dus nooit allebei uit, en controleer na het uitzetten één keer of er in de
orderbevestiging nog een link naar de voorwaarden staat.

Zet je het afleverbericht uit, zorg dan eerst dat de klant zijn portaallink heeft
gekregen. Anders haal je een bericht weg zonder dat er iets voor in de plaats komt.

**In een adem hiermee:** de beschrijving van de automatisering *Orderbevestiging
naar de klant* in Airtable begint met "De enige mail die een klant over een rit
krijgt". Dat klopt nu niet meer. Pas die zin aan of laat hem staan tot je de knoop
doorhakt.

---

## 11. Wat nog niet eerder op een lijst stond

Opgeschreven 4 september, nadat de kilometerstand er stond. Dit zijn geen
varianten op wat hierboven staat maar dingen die in geen enkele lijst voorkwamen.

### Voor jou

- **Prijsopgave vanaf je telefoon, in dertig seconden.** Een klant belt: "wat
  kost spoed van Rotterdam naar Venlo?" Nu moet je de website erbij pakken of het
  uit je hoofd doen. Twee postcodes en een soort rit in het chauffeursportaal, en
  je hebt hetzelfde bedrag als de site zou tonen — met een knop om het meteen als
  appje of mailtje te versturen. Dat laatste is het punt: een prijs die je
  opnoemt aan de telefoon is geen prijs die je later kunt aanwijzen. **Dit zou ik
  als eerste bouwen van dit hele lijstje**; het is klein, de rekenmachine bestaat
  al, en je gebruikt het elke week.

- **Wat een dag jou werkelijk kost.** Je weet nu per rit wat er aan brandstof,
  tol en overige kosten in ging. Wat nergens staat zijn je vaste lasten: lease of
  afschrijving, verzekering, wegenbelasting, onderhoud, telefoon, boekhouder.
  Zonder die is *Winst* een brutomarge, geen winst. Met een simpel maandbedrag
  erbij weet je twee dingen die je nu niet weet: wat een dag rijden moet opbrengen
  voordat je begint te verdienen, en wat een kilometer je echt kost. Dat laatste
  is het getal onder elke kortingsafspraak — zie `KORTINGEN.md`.

- **De bus zelf.** APK, verzekering, wegenbelasting, onderhoudsbeurt, banden.
  Voor een eenmanszaak is de bus het bedrijf: staat hij stil, dan is er geen
  omzet. Een paar datums in Airtable en een seintje twee weken van tevoren is een
  halfuur werk en voorkomt de dag dat je erachter komt dat de APK gisteren
  verliep.

- **Ritten die te combineren zijn.** Twee ritten op dezelfde dag waarvan de
  routes elkaar overlappen — daar zit je marge. Nu zie je dat alleen als je zelf
  op de kaart kijkt. Een seintje bij het inplannen ("deze rit ligt op de route van
  RIT-14") is niet moeilijk en verdient zichzelf in één rit terug.

- **Klanten die je niet meer ziet.** Wie drie maanden geleden nog reed en sindsdien
  niet meer, is geen verloren klant maar een telefoontje. Het veld `Laatste rit`
  staat er nu; er hoeft alleen nog een lijstje omheen dat ze eruit vist.

- **Een aanvraag die blijft liggen.** Je stuurt een prijs en hoort niets. Na twee
  dagen een seintje aan jezelf is het verschil tussen een opdracht en een
  aanvraag die doodbloedt.

### Voor de klant

- **Vragen om een Google-review na een geslaagde rit.** Voor een nieuw bedrijf is
  dat de goedkoopste reclame die er is, en het moment vlak na een afgeleverde
  spoedzending is het enige moment waarop iemand het ook echt doet. Eén zin
  onderaan het afleverbericht.

- **Een offerte op papier.** Voor grotere of terugkerende opdrachten wil een klant
  iets om intern te laten aftekenen. De factuurpagina bestaat al; een offerte is
  dezelfde pagina met een andere kop en een geldigheidsdatum.

- **Contactpersoon ter plaatse.** Niet de klant die belt, maar de man bij de
  expeditie waar je moet zijn. Nu staat dat in het veld Opmerkingen als je eraan
  denkt. Een eigen veld met een belknop scheelt zoeken op de stoep.

- **Zeggen hoe laat je ongeveer komt, en niet alleen dát je komt.** De
  orderbevestiging noemt de ophaaltijd. Wat er niet staat is wanneer het bij de
  ontvanger is. Voor de klant is dat de vraag die ertoe doet.

---

## Wat ik als eerste zou doen

1. **Het kopieerbaar maken doortrekken naar de ritkaart.** In het tabblad
   Klanten staat het al; onderweg heb je het net zo hard nodig.
2. **Inspreken doortrekken naar een rit.** Bouwt voort op wat er nu al staat.
3. **Navigeren die met de rit meegaat.**
4. ~~**Winst per klant.**~~ Staat er, op de tabel `Klanten`.
5. **Het klantportaal installeerbaar maken** — een halfuur, en dan zie je of
   klanten het gebruiken voordat je een inlogsysteem bouwt.
6. **Pas daarna** accounts per klant, en de mailbox alleen als je die accounts
   hebt.
