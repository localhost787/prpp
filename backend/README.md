# PRPP backend

Scripts, Bots and tests for the PRPP Medplum project (server pinned to Medplum **5.1.42**).
Contract: `docs/contrato-api.md` (kit). Work log for the night of Oct 8–9: `docs/BITACORA-noche.md`.

## Setup

1. `cd backend && npm ci`
2. Create `~/.config/prpp/backend.env` (outside the repo, `chmod 600`) from `.env.example`. Set `PRPP_ENV_FILE` to use another path.
3. Run the scripts below. Every script is idempotent: running it twice creates nothing new.

| Script | Issue | What it does |
|---|---|---|
| `node scripts/setup-project.mjs` | POR-32 | Project `PRPP` with `bots` + `websocket-subscriptions`, project admin, `deploy-bots` client (minimal policy), Bot smoke test + negative test |

Before every commit: `bash backend/scripts/check-secrets.sh` (fails if a value from the local env file is in the staged diff).
