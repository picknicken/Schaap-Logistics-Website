# Schaap Logistics — website

Eén statische pagina (`index.html`) voor Schaap Logistics: zakelijk koeriers- en
spoedtransport. Geen build-stap, geen framework, geen dependencies — alle CSS en
JavaScript zitten in dat ene bestand. Je kunt het lokaal openen door erop te
dubbelklikken.

**Live:** https://picknicken.github.io/Schaap-Logistics-Website/

## Wat staat erop

| Sectie | Inhoud |
| --- | --- |
| Hero | Pitch + prijscalculator (postcode → postcode, of zelf kilometers invullen) |
| Diensten | Standaard, spoed, directe spoed, internationaal |
| Tarieven | Tariefkaarten, rekenvoorbeelden en een toeslagentabel |
| Rit aanvragen | Formulier in 5 stappen, met live prijsindicatie ernaast |
| Waarom | Zes concrete beloftes |
| Werkwijze | Van aanvraag tot factuur in 7 stappen |
| Contact | Contactgegevens + berichtformulier |

De prijscalculator rekent met de tarieven uit `CONFIG` in het script onderaan
`index.html`. Postcodes worden omgezet naar een geschatte rijafstand via de
middelpunten van de Nederlandse postcoderegio's (eerste twee cijfers) plus een
wegfactor van 1,25. Dat is nauwkeurig genoeg voor een indicatie, niet voor
navigatie.

## Checklist vóór livegang

Er staan nog placeholder-gegevens in de pagina. Zoek in `index.html` op
`PLACEHOLDER` om ze allemaal te vinden.

- [ ] **Telefoonnummer** — nu `06 - 12 34 56 78` / `tel:+31612345678`, op 5 plekken
      (menu, hero, sectie "Rit aanvragen", contactblok, formuliernoot).
      Vervang zowel de zichtbare tekst als de `href`.
- [ ] **E-mailadres** — nu `info@schaaplogistics.nl`, op 2 plekken in de HTML
      én in `CONFIG.email` in het script. Alle drie aanpassen, anders komen
      de aanvragen op het verkeerde adres binnen.
- [ ] **KvK-nummer** in de footer (`nog invullen`).
- [ ] **Btw-nummer** in de footer (`nog invullen`).
- [ ] **Tarieven controleren.** De bedragen staan zowel in `CONFIG` (voor de
      calculator) als los als tekst in de tariefkaarten en tabellen. Wijzig je
      een tarief, pas het dan op beide plekken aan.

## Hoe de formulieren versturen

Standaard staat `CONFIG.verzending.modus` op `'mailto'`: het formulier opent het
e-mailprogramma van de bezoeker met alles al ingevuld. Dat werkt zonder server,
en dus ook prima op GitHub Pages.

Wil je de aanvragen automatisch binnenkrijgen (bijvoorbeeld in Airtable), zet dan
`modus` op `'webhook'` en vul `webhookUrl` in. De pagina POST't de aanvraag dan
als JSON naar een eigen tussenlaag, foto's inbegrepen — zie `AIRTABLE.md`.

> Zet nooit een API-sleutel in `index.html`. Alles in dit bestand is leesbaar
> voor iedere bezoeker.

## Publiceren

De site staat op GitHub Pages, met als bron de map `/` (root) van de
gepubliceerde branch. `.nojekyll` staat erin zodat GitHub de bestanden
ongewijzigd serveert in plaats van ze door Jekyll te halen.

Aanpassing doorvoeren: `index.html` bewerken, committen, pushen. Pages
publiceert de nieuwe versie binnen ongeveer een minuut.
