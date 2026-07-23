# USSR Stock Exchange Rework

This project replaces the static GitHub Pages-only setup with one Railway service that serves the website and its private API.

## The API being used

Your own Railway API is the main API. Once deployed, its address is:

`https://YOUR-SERVICE.up.railway.app/api`

Public market feed:

`GET /api/public/market`

Discord statistics bot intake:

`POST /api/internal/server-statistics`

Required header:

`x-stats-secret: YOUR_STATS_INGEST_SECRET`

Example body:

```json
{
  "membersOnline": 47,
  "membersOffline": 815,
  "joins": 9,
  "leaves": 2,
  "boosts": 1,
  "messagesSent": 2840
}
```

The backend then calls the official UnbelievaBoat API through the official `unb-api` JavaScript client. The browser never sees the UnbelievaBoat token.

## Balance protection

Before a purchase, the backend retrieves the citizen's real UnbelievaBoat balance and inventory. It rejects the purchase when:

- the market is closed;
- cash is insufficient;
- the 200-share citizen limit would be exceeded;
- public shares are unavailable;
- another trade by the same citizen is still processing.

Purchases use cash only. Bank money is displayed but is not silently withdrawn. If adding the stock item fails after cash removal, the backend automatically refunds the cash. Selling follows the reverse compensation process.

## Percentage rules

When the market opens, `changePercent` becomes exactly `0.00%`. The actual share price remains at the previous closing price. At settlement the price moves from that session opening price.

Daily movement is limited to `-3%` through `+3%`. Message totals are logarithmically compressed and all statistics are normalised before they affect the price.

## Automatic schedule

- Open session: 24 hours
- Normal closure: 60 minutes
- Exceptional activity closure: 120 minutes maximum
- Automatic reopening after closure

## Discord OAuth setup

Create a Discord application and add this redirect URI:

`https://YOUR-SERVICE.up.railway.app/auth/discord/callback`

The website requests `identify` and `guilds.members.read`. A citizen must belong to the configured server.

## Railway deployment

1. Put every project file in your GitHub repository.
2. Deploy the repository on Railway.
3. Copy `.env.example` values into Railway Variables.
4. Generate a Railway public domain.
5. Replace `YOUR-SERVICE` in `PUBLIC_BASE_URL` and `DISCORD_REDIRECT_URI`.
6. Restart the deployment.
7. Open `/health`; it should display `OK`.

## Important variables

- `UNBELIEVABOAT_API_TOKEN`: private application token
- `UNBELIEVABOAT_GUILD_ID`: your Discord server ID
- `UNBELIEVABOAT_STOCK_ITEM_ID`: the Red Star stock item ID
- `ADMIN_DISCORD_IDS`: comma-separated administrator Discord IDs
- `STATS_INGEST_SECRET`: secret used only by the statistics bot

Never put any of those secrets in `index.html` or commit `.env`.
