# PRPP backend

Scripts, Bots, simulator and tests for the PRPP Medplum project (server pinned to Medplum **5.1.42**).
Contract: `docs/contrato-api.md` of the team kit (API-01…API-28).

## Setup

1. `cd backend && npm ci`
2. Create `~/.config/prpp/backend.env` (outside the repo, `chmod 600`) from `.env.example`: only the base URL and
   the super admin login are needed; the scripts write every generated id, password and secret back to that file.
   Set `PRPP_ENV_FILE` to use another path.
   The demo accounts (Carmen, Lourdes, Rafael) use the fixed, fictional passwords listed in the root README.
3. `npm run all` (project → demo users → seed → Bots). Every script is idempotent: running it twice creates nothing new.

| Command | Issue | What it does |
|---|---|---|
| `node scripts/setup-project.mjs` | POR-32 | Project `PRPP` (`bots`, `websocket-subscriptions`), project admin, `deploy-bots` client (Bot code + Binary create only), smoke and negative tests |
| `node scripts/demo-users.mjs` | POR-33 | Portal AccessPolicies; Carmen (Patient), Lourdes (RelatedPerson + own Patient + Person), Rafael (RelatedPerson); `simulador-hospital` client |
| `node scripts/seed.mjs` | POR-35 | Fixed data from `seed/datos-fijos.json`: Hospital Demo, 3 locations, 5 staff, Carmen's record, 1 R-labeled Observation |
| `node scripts/deploy-bots.mjs` | POR-36…40, 48 | Creates and deploys `hl7-a-fhir` and `compartir-familia` with their minimal memberships |
| `npm run simulador` | POR-41/42/46 | "Simulador del hospital" on `http://127.0.0.1:5181/` (the client secret stays in this local server) |
| `npm test` | POR-39 | Unit tests of the Bot, discharge and reset with MockClient (no server, no env file) |
| `node scripts/send-hl7.mjs tour` | API-27 | Sends the case messages as the simulator client |
| `node scripts/check-visit.mjs` | — | Read-only summary of Carmen's visit on the server |
| `node scripts/test-permissions.mjs` | POR-47/48/50 | Permission matrix with the real demo accounts |
| `node scripts/test-sharing.mjs` | POR-48/49 | Share / revoke with `compartir-familia` (restores the seed at the end) |
| `node scripts/test-identidad-cuidadores.mjs` | POR-98/99/101 | Email login + MRN, two caregivers with independent sharing, one account with two roles (restores the seed at the end) |
| `node scripts/test-live.mjs`, `test-live-family.mjs` | API-11 | WebSocket notifications for each account, before and after revoke |

## Bots

- `bots/hl7-a-fhir.cjs` — HL7 v2 (ADT A04/A08/A02/A03/A01-A06, ORM^O01, ORU^R01, RAS^O17) → FHIR, plus the stage Task,
  the simulated queue and one categorized notice per event. Idempotent by business identifier; Provenance with the
  original message; everything tagged `urn:portal:origen|simulado`. Membership: minimal, not admin.
- `bots/compartir-familia.cjs` — the patient chooses, per family member, which of the 4 categories they see. Rewrites only
  that patient's entries in the member's ProjectMembership (never empty) and keeps one Consent per person. Needs an
  admin membership because ProjectMembership is a project-admin type in Medplum 5.1.42.

Both run as `vmcontext` Bots: plain CommonJS, no imports, no `Buffer`.

Before every commit: `bash backend/scripts/check-secrets.sh` (fails if a value from the local env file is in the staged diff;
the public `DEMO_*_PASSWORD` values are allowed).
