# Puerto Rico Patient Portal (PRPP)

**Know where your ER visit stands, in real time — you and the family members you choose.**
Prototype built during the Caribbean AI Summit Healthcare Hackathon (October 8–10, 2026) by Team PRPP.

> **Synthetic data only.** No real patients, staff or hospitals. The portal informs; it does not diagnose or recommend treatment.

## The problem and our solution
In Puerto Rico, patients can spend hours in the Emergency Department without knowing what is happening, why they are waiting, or what their results mean — and their families outside know even less. PRPP shows the visit in real time on the patient's phone: each stage, tests and results explained in plain Spanish, and clear discharge instructions. The patient decides, person by person, what each family member can see, and can revoke access instantly.

## Try it in 2 minutes
> _TODO (Saturday): live demo URL, demo mode (one-click demo accounts, no sign-up), backup video URL._
1. Open the demo link.
2. Choose a demo account (all fictional): **Doña Carmen** (patient) · **Lourdes** (daughter — sees visit, medications and instructions, **not** results) · **Rafael** (husband — sees everything shared).
3. As Carmen, run the hospital simulator's full tour and watch the visit advance and the blood test result arrive **without reloading**.
4. As Lourdes, see the lock on Results. As Carmen, share Results with Lourdes — it appears instantly; revoke it — it disappears.

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
- Configuration lives in local env files outside the repository; `.env.example` lists the variables without values.

## Pre-existing components and credits
| Component | What it is | License | How we use it |
|---|---|---|---|
| [Medplum](https://github.com/medplum/medplum) 5.1.42 | FHIR server and libraries | Apache 2.0 | Backend server and SDK, unmodified |
| [Foo Medical](https://github.com/medplum/medplum/tree/main/examples/foomedical) | Medplum's sample patient app | Apache 2.0 | _TODO: confirm whether the portal started from it_ |
| React, Vite | UI framework and build tool | MIT | Portal |
| Mantine, Tabler Icons | UI components and icons | MIT | Portal screens |

**Done before the event (no code):** product design, texts, the test case described in words, and the instructions for the AI agents.
**Done during the event:** all the code in this repository (see the commit history).

## Use of AI
Built with AI coding agents — **Claude Code** (backend) and **Hermes** (frontend) — following instructions written before the event. The portal itself does not use AI to diagnose: result explanations are fixed, reviewed texts.

## License
[Apache 2.0](LICENSE). Medplum notices are kept in any files derived from Medplum examples.
