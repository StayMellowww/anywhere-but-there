# Anywhere But There

A mobile-friendly restaurant decision game. Find nearby places, answer questions to narrow the board, and share finalists with friends.

## Features

- Search by city, US ZIP code, or device location, within up to 10 miles.
- Play solo or create a multiplayer room with a code, invite link, or QR code.
- Answer or skip questions, undo answers, and review why finalists remain.
- Choose an optional head-to-head finale; the default shows finalists by distance.
- View available restaurant details, map and review links, and attributed Wikimedia Commons images when available.

## Run locally

Install Node.js 20.19+ or 22.12+, then run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Solo play works in Vite; multiplayer requires the Cloudflare Worker runtime. To run tests and create a production build:

```sh
node --test --test-isolation=none test/*.test.js
npm run build
```

## How it works

The app searches Geoapify Places through the Worker when a key is configured, and falls back to OpenStreetMap through Overpass. Typed locations use Nominatim. Questions use available tags, which can be incomplete or outdated. Dietary information does not confirm allergen safety; check directly with the restaurant. Ratings and live open status are not provided.

Multiplayer uses WebSockets and Cloudflare Durable Objects. The host owns the board and must keep the tab open. A strict majority of received votes determines each answer; ties count as no. The host can skip a question or proceed with votes received so far. Public data and room services can be unavailable or rate-limited. Rooms support up to eight players and expire after one hour.

Restaurant data is copyright OpenStreetMap contributors. Images, where available, link to their Wikimedia Commons attribution and license.

## Deployment

Anywhere But There is deployed on Cloudflare Workers, with GitHub integration building and publishing the Vite app when changes are pushed to the production branch.

Configure `GEOAPIFY_API_KEY` as a Cloudflare Worker secret. For a local Worker preview, place `GEOAPIFY_API_KEY=your-key` in an untracked `.dev.vars` file, build the app, and run `npx wrangler dev`. Vite alone continues to use the OpenStreetMap fallback.

**Live app:** [anywhere-but-there.mellowstudios.workers.dev](https://anywhere-but-there.mellowstudios.workers.dev/)
