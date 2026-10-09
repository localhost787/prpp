# PRPP dashboard

This is the active Expo / React Native Web application. See [frontend setup, tests and limits](../../README.md) for dependency setup, local export/server commands, browser/PDF prerequisites and attribution.

Synthetic data only. No real server authentication or authorization. English/Spanish visit, results and My care views, a general fictional Services directory under More, and local synthetic PDF downloads are implemented for the web mock. Care categories have separate mock permission guards. Directory distances use an example origin, not GPS; waiting times and plan acceptance remain unknown where undocumented. Family remains pending in the active UI.

The legacy Vite application is two directories above and has a separate dependency tree. Do not confuse its server with this dashboard; both default to port 3001. No native build or production deployment is claimed.

## Connect to a Medplum server (self-host)

By default the dashboard runs on synthetic mock data. To read from your own Medplum server (tested with 5.1.42), copy `.env.example` to `.env` (git-ignored) or set the same variables in your hosting provider:

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_DATA_MODE` | `live` to use the server; `mock` (default) for the synthetic demo |
| `EXPO_PUBLIC_MEDPLUM_BASE_URL` | Base URL of your Medplum server |
| `EXPO_PUBLIC_MEDPLUM_PROJECT_ID` | Project id (required; without it login fails) |
| `EXPO_PUBLIC_BOT_COMPARTIR_ID` | Optional: id of the `compartir-familia` Bot, only if the session cannot search Bots |
| `EXPO_PUBLIC_DEMO_{CARMEN,LOURDES}_{EMAIL,PASSWORD}` | One-click demo accounts (filled in `.env.example`); leave empty to hide the buttons |

**The demo users and passwords are simulated.** Carmen and Lourdes are fictional people with synthetic data and no admin rights; their logins are published in `.env.example` and in the root README only so anyone can run the demo. Every `EXPO_PUBLIC_*` value is embedded in the public JavaScript bundle, so put only these demo accounts there, never admin credentials, client secrets or tokens. The server, accounts and access policies come from `backend/` (see `backend/README.md`).

If the server is unreachable the app shows an error and offers the demo mode; it never mixes mock and server data. `npm test` runs offline. Server checks run by hand: `node --test tests/live-server.check.mjs` (temporarily changes what the demo patient shares, then restores it).
