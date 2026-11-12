# Kurukshetra Gym

Gym membership app (Next.js): member login and profile, registration, payments, admin dashboard and a community forum.

## Two ways to run it

### 1. GitHub Pages (static, works offline)

Live at **https://lazykode.github.io/Kurukshetra-gym/**. Every push to `main` rebuilds and redeploys it (`.github/workflows/pages.yml`).

- No server is involved. Members, payments, notifications and forum posts are stored **on the device, in the browser** (IndexedDB). Each device/browser has its own separate data, and clearing site data erases it.
- After the first visit the whole app is cached by a service worker, so it opens and works with no network. It can also be installed to the home screen.
- Build it locally with `npm run build:pages` (output in `out/`).

How it is wired: the Pages build replaces the server actions in `src/actions/` with on-device versions in `src/local/` that have the same function names (see `next.config.mjs`). The pages themselves are shared by both builds.

### 2. Server build (Firebase)

Unchanged: `npm run dev` / `npm run build` use the server actions in `src/actions/` with the Firebase Admin SDK and Firestore.

This needs the service account key at `src/service-account-key.json` and the web config in `.env.local` (see `src/.env.local.example`). **Neither file is in this repository and they must never be committed** - both are in `.gitignore`.
