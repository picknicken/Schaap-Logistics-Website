# Aanvragen naar Airtable

De formulieren op de site werken standaard via `mailto:` — de aanvraag opent in
het e-mailprogramma van de bezoeker. Dat is de eenvoudigste opzet en vereist geen
server. Deze notitie beschrijft wat er nodig is om aanvragen in plaats daarvan
automatisch in Airtable te laten binnenkomen.

## De hoofdregel

**De Airtable-sleutel mag niet in `index.html`.** De site is statisch: alles wat
in dat bestand staat is voor iedere bezoeker leesbaar, ook een sleutel die in het
script verstopt staat. Met zo'n sleutel kan een willekeurige bezoeker jouw base
uitlezen, aanpassen of leegmaken.

De pagina praat daarom nooit rechtstreeks met Airtable, maar met een eigen
tussenlaag die de sleutel bewaart en de aanvraag doorzet.

## Opzet

```
formulier op de site  →  eigen webhook (server-side)  →  Airtable API
```

Voor die tussenlaag kun je bijvoorbeeld een Cloudflare Worker, een Netlify- of
Vercel-function, of een Make/Zapier-webhook gebruiken. Wat het ook wordt, het
moet:

1. Een `POST` met JSON accepteren vanaf de domeinnaam van de site (CORS).
2. De Airtable-sleutel als omgevingsvariabele bewaren, niet in de code.
3. De velden doorzetten naar de juiste tabel in de base.
4. Een `2xx` teruggeven bij succes; de pagina toont dan de bevestiging.

## Aanzetten in de pagina

In het script onderaan `index.html`, in `CONFIG`:

```js
verzending: {
  modus: 'webhook',
  webhookUrl: 'https://<jouw-tussenlaag>/ritaanvraag'
}
```

De pagina POST't dan een JSON-object met twee sleutels:

```json
{
  "velden": { "Dienst": "Spoedtransport", "Ophaallocatie": "...", "...": "..." },
  "fotos":  [ { "naam": "zending.jpg", "type": "image/jpeg", "data": "data:image/jpeg;base64,..." } ]
}
```

Lukt het versturen niet, dan blijft het formulier ingevuld staan en krijgt de
bezoeker de melding dat hij kan bellen. Er is bewust **geen** automatische
terugval op `mailto:` — die zou de aanvraag stilletjes in een tweede kanaal
laten belanden.

## Aandachtspunten

- **Foto's.** Die gaan wél mee, als base64 data-URL in `fotos`. Reken op ongeveer
  een derde meer bytes dan het originele bestand. De pagina staat 5 foto's van
  maximaal 10 MB toe, dus een aanvraag kan tegen de 65 MB aan lopen, terwijl veel
  webhook-endpoints bij 1 tot 10 MB dichtgaan. Verlaag `CONFIG.foto.maxMb` als je
  tussenlaag een krappere limiet heeft. In de tussenlaag decodeer je de data-URL,
  upload je het bestand naar opslag en zet je de resulterende URL in een
  attachment-veld in Airtable.
- **Spam.** Een open webhook wordt vroeg of laat gevonden. Voeg minimaal een
  honeypot-veld of een rate limit toe in de tussenlaag.
- **Bevestiging.** Laat de tussenlaag ook een bevestigingsmail sturen naar de
  aanvrager; die krijgt hij bij `mailto:` vanzelf, bij een webhook niet.
