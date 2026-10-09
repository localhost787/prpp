# Puerto Rico Patient Portal (PRPP)

**One place for Puerto Rico patients to access and understand their health information — and share it with the family members they authorize.**

Puerto Rico does not currently have a live patient-facing platform connected to PRHIE. PRPP demonstrates how information from connected clinical sources could be presented in one clear, accessible longitudinal view. The Emergency Department journey is the hackathon demonstration scenario, not the limit of the product vision.

Built as a synthetic-data prototype during the Caribbean AI Summit Healthcare Hackathon (October 8–10, 2026) by Team PRPP: Edwin Rodriguez (backend lead) and Alberto Arias (frontend lead).

> **Synthetic data only.** No real patients, staff or hospitals. PRPP is not currently connected to PRHIE. The portal informs; it does not diagnose or recommend treatment.

## The problem and our solution
Puerto Rico does not currently have a live patient-facing platform connected to PRHIE where people can access their medical results in one place. PRPP addresses that gap with a synthetic-data prototype for patients and the family members they authorize; it is not currently connected to PRHIE. For the hackathon, the Emergency Department is the demonstration scenario: PRPP shows each stage, tests and results explained in plain Spanish, and clear discharge instructions. The patient decides, person by person, what each family member can see, and can revoke access instantly.

## Try it in 2 minutes
**Live demo: <https://prpp-frontend.vercel.app/>** — no sign-in: you enter directly as **Doña Carmen** (patient, fictional). The public link runs entirely in your browser with synthetic data.

1. **My visit:** the current stage, what comes next and why she waits.
2. **Results:** values explained in plain Spanish, noting her doctor may not have reviewed them yet.
3. Switch to **Lourdes**, her daughter: visit, medications and instructions are visible; Results shows a lock that does not reveal whether information exists.
4. Back as Carmen, **Family** shows the sharing matrix: person by person, category by category.

The full live flow — the hospital simulator sending HL7 v2, results arriving in real time, sharing and revoking with instant server-side effect — is shown in the 2-minute video. _TODO (Saturday): video URL._

### Demo accounts
> **These users and passwords are simulated.** Carmen and Lourdes are fictional people with synthetic data. Their logins are published here only so anyone can run the demo: they are not real people, they have no admin rights, and they protect nothing real.

| Account | Role | E-mail | Password |
|---|---|---|---|
| Carmen Rivera Colón | Patient (MRN-0001) | `carmen@example.com` | `ePUupeeRSpY9VtJwZrdW` |
| Lourdes Rivera | Daughter: visit, medications, instructions (+ her own record, MRN-0002) | `lourdes@example.com` | `gsDjMOUA5LbdQk65TVMy` |

## What is real and what is simulated
| Real (working in the prototype) | Simulated |
|---|---|
| FHIR R4 server (Medplum 5.1.42) storing the visit | The hospital's EHR — replaced by a simulator that sends HL7 v2 messages |
| HL7 v2 → FHIR translation by Medplum Bots (admission, orders, results, medications, discharge) | All people, staff and the hospital (100% fictional) |
| Real-time updates over FHIR subscriptions / WebSocket (measured ~0.2–0.3 s) | Wait-time estimates and the queue position |
| Server-side permissions per person and per category (visit · medications · instructions · results), revocable at any time; sensitive data (label R) never shared | Prior authorization status |
| Automated permission and live tests with the demo accounts | "Who saw my record" list (the demo server does not record read audits) |

_TODO (Saturday): confirm this table against what the final demo actually shows._

## How it works
Hospital simulator → **HL7 v2** → **Medplum Bots** (`hl7-a-fhir`, `compartir-familia`) → **FHIR R4** in Medplum → portal (React + Vite + Mantine + `@medplum/react`) updated live over WebSocket. Family access is enforced by the server with one AccessPolicy per category; `Consent` records each decision. Backend details: [`backend/README.md`](backend/README.md). Backend ↔ frontend contract: [`docs/contrato-api.md`](docs/contrato-api.md).

## Run it locally
- **Backend:** see [`backend/README.md`](backend/README.md) (Node 24, a Medplum 5.1.42 server, idempotent setup / seed / Bot scripts, tests).
- **Frontend:** _TODO (Saturday): steps from the frontend lead._
- Configuration lives in local env files outside the repository; `.env.example` lists the variables. The only values filled in are the fictional demo accounts above; admin logins and client secrets are never in the repository.

## Pre-existing components and credits
| Component | What it is | License | How we use it |
|---|---|---|---|
| [Medplum](https://github.com/medplum/medplum) 5.1.42 | FHIR server and libraries | Apache 2.0 | Backend server and SDK, unmodified |
| [Foo Medical](https://github.com/medplum/medplum/tree/main/examples/foomedical) | Medplum's sample patient app | Apache 2.0 | _TODO: confirm whether the portal started from it_ |
| React, Vite | UI framework and build tool | MIT | Portal |
| Mantine, Tabler Icons | UI components and icons | MIT | Portal screens |

## Use of AI
Built with AI agents: backend with **OpenClaw** and **Claude Code**; frontend with **Hermes Agent** and **Codex**. The portal itself does not use AI to diagnose: result explanations are fixed, reviewed texts.

## License
[Apache 2.0](LICENSE). Medplum notices are kept in any files derived from Medplum examples.
