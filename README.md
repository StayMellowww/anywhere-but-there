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

Open the local URL printed by Vite. To run tests and create a production build:

```sh
node --test --test-isolation=none test/*.test.js
npm run build
```

## How it works

The React and Vite frontend retrieves restaurant data from OpenStreetMap through Overpass and resolves typed locations through Nominatim. Questions use available tags, which can be incomplete or outdated. Dietary information does not confirm allergen safety; check directly with the restaurant. Ratings and live open status are not provided.

Multiplayer uses PeerJS and WebRTC. The host owns the board and must keep the tab open. A strict majority of received votes determines each answer; ties count as no. The host can skip a question or proceed with votes received so far. Public data and signaling services can be unavailable or rate-limited.

Restaurant data is copyright OpenStreetMap contributors. Images, where available, link to their Wikimedia Commons attribution and license.

## Deploy

For Cloudflare Pages Git integration, use `npm run build` as the build command and `dist` as the output directory. No application secrets are required.
