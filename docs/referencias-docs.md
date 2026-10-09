# Documentación por proyecto y SDK

_Borrador v1 · 7 oct 2026 · acompaña a `contrato-api.md`. Para Claudio (backend), Ady (frontend), el líder de backend y el líder de frontend._

**Cómo usar esta lista:** cada enlace dice **cuándo leerlo**. Primero se lee la copia local (no gasta internet ni falla si se cae el WiFi); el enlace público es para confirmar. Las copias locales vienen del paquete (`02-Documentacion-tecnica/`) y se copian a `kit-listo/docs/` (POR-21); en el repo del evento quedan en `docs/` (POR-30):
- `kit-listo/docs/medplum-docs/…` = copia de la documentación de Medplum (la dirección pública es `https://www.medplum.com/docs/` + la misma ruta sin `.md`/`.mdx`).
- `kit-listo/docs/llms/*.txt` = resúmenes para agentes.
- ⚠️ **`kit-listo/docs/llms/medplum-llms.txt` NO sirve:** es la página de inicio de medplum.com guardada como texto (HTML), y `https://www.medplum.com/llms.txt` tampoco existe (devuelve la página de inicio). Para Medplum, usar `docs/medplum-docs/` o el servidor MCP de Medplum (ver §12). Los otros cuatro (mantine, react, vercel, vite) sí son resúmenes reales.

Versión: todo lo de Medplum se lee pensando en **5.1.42** (servidor, librerías y docs iguales). La web pública muestra la última versión: si algo no calza, manda el código de la etiqueta `v5.1.42`.

---

## 1. Medplum · servidor local (Docker)
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Running the full Medplum stack in Docker](https://www.medplum.com/docs/self-hosting/running-full-medplum-stack-in-docker) | Jueves noche, al prender Medplum en la laptop (servidor 8103, app 3000) | `kit-listo/docs/medplum-docs/self-hosting/running-full-medplum-stack-in-docker.md` |
| [Running the Medplum Docker container](https://www.medplum.com/docs/self-hosting/running-medplum-docker-container) | Si hay que entender la imagen `medplum-server` y sus variables | `kit-listo/docs/medplum-docs/self-hosting/running-medplum-docker-container.md` |
| [docker-compose.full-stack.yml en v5.1.42](https://github.com/medplum/medplum/blob/v5.1.42/docker-compose.full-stack.yml) | Para fijar la imagen en **5.1.42** (no `:latest`) | — |
| [Imágenes medplum-server (etiquetas)](https://hub.docker.com/r/medplum/medplum-server/tags) | Confirmar que la etiqueta 5.1.42 existe antes de bajarla | — |
| [Medplum v5.1.42 (release)](https://github.com/medplum/medplum/releases/tag/v5.1.42) | Saber qué trae exactamente la versión fijada | — |
| [Project settings](https://www.medplum.com/docs/self-hosting/project-settings) | POR-32: activar `bots` y `websocket-subscriptions` en el Project | `kit-listo/docs/medplum-docs/self-hosting/project-settings.md` |
| [Super admin guide](https://www.medplum.com/docs/self-hosting/super-admin-guide) | POR-32: solo un super admin cambia `features` | `kit-listo/docs/medplum-docs/self-hosting/super-admin-guide.md` |
| [Server config](https://www.medplum.com/docs/self-hosting/server-config) | Si hay que tocar la configuración del servidor (con OK del líder de backend) | `kit-listo/docs/medplum-docs/self-hosting/server-config.md` |
| [Setting up CORS](https://www.medplum.com/docs/self-hosting/setting-up-cors) | POR-51: entender por qué CORS no es el problema del enlace público | `kit-listo/docs/medplum-docs/self-hosting/setting-up-cors.md` |
| [Rate limits](https://www.medplum.com/docs/rate-limits) | Cuando el login dice "Too Many Requests" (5 por minuto por IP) | `kit-listo/docs/medplum-docs/rate-limits.md` |

## 2. Proyectos, membresías e invitaciones
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Projects](https://www.medplum.com/docs/access/projects) | POR-32: qué es un proyecto y cómo separa datos | `kit-listo/docs/medplum-docs/access/projects.md` |
| [Project (recurso)](https://www.medplum.com/docs/api/fhir/medplum/project) | Campos del Project (`features`) | `kit-listo/docs/medplum-docs/api/fhir/medplum/project.mdx` |
| [ProjectMembership (recurso)](https://www.medplum.com/docs/api/fhir/medplum/projectmembership) | POR-48/99: `access[]` con `policy` y `parameter` (lo que cambia el Bot) | `kit-listo/docs/medplum-docs/api/fhir/medplum/projectmembership.mdx` |
| [User management](https://www.medplum.com/docs/user-management) | POR-33/98: perfiles, fases del login (`auth/method`, `auth/login`, `auth/me`) | `kit-listo/docs/medplum-docs/user-management/index.md` |
| [Invite user endpoint](https://www.medplum.com/docs/api/project-admin/invite) | POR-33/99: invitar con `scope: 'project'`, `password`, `sendEmail: false`, `membership` | `kit-listo/docs/medplum-docs/api/project-admin/invite.md` |
| [Invitar desde la app](https://www.medplum.com/docs/app/invite) | Invitar a mano desde la app de administración (3000) | `kit-listo/docs/medplum-docs/app/invite/invite.md` |
| [Project vs server scoped users](https://www.medplum.com/docs/user-management/project-vs-server-scoped-users) | POR-99: por qué el familiar va con alcance de proyecto (nos pasó el 3 oct) | `kit-listo/docs/medplum-docs/user-management/project-vs-server-scoped-users.mdx` |
| [Open patient registration](https://www.medplum.com/docs/user-management/open-patient-registration) | Solo si se decide que un paciente se registre solo (no está en el MVP) | `kit-listo/docs/medplum-docs/user-management/open-patient-registration.md` |

## 3. Permisos (Access Policies)
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Access policies](https://www.medplum.com/docs/access/access-policies) | **POR-47/48/50 y API-02/11/16.** Secciones: Parameterized Policies, Patient Access, Caregiver Access, Hidden Elements, WebSocket Subscriptions, basedOn y `/auth/me` | `kit-listo/docs/medplum-docs/access/access-policies.md` |
| [Access (índice)](https://www.medplum.com/docs/access) | Vista general del control de acceso | `kit-listo/docs/medplum-docs/access/index.md` |
| [Decision guide: access control](https://www.medplum.com/docs/decision-guides/access-control) | Elegir cómo cambia la UI según el rol (`/auth/me`) | `kit-listo/docs/medplum-docs/decision-guides/access-control.md` |
| [SMART scopes](https://www.medplum.com/docs/access/smart-scopes) | Si un agente propone scopes SMART en vez de políticas (no es el plan) | `kit-listo/docs/medplum-docs/access/smart-scopes.md` |

## 4. Entrar, sesión y salir
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Authentication (índice)](https://www.medplum.com/docs/auth) | POR-58: cómo entra un usuario | `kit-listo/docs/medplum-docs/auth/index.md` |
| [Session management](https://www.medplum.com/docs/auth/session-management) | Duración y renovación de tokens (lo hace el SDK) | `kit-listo/docs/medplum-docs/auth/session-management.mdx` |
| [Logout](https://www.medplum.com/docs/auth/logout) | Botón "Salir"; `/auth/me` lista sesiones activas | `kit-listo/docs/medplum-docs/auth/logout.md` |
| [Client credentials](https://www.medplum.com/docs/auth/client-credentials) | POR-33/42: el cliente del simulador (solo en el servidor pequeño de 127.0.0.1) | `kit-listo/docs/medplum-docs/auth/client-credentials.md` |

## 5. Bots y HL7 v2
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Bots (índice)](https://www.medplum.com/docs/bots) | Antes del primer Bot | `kit-listo/docs/medplum-docs/bots/index.md` |
| [Bot basics](https://www.medplum.com/docs/bots/bot-basics) | POR-36/38: crear, guardar y **desplegar** un Bot | `kit-listo/docs/medplum-docs/bots/bot-basics.md` |
| [HL7 into FHIR](https://www.medplum.com/docs/bots/hl7-into-fhir) | POR-38 (primero) y POR-36/37/40: Bot `hl7-a-fhir` | `kit-listo/docs/medplum-docs/bots/hl7-into-fhir.mdx` |
| [Bot secrets](https://www.medplum.com/docs/bots/bot-secrets) | Si un Bot necesita una clave (nunca en el código del Bot) | `kit-listo/docs/medplum-docs/bots/bot-secrets.md` |
| [Run as user](https://www.medplum.com/docs/bots/bot-run-as-user) | POR-48: el Bot `compartir-familia` sabe quién lo llama (debe ser una Patient); permisos mínimos | `kit-listo/docs/medplum-docs/bots/bot-run-as-user.md` |
| [Bot $execute](https://www.medplum.com/docs/api/fhir/operations/bot-execute) | API-16/27: `POST Bot/<id>/$execute`, por identificador, y tipos de contenido (`application/json`, `x-application/hl7-v2+er7`) | `kit-listo/docs/medplum-docs/api/fhir/operations/bot-execute.mdx` |
| [Bot $deploy](https://www.medplum.com/docs/api/fhir/operations/bot-deploy) | Desplegar el JavaScript compilado (modo vmcontext) | `kit-listo/docs/medplum-docs/api/fhir/operations/bot-deploy.mdx` |
| [Unit testing bots](https://www.medplum.com/docs/bots/unit-testing-bots) | POR-39: pruebas con MockClient | `kit-listo/docs/medplum-docs/bots/unit-testing-bots.mdx` |
| [Running bots locally](https://www.medplum.com/docs/bots/running-bots-locally) | Si hay que probar un Bot sin desplegarlo | `kit-listo/docs/medplum-docs/bots/running-bots-locally.md` |
| [Bot cron job](https://www.medplum.com/docs/bots/bot-cron-job) | Solo si algo debe correr cada X minutos (no está en el MVP) | `kit-listo/docs/medplum-docs/bots/bot-cron-job.md` |
| [HL7 interfacing (índice)](https://www.medplum.com/docs/integration/hl7-interfacing) | POR-41: panorama de HL7 v2 en Medplum | `kit-listo/docs/medplum-docs/integration/hl7-interfacing/index.md` |
| [ADT](https://www.medplum.com/docs/integration/hl7-interfacing/adt) | POR-36/53: A04, A08, A02, A03, A06/A01 → Encounter | `kit-listo/docs/medplum-docs/integration/hl7-interfacing/adt.md` |
| [Orders and results](https://www.medplum.com/docs/integration/hl7-interfacing/orders-and-results) | POR-37/38/40: ORM, ORU (OBR-25 P/F/C) y medicinas | `kit-listo/docs/medplum-docs/integration/hl7-interfacing/orders-and-results.md` |
| [Results and review](https://www.medplum.com/docs/labs-imaging/results-and-review) | POR-38/63: cómo se guardan y muestran resultados | `kit-listo/docs/medplum-docs/labs-imaging/results-and-review.md` |
| [Ejemplo lab-integration (v5.1.42)](https://github.com/medplum/medplum/tree/v5.1.42/examples/medplum-demo-bots/src/lab-integration) | POR-37/38/39: ejemplo de ORM/ORU y sus pruebas (leer, no copiar) | `medplum-link/examples/medplum-demo-bots/src/lab-integration/` |
| [SDK: Hl7Message](https://www.medplum.com/docs/sdk/core.hl7message) | Leer segmentos y campos del mensaje y armar el ACK | — |

RAS^O17 (medicinas administradas) **no** tiene guía propia en Medplum: se hace igual que ORU, leyendo los segmentos RXA (ver orders-and-results).

## 6. Suscripciones y tiempo real
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [useSubscription](https://www.medplum.com/docs/react/use-subscription) | **POR-64 / API-11**: criterio, forma del Bundle (entrada 0 estado, entrada 1 recurso), permisos necesarios | `kit-listo/docs/medplum-docs/react/use-subscription.mdx` |
| [Subscriptions (índice)](https://www.medplum.com/docs/subscriptions) | Qué es una Subscription en Medplum | `kit-listo/docs/medplum-docs/subscriptions/index.md` |
| [Publish and subscribe](https://www.medplum.com/docs/subscriptions/publish-and-subscribe) | Si un Bot debe correr solo al crearse un recurso (por ejemplo, POR-55) | `kit-listo/docs/medplum-docs/subscriptions/publish-and-subscribe.md` |
| [Subscription (recurso)](https://www.medplum.com/docs/api/fhir/resources/subscription) | Regla clave: **no hay aviso cuando se borra un recurso** | `kit-listo/docs/medplum-docs/api/fhir/resources/subscription.mdx` |
| [Ejemplo websocket-subscriptions-demo (v5.1.42)](https://github.com/medplum/medplum/tree/v5.1.42/examples/medplum-websocket-subscriptions-demo) | POR-64: ejemplo completo de tiempo real (leer, no copiar) | `medplum-link/examples/medplum-websocket-subscriptions-demo/` |

## 7. Búsquedas
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Search (índice)](https://www.medplum.com/docs/search) | Antes de escribir cualquier búsqueda del contrato | `kit-listo/docs/medplum-docs/search/index.md` |
| [Basic search](https://www.medplum.com/docs/search/basic-search) | Parámetros, `_sort`, `_count` (API-05 a API-14) | `kit-listo/docs/medplum-docs/search/basic-search.mdx` |
| [Chained search](https://www.medplum.com/docs/search/chained-search) | Si una búsqueda necesita pasar por otro recurso | `kit-listo/docs/medplum-docs/search/chained-search.md` |
| [Includes](https://www.medplum.com/docs/search/includes) | `_include` / `_revinclude` (API-09 opcional, API-23). Probar que no revelan nada al familiar | `kit-listo/docs/medplum-docs/search/includes.mdx` |
| [Paginated search](https://www.medplum.com/docs/search/paginated-search) | Listas largas (avisos, auditoría) | `kit-listo/docs/medplum-docs/search/paginated-search.mdx` |
| [Advanced search parameters](https://www.medplum.com/docs/search/advanced-search-parameters) | `_security:not` (lo sensible) y otros parámetros especiales | `kit-listo/docs/medplum-docs/search/advanced-search-parameters.mdx` |

## 8. Leer, crear, actualizar y borrar datos
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [FHIR basics](https://www.medplum.com/docs/fhir-basics) | Primera lectura para entender recursos y referencias | `kit-listo/docs/medplum-docs/fhir-basics.md` |
| [Reading data](https://www.medplum.com/docs/fhir-datastore/reading-data) | Lecturas por id y referencias | `kit-listo/docs/medplum-docs/fhir-datastore/reading-data.md` |
| [Creating data](https://www.medplum.com/docs/fhir-datastore/creating-data) | Bots y seed; creación condicional para no duplicar | `kit-listo/docs/medplum-docs/fhir-datastore/creating-data.md` |
| [Updating data](https://www.medplum.com/docs/fhir-datastore/updating-data) | **If-Match** y error 412 (contrato §1.4) | `kit-listo/docs/medplum-docs/fhir-datastore/updating-data.md` |
| [Deleting data](https://www.medplum.com/docs/fhir-datastore/deleting-data) | "Reiniciar" del simulador (destructivo: con OK humano) | `kit-listo/docs/medplum-docs/fhir-datastore/deleting-data.md` |

## 9. Consentimiento y familia
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Consent](https://www.medplum.com/docs/consent) | POR-48/68: el Consent es **registro**; no aplica permisos | `kit-listo/docs/medplum-docs/consent/index.mdx` |
| [Family relationships](https://www.medplum.com/docs/fhir-datastore/family-relationships) | POR-99/101: modelos Patient ↔ RelatedPerson | `kit-listo/docs/medplum-docs/fhir-datastore/family-relationships/family-relationships.mdx` |
| [Person (recurso)](https://www.medplum.com/docs/api/fhir/resources/person) | POR-101/102: una cuenta, dos roles | `kit-listo/docs/medplum-docs/api/fhir/resources/person.mdx` |
| [RelatedPerson (recurso)](https://www.medplum.com/docs/api/fhir/resources/relatedperson) | POR-99: el familiar | `kit-listo/docs/medplum-docs/api/fhir/resources/relatedperson.mdx` |
| [Patient (recurso)](https://www.medplum.com/docs/api/fhir/resources/patient) | POR-35/98: la ficha (MRN, dos apellidos) | `kit-listo/docs/medplum-docs/api/fhir/resources/patient.mdx` |

## 10. Otras funciones del portal
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Communications](https://www.medplum.com/docs/communications) | POR-45/65/76: avisos y mensajes | `kit-listo/docs/medplum-docs/communications/index.md` |
| [Medications](https://www.medplum.com/docs/medications) | POR-40/46/66: recetas y medicinas | `kit-listo/docs/medplum-docs/medications/index.md` |
| [Scheduling](https://www.medplum.com/docs/scheduling) | POR-46: la cita (beta) | `kit-listo/docs/medplum-docs/scheduling/index.md` |
| [Appointment confirm](https://www.medplum.com/docs/scheduling/appointment-confirm) | POR-54/78: confirmar la cita (AppointmentResponse) | `kit-listo/docs/medplum-docs/scheduling/appointment-confirm.md` |
| [Timezones](https://www.medplum.com/docs/scheduling/timezones) | Horas en America/Puerto_Rico | `kit-listo/docs/medplum-docs/scheduling/timezones.md` |
| [Questionnaires](https://www.medplum.com/docs/questionnaires) | POR-55/80: pre-registro | `kit-listo/docs/medplum-docs/questionnaires/index.md` |
| [Questionnaires: basic tutorial](https://www.medplum.com/docs/questionnaires/basic-tutorial) | POR-80: formulario y respuesta | `kit-listo/docs/medplum-docs/questionnaires/basic-tutorial.md` |
| [Questionnaires and responses](https://www.medplum.com/docs/questionnaires/questionnaires-and-responses) | POR-55: leer la respuesta en el backend | `kit-listo/docs/medplum-docs/questionnaires/questionnaires-and-responses.md` |
| [Electronic prior auth](https://www.medplum.com/docs/integration/electronic-prior-auth) | POR-57/82: pre-autorización (simulada) | `kit-listo/docs/medplum-docs/integration/electronic-prior-auth.md` |
| [Billing](https://www.medplum.com/docs/billing) | POR-57: Claim/ClaimResponse en Medplum | `kit-listo/docs/medplum-docs/billing/index.md` |
| [AuditEvent (recurso)](https://www.medplum.com/docs/api/fhir/resources/auditevent) | POR-52/75: "¿Quién vio mi récord?" | `kit-listo/docs/medplum-docs/api/fhir/resources/auditevent.mdx` |
| [Patient $everything](https://www.medplum.com/docs/api/fhir/operations/patient-everything) | POR-73: récord completo | `kit-listo/docs/medplum-docs/api/fhir/operations/patient-everything.md` |

## 11. Medplum para React, mock y componentes
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [React (índice)](https://www.medplum.com/docs/react) | POR-34/58: `MedplumProvider`, hooks y componentes | `kit-listo/docs/medplum-docs/react/index.mdx` |
| [useSubscription](https://www.medplum.com/docs/react/use-subscription) | (ya listado en §6) | `kit-listo/docs/medplum-docs/react/use-subscription.mdx` |
| [Storybook de Medplum](https://storybook.medplum.com/) | Ver componentes listos (`SignInForm`, `QuestionnaireForm`…) antes de construir uno | — |
| [Paquete react-hooks (v5.1.42)](https://github.com/medplum/medplum/tree/v5.1.42/packages/react-hooks) | Lista real de hooks: `useMedplum`, `useMedplumProfile`, `useSubscription`, `useSearchResources`, `useSearchOne`, `useResource` (no hay páginas del SDK para hooks) | `medplum-link/packages/react-hooks/` |
| [MockClient (código, v5.1.42)](https://github.com/medplum/medplum/blob/v5.1.42/packages/mock/src/client.ts) | POR-34: modo mock. Ojo: no aplica permisos, no ejecuta Bots y su `auth/me` devuelve un médico de ejemplo | `medplum-link/packages/mock/src/client.ts` |

### SDK · métodos de MedplumClient que cita el contrato
| Método | Para qué (API-xx) | Página |
|---|---|---|
| (clase) | Visión general del cliente | [core.medplumclient](https://www.medplum.com/docs/sdk/core.medplumclient) |
| `startLogin` | Entrar (API-01; lo usa `SignInForm`) | [startlogin](https://www.medplum.com/docs/sdk/core.medplumclient.startlogin) |
| `processCode` | Cambiar el código por tokens (API-01) | [processcode](https://www.medplum.com/docs/sdk/core.medplumclient.processcode) |
| `signOut` | Salir (API-01) | [signout](https://www.medplum.com/docs/sdk/core.medplumclient.signout) |
| `getProfile` | Perfil de la sesión (API-03) | [getprofile](https://www.medplum.com/docs/sdk/core.medplumclient.getprofile) |
| `getActiveLogin` | Datos del login activo (proyecto) | [getactivelogin](https://www.medplum.com/docs/sdk/core.medplumclient.getactivelogin) |
| `getAccessPolicy` | Copia de la política del login (no usar para candados; ver API-02) | [getaccesspolicy](https://www.medplum.com/docs/sdk/core.medplumclient.getaccesspolicy) |
| `get` | `auth/me` sin caché (API-02, API-17) | [get](https://www.medplum.com/docs/sdk/core.medplumclient.get) |
| `readResource` | Leer por id (API-04, API-08) | [readresource](https://www.medplum.com/docs/sdk/core.medplumclient.readresource) |
| `readReference` | Leer por referencia (API-03, API-08) | [readreference](https://www.medplum.com/docs/sdk/core.medplumclient.readreference) |
| `searchResources` | Listas (API-05, 09, 10, 12–15, 20, 23, 24) | [searchresources](https://www.medplum.com/docs/sdk/core.medplumclient.searchresources) |
| `searchOne` | Un solo resultado (API-06, 15, 16, 19, 21) | [searchone](https://www.medplum.com/docs/sdk/core.medplumclient.searchone) |
| `search` | Bundle completo (paginación) | [search](https://www.medplum.com/docs/sdk/core.medplumclient.search) |
| `createResource` | AppointmentResponse, QuestionnaireResponse, Communication (API-20, 22, 25); Bots | [createresource](https://www.medplum.com/docs/sdk/core.medplumclient.createresource) |
| `updateResource` | Solo backend, con If-Match (§1.4) | [updateresource](https://www.medplum.com/docs/sdk/core.medplumclient.updateresource) |
| `patchResource` | Cambios parciales (backend) | [patchresource](https://www.medplum.com/docs/sdk/core.medplumclient.patchresource) |
| `deleteResource` | "Reiniciar" del simulador (API-27) | [deleteresource](https://www.medplum.com/docs/sdk/core.medplumclient.deleteresource) |
| `executeBot` | `compartir-familia` (API-16/17) y `hl7-a-fhir` (API-27) | [executebot](https://www.medplum.com/docs/sdk/core.medplumclient.executebot) |
| `invite` | Cuentas demo (POR-33/99) | [invite](https://www.medplum.com/docs/sdk/core.medplumclient.invite) |
| `startClientLogin` | Cliente del simulador, solo en 127.0.0.1 (API-27) | [startclientlogin](https://www.medplum.com/docs/sdk/core.medplumclient.startclientlogin) |
| `getSubscriptionManager` | El WebSocket compartido de `useSubscription` (API-11) | [getsubscriptionmanager](https://www.medplum.com/docs/sdk/core.medplumclient.getsubscriptionmanager) |
| `isLoading` | Saber si la sesión todavía se está cargando | [isloading](https://www.medplum.com/docs/sdk/core.medplumclient.isloading) |

Los hooks de React (`useSubscription`, `useMedplumProfile`, etc.) **no tienen página en el SDK** (comprobado): se leen en [React](https://www.medplum.com/docs/react), [useSubscription](https://www.medplum.com/docs/react/use-subscription) y el paquete react-hooks.

## 12. Trabajo con agentes
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [Building with AI coding assistants](https://www.medplum.com/docs/building-with-ai-coding-assistants) | Antes de empezar: cómo darle a Claudio/Ady la documentación correcta de Medplum (y cuidar R4 vs R5) | `kit-listo/docs/medplum-docs/building-with-ai-coding-assistants.md` |
| [Medplum MCP](https://www.medplum.com/docs/ai/mcp) | Conectar el MCP de Medplum (docs y datos); sustituye al `llms.txt` de Medplum, que no existe | `kit-listo/docs/medplum-docs/ai/mcp.md` |
| [Mantine llms.txt](https://mantine.dev/llms.txt) | Resumen de Mantine para Ady | `kit-listo/docs/llms/mantine-llms.txt` |
| [React llms.txt](https://react.dev/llms.txt) | Resumen de React | `kit-listo/docs/llms/react-llms.txt` |
| [Vite llms.txt](https://vite.dev/llms.txt) | Resumen de Vite | `kit-listo/docs/llms/vite-llms.txt` |
| [Vercel llms.txt](https://vercel.com/llms.txt) | Índice de Vercel (la copia local es muy grande: buscar dentro, no leerla entera) | `kit-listo/docs/llms/vercel-llms.txt` |

## 13. FHIR R4 (especificación oficial, por recurso del contrato)
Leer cuando haya duda de un campo o de un parámetro de búsqueda (al final de cada página: "Search Parameters").

| Recurso | API-xx | Enlace |
|---|---|---|
| Patient | 03, 04 | [patient](https://hl7.org/fhir/R4/patient.html) |
| RelatedPerson | 03, 15 | [relatedperson](https://hl7.org/fhir/R4/relatedperson.html) |
| Person | 03 | [person](https://hl7.org/fhir/R4/person.html) |
| Encounter | 05, 19 | [encounter](https://hl7.org/fhir/R4/encounter.html) |
| Task | 06, 07, 20 | [task](https://hl7.org/fhir/R4/task.html) |
| Practitioner | 08 | [practitioner](https://hl7.org/fhir/R4/practitioner.html) |
| Location | 05, 08, 19 | [location](https://hl7.org/fhir/R4/location.html) |
| Organization | 05, 23 | [organization](https://hl7.org/fhir/R4/organization.html) |
| ServiceRequest | 09 | [servicerequest](https://hl7.org/fhir/R4/servicerequest.html) |
| Specimen | 09 | [specimen](https://hl7.org/fhir/R4/specimen.html) |
| DiagnosticReport | 09, 10 | [diagnosticreport](https://hl7.org/fhir/R4/diagnosticreport.html) |
| Observation | 10, 18 | [observation](https://hl7.org/fhir/R4/observation.html) |
| Communication | 12, 25 | [communication](https://hl7.org/fhir/R4/communication.html) |
| MedicationAdministration | 13 | [medicationadministration](https://hl7.org/fhir/R4/medicationadministration.html) |
| MedicationRequest | 14 | [medicationrequest](https://hl7.org/fhir/R4/medicationrequest.html) |
| CarePlan | 14 | [careplan](https://hl7.org/fhir/R4/careplan.html) |
| Appointment | 14, 20 | [appointment](https://hl7.org/fhir/R4/appointment.html) |
| AppointmentResponse | 20 | [appointmentresponse](https://hl7.org/fhir/R4/appointmentresponse.html) |
| DocumentReference | 20 | [documentreference](https://hl7.org/fhir/R4/documentreference.html) |
| Consent | 15, 16, 17 | [consent](https://hl7.org/fhir/R4/consent.html) |
| Claim / ClaimResponse | 21 | [claim](https://hl7.org/fhir/R4/claim.html) · [claimresponse](https://hl7.org/fhir/R4/claimresponse.html) |
| Questionnaire / QuestionnaireResponse | 22 | [questionnaire](https://hl7.org/fhir/R4/questionnaire.html) · [questionnaireresponse](https://hl7.org/fhir/R4/questionnaireresponse.html) |
| Coverage | 22 | [coverage](https://hl7.org/fhir/R4/coverage.html) |
| HealthcareService | 23 | [healthcareservice](https://hl7.org/fhir/R4/healthcareservice.html) |
| AuditEvent | 24 | [auditevent](https://hl7.org/fhir/R4/auditevent.html) |
| Provenance | 27 | [provenance](https://hl7.org/fhir/R4/provenance.html) |
| Subscription | 11 | [subscription](https://hl7.org/fhir/R4/subscription.html) |
| Bundle / OperationOutcome | §1.3 | [bundle](https://hl7.org/fhir/R4/bundle.html) · [operationoutcome](https://hl7.org/fhir/R4/operationoutcome.html) |
| Búsqueda (reglas generales) | todas | [search](https://hl7.org/fhir/R4/search.html) |
| REST, versiones e If-Match | §1.4 | [http](https://hl7.org/fhir/R4/http.html) |
| Etiquetas de seguridad | 18 | [security-labels](https://hl7.org/fhir/R4/security-labels.html) · [código R (v3-Confidentiality)](https://terminology.hl7.org/CodeSystem-v3-Confidentiality.html) |
| Pre-autorización (Da Vinci PAS) | 21 | [davinci-pas](https://build.fhir.org/ig/HL7/davinci-pas/) |

HL7 v2 (ADT, ORM, ORU, RAS): las referencias que hay en Medplum son las de §5 (ADT y orders-and-results). Para los segmentos exactos del caso, manda `docs/caso-de-prueba.csv`.

## 14. foomedical (base del portal) y ejemplos
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [foomedical en v5.1.42](https://github.com/medplum/medplum/tree/v5.1.42/examples/foomedical) | POR-29: la base exacta del repo (versión fijada). Variables `MEDPLUM_BASE_URL`, `MEDPLUM_PROJECT_ID`; su Vite usa el puerto 3000 → cambiar a **3001** | `medplum-link/examples/foomedical/` (verificar que el clon esté en la etiqueta v5.1.42) |
| [Repositorio foomedical](https://github.com/medplum/foomedical) | Créditos para el README (Apache 2.0) | — |

## 15. React, Vite, Mantine, Vercel, Docker y accesibilidad
| Enlace | Cuándo leerlo | Copia local |
|---|---|---|
| [React](https://react.dev/) | Dudas generales de React 19 | `kit-listo/docs/llms/react-llms.txt` |
| [useEffect](https://react.dev/reference/react/useEffect) | Limpiar suscripciones y respuestas tardías al cambiar de paciente | — |
| [Vite: env variables and modes](https://vite.dev/guide/env-and-mode) | Por qué **toda** variable del portal es pública; `.env` y modos | `kit-listo/docs/llms/vite-llms.txt` |
| [Vite: shared options (envPrefix)](https://vite.dev/config/shared-options) | foomedical solo deja pasar variables `MEDPLUM_` | — |
| [Vite: server options (port)](https://vite.dev/config/server-options) | Puerto 3001 de la app del evento | — |
| [Mantine](https://mantine.dev/) | Componentes de la UI (Mantine 8) | `kit-listo/docs/llms/mantine-llms.txt` |
| [Mantine AppShell](https://mantine.dev/core/app-shell/) | POR-59: estructura con pestañas | — |
| [Mantine Switch](https://mantine.dev/core/switch/) | POR-68: interruptores de la familia | — |
| [Mantine Notifications](https://mantine.dev/x/notifications/) | POR-64: notificación corta al llegar algo | — |
| [Vercel docs](https://vercel.com/docs) | POR-72: publicar | `kit-listo/docs/llms/vercel-llms.txt` |
| [Vercel environment variables](https://vercel.com/docs/environment-variables) | POR-72: solo valores públicos en el panel | — |
| [Vercel + Vite](https://vercel.com/docs/frameworks/frontend/vite) | Configuración de un proyecto Vite | — |
| [Vercel rewrites](https://vercel.com/docs/rewrites) | Regla SPA (todas las rutas a la página principal; foomedical ya la trae en `vercel.json`) | — |
| [Vercel project configuration](https://vercel.com/docs/project-configuration) | Qué va en `vercel.json` | — |
| [Docker Compose](https://docs.docker.com/compose/) | Prender/apagar Medplum con compose | — |
| [Compose file reference](https://docs.docker.com/reference/compose-file/) | Fijar la imagen 5.1.42 en el archivo | — |
| [SpeechSynthesis (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) | POR-70: leer en voz alta | — |
| [WCAG 2.2 referencia rápida](https://www.w3.org/WAI/WCAG22/quickref/) | POR-70: contraste, foco, tamaño de botones | — |

---

**Enlaces descartados en la verificación** (no se usan): `medplum.com/docs/subscriptions/websocket-subscriptions` y `medplum.com/docs/fhir-datastore/family-relationships/family-relationships` (devuelven la portada), `medplum.com/llms.txt` y `llms-full.txt` (devuelven la portada), páginas del SDK para hooks y componentes de React y para MockClient (no existen).

Enlaces verificados el 7 oct 2026 (163/163)
