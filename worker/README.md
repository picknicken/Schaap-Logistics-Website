# Tussenlaag voor de aanvragen

`aanvragen.js` is een Cloudflare Worker die aanvragen van de website aanneemt en
in Airtable zet. Hij bestaat om één reden: de Airtable-token mag niet in de
website staan, want alles daar is voor iedere bezoeker leesbaar.

De installatiestappen staan in [`../AIRTABLE.md`](../AIRTABLE.md).

Kort:

```sh
cd worker
npx wrangler secret put AIRTABLE_TOKEN     # token plakken, niet in git
npx wrangler deploy
```

Daarna de URL die `deploy` teruggeeft invullen bij `webhookUrl` in
`../assets/site.js`, committen en pushen.
