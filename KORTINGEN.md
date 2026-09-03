# Wat kun je weggeven zonder erop toe te leggen

Doorgerekend op 4 september 2026, met jouw eigen tarieven. Twee vragen die
allebei "korting" heten maar een ander antwoord hebben:

1. **Structureel** — een vaste klant een beter tarief geven.
2. **Goodwill** — iets weggeven omdat een rit misging.

---

## Eerst: wat een rit oplevert

Je kosten per kilometer ken je nog niet, want je hebt de bus niet. Ik heb
gerekend met **€0,50 per kilometer alles-in** — brandstof, onderhoud, banden, de
bus zelf, verzekering en wegenbelasting bij elkaar. Voor een bestelbus is dat aan
de voorzichtige kant; puur rijden kost eerder €0,25. Zit jij er straks onder, dan
is alles hieronder ruimer dan het lijkt.

De laatste kolom is de belangrijkste: wat er per **uur** overblijft, inclusief
laden, lossen en terugrijden (gerekend met 45 minuten vast plus 60 km/uur).

| Rit | Afstand | Prijs | Kosten | Marge | Per uur |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standaard | 10 km | € 90 | € 5 | € 85 | **€ 93** |
| Standaard | 50 km | € 150 | € 25 | € 125 | **€ 79** |
| Standaard | 200 km | € 375 | € 100 | € 275 | **€ 67** |
| Spoed | 10 km | € 120 | € 5 | € 115 | **€ 125** |
| Spoed | 50 km | € 200 | € 25 | € 175 | **€ 111** |
| Spoed | 200 km | € 500 | € 100 | € 400 | **€ 98** |
| Directe spoed | 50 km | € 250 | € 25 | € 225 | **€ 142** |
| Internationaal | 200 km | € 550 | € 100 | € 450 | **€ 110** |

**Wat hier uit springt: je verdient per uur het minst aan lange standaardritten.**
Een rit van 200 km levert meer op dan een rit van 10 km, maar per uur van je dag
minder — €67 tegen €93. Je kilometerprijs van €1,50 dekt de kilometer ruim, maar
niet de tijd die erin gaat zitten.

Dat is geen fout in je tarieven, dat is hoe kilometerprijzen werken. Maar het
bepaalt wel waar je korting mag geven en waar niet.

---

## 1. Structureel: waar je van af mag blijven

**Geef het starttarief weg, nooit de kilometerprijs.**

- Een korting op de **kilometerprijs** raakt lange ritten het hardst — en dat
  zijn precies de ritten waar je per uur het minst aan verdient. Daar snijd je in
  het verkeerde.
- Een korting op het **starttarief** kost bij elke rit hetzelfde bedrag, en raakt
  korte ritten procentueel het meest. Maar dat zijn juist de ritten met de beste
  uuropbrengst; die kunnen het hebben.

**De bovengrens rolt uit je eigen tarieven: €15.**

Een standaardrit van 10 kilometer kost €90. Je minimumtarief is €75. Precies €15
ertussen. Geef je meer weg dan dat, dan zakt je kortste rit onder je eigen
minimum — en dan heb je een tarief afgesproken dat je nergens meer kunt
verdedigen.

| Volume | Van het starttarief af | Standaardrit 50 km wordt |
| --- | ---: | ---: |
| Losse ritten | € 0 | € 150 |
| Vanaf 5 ritten per maand | € 7,50 | € 142,50 |
| Vanaf 15 ritten per maand | € 15,00 | € 135 |

Dat is 6% en 12% op een rit van 50 km, en het kost je respectievelijk 6% en 12%
van je marge. Vergelijkbaar met wat er in de branche gebruikelijk is voor
volumeafspraken — ik heb dat niet kunnen verifiëren aan harde cijfers, dus toets
het bij een collega voordat je het vastlegt.

**Drie regels om je aan te houden:**

1. **Nooit onder het minimumtarief van €75.** Ook niet met korting, ook niet voor
   een goede klant.
2. **Nooit een percentage over alles.** Dat lijkt eenvoudig maar raakt je
   kilometerprijs mee, en die heb je nodig.
3. **Alleen bij bewezen volume.** Kijk in Airtable bij `Aantal ritten` en
   `Winst per rit` voordat je iets belooft. Bij twee ritten per jaar geef je
   korting weg zonder er iets voor terug te krijgen.

Hoe je het vastlegt: vul bij de klant het veld **Starttarief** in met jouw
afgesproken bedrag. De rit rekent er dan automatisch mee, de website blijft het
gewone tarief tonen, en de factuur klopt met de afspraak.

---

## 2. Goodwill: als er iets misgaat

Hier hoef je niet zuinig te zijn, en dat is het punt van de tabel hierboven: bij
een spoedrit van 50 km houd je €175 over. Daar kan een gebaar van €35 makkelijk
uit, en dat gebaar is meer waard dan het kost.

Een ladder van licht naar zwaar, die je zonder nadenken kunt volgen:

| Wat er misging | Wat je weggeeft | Kost je |
| --- | --- | ---: |
| Later dan afgesproken, wel dezelfde dag | De toeslag eraf (avond, nacht of weekend) | € 25 – 150 |
| Spoed niet gehaald, wel de volgende dag geleverd | Afrekenen tegen het standaardtarief | € 50 op een rit van 50 km |
| Helemaal niet geleverd, of moeten terugrijden | De rit niet factureren | de hele rit |
| Schade aan de zending | Dat is je verzekering, niet je korting | zie artikel 8 |

Die laatste is belangrijk: **schade koop je niet af met korting.** Daar is je
vervoerdersaansprakelijkheid voor, en artikel 8 van je voorwaarden beperkt je
aansprakelijkheid tot €3,40 per kilo. Ga je uit coulance de schade zelf
vergoeden, dan zet je die beperking opzij en heb je er niets meer aan.

Vul het bij de rit in bij **Korting**, met een reden erbij. Die reden komt op de
factuur te staan, en dat is precies de bedoeling: de klant ziet zwart op wit dat
je het hebt rechtgezet. Doe het vóórdat je de rit op Uitgevoerd zet, want dan
wordt de factuur gemaakt.

---

## Wat je nog moet doen voordat dit echt klopt

**Vul je ritkosten in.** In Airtable staan per rit velden voor brandstof, tol,
parkeren en overige kosten. Laat je die leeg, dan denkt het systeem dat elke rit
100% winst is, en dan zeggen `Winst totaal` en `Winstmarge` bij de klant niets.
Eén minuut per rit, en daarna weet je wat je werkelijk overhoudt in plaats van
wat ik hierboven heb geschat.

Zodra je een maand echte kosten hebt, reken ik deze tabel opnieuw door met jouw
cijfers in plaats van met €0,50 per kilometer.
