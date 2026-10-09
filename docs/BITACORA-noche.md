# Bitácora de la noche (Claudio, backend) · 8→9 oct 2026

_Resumen final arriba (se escribe al parar). Debajo, una entrada por issue: hora, estado, evidencia y siguiente paso._

Servidor: Medplum en la nube `https://api-44-219-247-103.sslip.io/` (5.1.42). Rama: `edwin/backend`. Secretos: `~/.config/prpp/backend.env` (fuera del repo, permiso 600).

---

## 00:26 · Pasos 1–4 de INSTRUCCIONES-CLAUDIO + POR-32 project-setup · HECHO

- Paso 1: `curl https://api-44-219-247-103.sslip.io/healthcheck` → `ok:true`, `version 5.1.42-2a810b6`, postgres y redis `true`.
- Paso 2/POR-32: proyecto **PRPP** creado por API con el super admin (no a mano), `features = ["bots","websocket-subscriptions"]`. Id en el `.env` local, no en git.
- Usuario admin del proyecto `prpp-admin@example.com` (no es el super admin), invitado con `scope: project`.
- Paso 3: ClientApplication **deploy-bots** con la política `deploy-bots` (solo Bot y Binary). Id y secreto solo en el `.env` local.
- Paso 4: `backend/.env.example` sin valores. `.gitignore` tapa `.env` y `.env.*`. El archivo real vive fuera del repo.
- Evidencia: `cd backend && node scripts/setup-project.mjs` (corrido 2 veces seguidas, la 2.ª todo `same`):
  ```
  same Project/4906a3ea-… · ok features = ["bots","websocket-subscriptions"]
  ok   Bot $execute -> 200 "ok"                       (Bot de prueba, desplegado por deploy-bots)
  ok   negative: deploy-bots POST Patient -> 403       (permiso mínimo)
  ok   Project?name:exact=PRPP -> 1                   (idempotente)
  ok   server version 5.1.42-2a810b6
  ```
- Siguiente: POR-33.

## 00:27 · Paso 6 · Búsqueda sin permiso en ESTE servidor · RESULTADO ANOTADO

Con el token de deploy-bots (su política no tiene Patient ni Observation):
```
GET fhir/R4/Patient                                   -> 403 Forbidden
GET fhir/R4/Observation?patient=Patient/123           -> 403 Forbidden
GET fhir/R4/Patient/00000000-0000-0000-0000-000000000000 -> 403 Forbidden
GET fhir/R4/Bot?name=nope  (tipo SÍ permitido)         -> 200 Bundle vacío
```
Conclusión: si el tipo **no está** en la política, Medplum 5.1.42 responde **403** (búsqueda y lectura), no Bundle vacío/404. Ver pregunta 1 en `PREGUNTAS-para-Edwin.md`.
