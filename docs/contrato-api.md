# Contrato backend ↔ frontend

_Borrador v1 · 7 oct 2026 · para aprobar en POR-31 (contract), jueves 8 en la noche. Lo escribe el kit (antes del evento) para el líder de backend/Claudio (backend) y el líder de frontend/Ady (frontend). Fuente de verdad: `DECISIONES-CANON.md`; después, SPEC, `DISENO-cuidadores-y-login.md` y el backlog. Sin código: aquí solo van rutas, búsquedas, nombres de campos y tablas._

**Cómo se usa (skill contrato-y-mock):** cada entrada API-xx es un acuerdo. El líder de frontend (Ady) construye la pantalla contra el mock con lo que dice la columna "Mock"; el líder de backend (Claudio) construye el servidor para que responda lo mismo. Si algo cambia: subir la versión (v2), avisar en el hilo ANTES de tocarlo y decir qué se rompe. Lo marcado **(no probado)** pasa a "pasa/falla" solo con una prueba contra el Medplum real del evento. Lo marcado **(propuesto)** se confirma en POR-31.

**Lo que se aprendió en la práctica** (`practica-app/`, ensayo que NO se copia): sirve para saber qué funcionó; aquí se describe en palabras.

---

## 1. Reglas generales

### 1.1 Dónde está el servidor (mock o real, una sola línea)
| Qué | Valor |
|---|---|
| Servidor Medplum (real) | `http://<laptop del líder de backend>:8103/` (versión fija **5.1.42**, nunca `:latest`) |
| Base FHIR | `<base>fhir/R4/` |
| Rutas de entrada | `<base>auth/method`, `<base>auth/login`, `<base>auth/me`, `<base>oauth2/token` |
| Tiempo real (WebSocket) | `<base>ws/subscriptions-r4` (lo abre el SDK solo) |
| App de administración de Medplum | puerto **3000** (no tocar) |
| App del evento (portal) | puerto **3001** (foomedical trae 3000 en su configuración de Vite: hay que cambiarlo a 3001) |
| Variables del portal | foomedical solo deja pasar variables que empiezan con `MEDPLUM_`: `MEDPLUM_BASE_URL`, `MEDPLUM_PROJECT_ID`, `MEDPLUM_CLIENT_ID` (opcional) |
| Interruptor mock / real | **una línea** en `.env`: `MEDPLUM_USE_MOCK=true` → MockClient con el seed; quitarla o `false` → servidor real **(propuesto: nombre de la variable)** |

- **Toda variable del portal es pública** (Vite la mete en el JavaScript que descarga cualquiera). En `.env` del portal y en Vercel van solo direcciones e ids públicos. Nunca contraseñas, secretos de cliente ni la llave del simulador.
- Los botones de "entrar con un clic" de demo (POR-102) solo con una variable del `.env` local de la laptop; **nunca** en Vercel (llevarían contraseñas al navegador).
- El enlace público de Vercel funciona en modo mock (POR-51, POR-72).

### 1.2 Entrada y sesión
- Login de **dos pasos** (Medplum 5.1.42): email → botón "Continue" → contraseña → entrar. Lo hace el componente `SignInForm` de `@medplum/react` que ya usa foomedical (`SignInPage`). No se cambia cómo se autentica.
- Los tokens los guarda y renueva `MedplumClient` (el SDK). La app no guarda tokens, contraseñas ni datos clínicos por su cuenta (ni en localStorage, ni en la URL, ni en logs).
- Se entra siempre con **email**. El MRN es interno (nunca usuario). El seguro social no existe en ningún lado (POR-98).
- Límite de Medplum: **5 intentos de login por minuto por IP** ("Too Many Requests"); el resto, 6,000 por minuto.

### 1.3 Respuestas sin permiso (canon §4, regla única)
| Caso | Respuesta que aceptan las pruebas | Qué hace la pantalla |
|---|---|---|
| Búsqueda de algo no autorizado | **200 con Bundle vacío** (no error) | Si auth/me dice que no hay permiso → candado. Si hay permiso y viene vacío → "Todavía no hay…" |
| Lectura por id no autorizada | **404**, igual que si no existiera | Igual que inexistente; nunca "no te dejan ver X" con el nombre |
| Escritura rechazada | **403** | Mensaje amable "No tiene permiso para hacer esto" |
| Sesión vencida | 401 | Volver al login |
| Error del servidor o de red | 5xx / sin respuesta | "No pudimos cargar. Reintentar" (es error técnico, no privacidad) |

- **El candado sale de auth/me (API-02), nunca de "vino vacío" ni de un error.**
- ⚠️ **Comprobado en el servidor del evento (Medplum 5.1.42, 9 oct ~00:20):** si el **tipo de recurso no está** en la política del usuario, Medplum responde **403** tanto a la búsqueda como a la lectura por id (no Bundle vacío ni 404). Si el tipo **sí** está en la política pero no hay coincidencias, responde **200 con Bundle vacío**. **Decisión pendiente del líder de backend** (ajustar la tabla de arriba al comportamiento real o forzar Bundle vacío en el servidor). Mientras tanto la regla del frontend no cambia: **cualquier lectura fallida de un tipo sin permiso es candado si auth/me dice que no hay permiso, y error técnico si auth/me dice que sí lo hay.**

### 1.4 Actualizaciones y versiones (If-Match)
- Cada recurso tiene identidad `resourceType/id` y versión `meta.versionId`. Una corrección es una **versión nueva** del mismo recurso, no un duplicado (QA-10). La identidad del hospital es `identifier.system|value`. `meta.source` es solo procedencia, nunca clave.
- Toda actualización hecha por el backend (Task de etapa, Appointment, membresías en el Bot) se hace **condicionada a la versión**: cabecera `If-Match: W/"<meta.versionId>"` (en el SDK, la opción ifMatch). Si responde **412**, releer, fusionar y reintentar. Nunca escribir desde una copia vieja **(no probado en 5.1.42)**.
- El frontend **no actualiza** recursos: solo lee, crea los pocos recursos que dice este contrato (AppointmentResponse, QuestionnaireResponse, Communication de pregunta) y ejecuta el Bot `compartir-familia`.

### 1.5 Identificadores de los datos sintéticos
- En el **mock** los ids son legibles y fijos. En el **servidor real** Medplum pone ids largos (UUID) y la invitación crea el Patient de Carmen: **el frontend nunca escribe un id fijo**; saca al paciente del perfil de la sesión (API-03).

| Recurso | Id en el mock | En el real se encuentra por |
|---|---|---|
| Carmen (paciente) | `Patient/carmen` (SPEC §6) | perfil de su sesión; MRN `MRN-0001` |
| Lourdes como paciente | `Patient/lourdes` (propuesto) | `Person` de su cuenta; MRN `MRN-0002` |
| Lourdes como cuidadora | `RelatedPerson/lourdes` (propuesto) | perfil de su sesión |
| Rafael (cuidador) | `RelatedPerson/rafael` (propuesto) | perfil de su sesión |
| Enlace de los dos roles de Lourdes | `Person/lourdes` (propuesto) | `Person?relatedperson=<su RelatedPerson>` |
| Hospital | `Organization/hospital-demo` (SPEC §6) | nombre "Hospital Demo" |
| Visita a Emergencias | `Encounter/visita-er` (SPEC §6) | API-05 |
| Orden del hemograma | `ServiceRequest/hemograma` (SPEC §6) | API-09 |
| Glóbulos blancos | `Observation/wbc` (SPEC §6) | API-10 |

**Sistemas de identificadores y códigos (propuesto; los usan el Bot y las pantallas):**
| Uso | `system` | Valores |
|---|---|---|
| MRN del hospital | `urn:hospital-demo:mrn` | `MRN-0001`, `MRN-0002` |
| Número de visita (PV1-19) | `urn:hospital-demo:visita` | `V-0001` |
| Número de orden (OBR-2) | `urn:hospital-demo:orden` | uno por estudio |
| Tipo de tarea (`Task.code`) | `urn:portal:tarea` | `etapa` (una por visita) · `tramite` (POR-54) |
| Categoría de cada aviso (`Communication.category`) | `urn:portal:aviso` | `visita` · `medicina` · `estudios` · `resultado` · y `neutral-familia` (segunda categoría del aviso "Hay un resultado nuevo (privado)") |
| Categorías que comparte la paciente (`Consent.provision.class` y entrada del Bot) | `urn:portal:compartir` | `visita` (la base) · `medicinas` · `instrucciones` · `estudios` |
| Dato sensible (`meta.security`) | `http://terminology.hl7.org/CodeSystem/v3-Confidentiality` | `R` |
| Marca de simulado (`meta.tag`) | `urn:portal:origen` | `simulado` |

### 1.6 Lo sensible y las categorías (canon §3)
- 4 categorías elegidas por la paciente **para cada persona**: Estado en Emergencias (la base) · Medicinas · Instrucciones del alta y cita · Estudios y resultados. "Sin acceso" = política **vacía**; **nunca** una membresía sin entradas (sin entradas = acceso a todo el proyecto).
- Una AccessPolicy por categoría, parametrizada por `%patient`; la membresía del familiar lleva una entrada por categoría autorizada. El Bot `compartir-familia` las cambia. El `Consent` es **solo el registro**.

| Categoría (`urn:portal:compartir`) | Nombre de la política (como en la práctica) | Recursos que deja leer (solo lectura, solo de esa paciente) | Avisos que deja leer |
|---|---|---|---|
| `visita` (base) | "Familiar: estado en Emergencias" | Patient (sin `identifier`, `address`, `telecom`), Encounter, Task | `visita` |
| `medicinas` | "Familiar: medicinas" | MedicationAdministration, MedicationRequest | `medicina` |
| `instrucciones` | "Familiar: instrucciones del alta" | CarePlan, Appointment | — |
| `estudios` | "Familiar: estudios y resultados" | ServiceRequest, Specimen, DiagnosticReport, Observation | `estudios`, `resultado` |
| (ninguna) | "Familiar sin acceso" (vacía) | nada | nada |
| Todas las anteriores, siempre | — | Practitioner, Location, Organization (sin criterio) y crear su propia Subscription: `Subscription?type=websocket&author=%profile` | — |

- **Lo sensible:** en el criterio de CADA tipo clínico de las políticas de familia va `_security:not=http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R` (funcionó en la práctica). La paciente sí ve lo suyo.
- La política de **paciente** ("Paciente (portal)") deja leer todo lo de `%patient`, su `Consent`, sus `RelatedPerson`, su `Person`, el Bot `compartir-familia` (`Bot?name=compartir-familia`), Practitioner/Location/Organization y crear su Subscription.

### 1.7 Hora
- Zona: **America/Puerto_Rico** (UTC−4, sin cambio de horario). El backend guarda las horas con su desfase (`2026-10-09T08:12:00-04:00`). La pantalla muestra con `es-PR` y esa zona. Nunca "hora del navegador" sin zona.

### 1.8 Tiempo real (resumen; detalle en API-11)
- `useSubscription` (de `@medplum/react`) crea una Subscription en memoria y comparte **un solo WebSocket**. La notificación llega como Bundle: entrada 0 = estado de la suscripción; entrada 1 = el recurso que cambió.
- **No avisa cuando se BORRA un recurso** (regla FHIR). Por eso "Reiniciar" del simulador no se ve solo: recargar el portal es parte del guion.
- **No avisa cuando cambia un permiso.** Ver API-17 (cómo se entera la pantalla abierta del familiar).
- La notificación es un **aviso, no la verdad**: al recibirla, volver a leer (primero permisos si aplica, luego datos).

---

## 2. Entradas del contrato

Notación: `<base>` = `MEDPLUM_BASE_URL`. `<P>` = referencia del paciente que se está viendo (rol activo), por ejemplo `Patient/carmen` en el mock. `<E>` = referencia de la visita actual (`Encounter/…`). Todas las búsquedas van a `GET <base>fhir/R4/<búsqueda>`.

### API-01 · Entrar, salir y sesión
| Campo | Detalle |
|---|---|
| Para qué (front) | Pantalla de entrada y botón "Salir" · **POR-58** login · POR-102 (botones de demo, solo local) |
| Lo produce (back) | **POR-33** demo-users (cuentas por invitación) · **POR-98** identity-login · POR-99 (invitar familiares con `scope: 'project'`) |
| Recurso(s) | Login, ProjectMembership, perfil (Patient o RelatedPerson) |
| Operación | `POST <base>auth/method` (paso 1: email) → `POST <base>auth/login` (paso 2: contraseña, con `projectId`) → `POST <base>oauth2/token` (código → tokens). Salir: lo hace el SDK (`signOut`) y revoca el token |
| Quién puede | Carmen, Lourdes, Rafael (cuentas demo). Admin y cliente del simulador **no** entran al portal |
| Respuesta y sin permiso | OK → la sesión queda en el SDK y `getProfile()` devuelve el perfil. Contraseña mala → mensaje del formulario. 6.º intento en un minuto → "Too Many Requests" (esperar 1 min). 401 en cualquier llamada después → volver al login |
| Tiempo real | No |
| Mock | MockClient arranca con el perfil de la cuenta escogida en un selector de demo del mock (Carmen, Lourdes o Rafael); no pide contraseña |
| SDK | `SignInForm` (con `projectId` = `MEDPLUM_PROJECT_ID`), `startLogin`, `processCode`, `signOut`, `useMedplumProfile` |
| Docs | [auth](https://www.medplum.com/docs/auth) · [user-management](https://www.medplum.com/docs/user-management) · [logout](https://www.medplum.com/docs/auth/logout) · [rate-limits](https://www.medplum.com/docs/rate-limits) |

### API-02 · ¿Qué puede ver esta sesión? (auth/me → candados por paciente)
| Campo | Detalle |
|---|---|
| Para qué (front) | Decidir "privado" (candado) **por paciente y por categoría** · **POR-69** ui-family-view · **POR-102** selector de rol · POR-62, POR-63, POR-66, POR-67, POR-68 (el familiar ve sus ✓/candados) · POR-64 (a qué suscribirse) |
| Lo produce (back) | **POR-47** policy-patient · **POR-48** policy-family · POR-49, POR-99, POR-101 |
| Recurso(s) | AccessPolicy ya combinada de la membresía |
| Operación | `GET <base>auth/me` **sin caché**. Devuelve `user`, `project`, `membership`, `profile` y `accessPolicy` (la política combinada, con `%patient` **ya sustituido** por la referencia real) |
| Regla para decidir la categoría | Para el paciente `<P>`, la categoría está permitida si `accessPolicy.resource[]` tiene una entrada del **tipo representante** cuyo `criteria` contiene el id de `<P>` (o no tiene criterio). Representantes: `visita` → Encounter · `medicinas` → MedicationRequest · `instrucciones` → CarePlan · `estudios` → DiagnosticReport. Si la sesión es la propia paciente (rol "Mi salud"), todo permitido |
| Quién puede | Toda sesión lee su propio auth/me |
| Respuesta y sin permiso | Siempre 200 con su política. Familiar sin acceso → no hay entradas con ese paciente (todas las categorías con candado) |
| Tiempo real | No (no hay evento de permisos). Se vuelve a pedir: al entrar, al cambiar de rol, al volver al foco de la ventana, después de ejecutar el Bot y **cada 5 s en la vista del familiar** (propuesto, ver API-17) |
| Mock | **MockClient no aplica permisos** y su auth/me devuelve un médico de ejemplo. El mock usa un archivo de 3 políticas de ejemplo (Carmen: todo; Lourdes: visita + medicinas + instrucciones para `Patient/carmen` y todo para `Patient/lourdes`; Rafael: las 4) con la misma forma que auth/me. El mock **no prueba** permisos: solo pinta candados |
| SDK | `get('auth/me')` con caché apagada. `getAccessPolicy()` existe pero es la copia del login (puede estar vieja): no usarla para candados |
| Docs | [access-policies (Parameterized, Caregiver, basedOn y /auth/me)](https://www.medplum.com/docs/access/access-policies) · [decision-guides/access-control](https://www.medplum.com/docs/decision-guides/access-control) |

### API-03 · Roles de la cuenta (Person y selector "Cuido a / Mi salud")
| Campo | Detalle |
|---|---|
| Para qué (front) | Saber a quién se está viendo y mostrar el selector · **POR-102** ui-role-switch · **POR-58** (nombre arriba: "Carmen" o "Lourdes (hija)") |
| Lo produce (back) | **POR-101** multi-role · POR-33 · POR-99 |
| Recurso(s) | Perfil de la sesión (Patient o RelatedPerson), RelatedPerson.`patient`, `relationship[0].text` ("hija", "esposo"), Person.`link[].target` |
| Operación | 1) Perfil = `getProfile()`. 2) Si es **Patient** → un rol: "Mi salud", `<P>` = el perfil. 3) Si es **RelatedPerson** → rol "Cuido a: <nombre> (<relación>)", `<P>` = `RelatedPerson.patient`; leer al paciente con `GET <base>fhir/R4/Patient/<id>`. 4) Buscar `Person?relatedperson=RelatedPerson/<id>`; si un `link.target` es `Patient/…` → segundo rol "Mi salud" con ese paciente |
| Quién puede | Cada cuenta ve solo su Person (política de paciente: `Person?patient=%patient`) |
| Respuesta y sin permiso | Sin Person → un solo rol (no es error). **No es recíproco**: Carmen no ve la ficha de Lourdes (búsqueda → vacío; por id → 404) |
| Tiempo real | No |
| Mock | Carmen → 1 rol. Lourdes → 2 roles ("Cuido a: Carmen (mamá)" / "Mi salud", `Patient/lourdes` con su cita propia). Rafael → 1 rol ("Cuido a: Carmen (esposa)") |
| SDK | `useMedplumProfile`, `getProfile`, `readReference`, `searchOne` |
| Docs | [Person](https://www.medplum.com/docs/api/fhir/resources/person) · [RelatedPerson](https://www.medplum.com/docs/api/fhir/resources/relatedperson) · [family-relationships](https://www.medplum.com/docs/fhir-datastore/family-relationships) |

Al cambiar de rol: cerrar las suscripciones del rol anterior, borrar de pantalla los datos y avisos del otro paciente y volver a pedir auth/me (skill aislamiento-y-accesibilidad).

### API-04 · Ficha del paciente (encabezado)
| Campo | Detalle |
|---|---|
| Para qué (front) | Nombre arriba ("Hola, Doña Carmen") · POR-58 · POR-59 shell · POR-73 (récord) |
| Lo produce (back) | **POR-35** seed (actualiza la Patient que creó la invitación; no crea otra) · POR-98 |
| Recurso(s) | Patient: `name[0].given`, `name[0].family` (dos apellidos: "Rivera Colón"), `name[0].text`, `birthDate`, `gender`, `communication[0].language` = `es-PR`, `identifier` (MRN, sistema `urn:hospital-demo:mrn`) |
| Operación | `GET <base>fhir/R4/Patient/<id>` |
| Quién puede | Paciente: todo. Familiar (visita): **sin** `identifier`, `address` ni `telecom` (campos ocultos) |
| Respuesta y sin permiso | Familiar sin acceso → 404 |
| Tiempo real | No |
| Mock | Carmen Rivera Colón, MRN-0001, nacida 1954 (fecha inventada), es-PR |
| SDK | `readReference` / `readResource`, `useResource` |
| Docs | [Patient](https://www.medplum.com/docs/api/fhir/resources/patient) · [reading-data](https://www.medplum.com/docs/fhir-datastore/reading-data) |

### API-05 · La visita actual (Encounter)
| Campo | Detalle |
|---|---|
| Para qué (front) | Tarjeta grande de "Mi visita" (lugar, alta/ingreso) · **POR-60** ui-visit · POR-66 (ubicación) · POR-67 (alta: `finished` + `home`) · POR-77 (ingreso) · POR-70 (leer en voz alta) |
| Lo produce (back) | **POR-36** bot-adt · POR-53 (ingreso) · POR-55 (visita `planned`) |
| Recurso(s) | Encounter: `status` (planned · arrived · triaged · in-progress · finished), `class.code` (EMER / IMP), `subject`, `period.start/end`, `priority.text` ("ESI 3"), `location[0].location` (`display` y referencia), `participant[].individual` (médica), `serviceProvider`, `hospitalization.dischargeDisposition.coding[0].code` (`home` = alta a la casa), `identifier` (número de visita), `partOf` (en el ingreso) |
| Operación | `Encounter?patient=<P>&_sort=-_lastUpdated&_count=5` y tomar la primera con `class.code = EMER` (si no hay, la primera) — probado en la práctica |
| Quién puede | Paciente · familiar con `visita` |
| Respuesta y sin permiso | Sin visita → Bundle vacío → "No tiene una visita activa". Familiar sin acceso → Bundle vacío (candado por API-02) |
| Tiempo real | Sí: `Encounter?patient=<P>` |
| Mock | `Encounter/visita-er`: EMER, `in-progress`, ESI 3, inicio 9 oct 8:12 AM, en "Cubículo 12", Dra. Ana Ramos, Hospital Demo |
| SDK | `searchResources`, `useSearchResources` |
| Docs | [ADT](https://www.medplum.com/docs/integration/hl7-interfacing/adt) · [search](https://www.medplum.com/docs/search/basic-search) · [FHIR Encounter](https://hl7.org/fhir/R4/encounter.html) |

Texto en pantalla por `status`: arrived = Llegó · triaged = Clasificado · in-progress = En atención · finished = Salió (SPEC §3.3).

### API-06 · Etapa y "Qué sigue" (Task de etapa)
| Campo | Detalle |
|---|---|
| Para qué (front) | Etapa resaltada, barra de 7 etapas, "Qué sigue", indicaciones del momento, conteo de estudios para el familiar · **POR-60** · POR-66 (indicaciones) · POR-62 (conteo) · POR-70 (voz) |
| Lo produce (back) | **POR-43** stages (la app **no** calcula lógica clínica: solo lee) |
| Recurso(s) | Task (una por visita): `code` = `urn:portal:tarea|etapa`, `identifier` = `urn:hospital-demo:etapa|<id de la visita>`, `status` (in-progress; completed al final), `businessStatus.text` (nombre de la etapa), `description` (= "Qué sigue"), `for` = `<P>`, `encounter` = `<E>`, `input[]` por nombre en `input[].type.text`: |
| | `etapa` (entero **1–7**: 1 Llegada · 2 Triaje · 3 En espera · 4 Evaluación · 5 Estudios · 6 Decisión · 7 Alta / Ingreso; la práctica usaba 0–6) · `que-sigue` (texto) · `indicacion` (texto, 0 o varias) · `esi` (entero) · `personas-antes` y `espera-estimada` (API-07) · `estudios-en-curso` (entero; para el familiar sin `estudios`) |
| Operación | `Task?patient=<P>&encounter=<E>&code=urn:portal:tarea|etapa` (la práctica usaba solo `patient` + `encounter`, probado) |
| Quién puede | Paciente · familiar con `visita` |
| Respuesta y sin permiso | Sin Task → "No tiene una visita activa" |
| Tiempo real | Sí: `Task?patient=<P>` |
| Mock | Etapa 5 (Estudios), "Qué sigue: Esperar resultados de laboratorio y la radiografía", indicación "No coma ni beba por ahora…", `estudios-en-curso` = 1. Un botón solo del mock pasa por las etapas 1–7 (para POR-60) |
| SDK | `searchOne`, `useSearchOne` |
| Docs | [FHIR Task](https://hl7.org/fhir/R4/task.html) · [search](https://www.medplum.com/docs/search/basic-search) |

Los textos salen tal cual de `docs/textos-de-la-app.md` (los pone el backend; el portal no los inventa).

### API-07 · Fila de espera ("¿Por qué espero?")
| Campo | Detalle |
|---|---|
| Para qué (front) | Nivel de triaje explicado, personas antes, espera estimada · **POR-61** ui-wait |
| Lo produce (back) | **POR-44** queue (sobre la Task de etapa de POR-43) |
| Recurso(s) | Task de etapa (API-06): `input` `esi`, `personas-antes`, `espera-estimada` |
| Operación | La misma lectura de API-06 |
| Quién puede | Paciente · familiar con `visita` |
| Respuesta y sin permiso | Sin `personas-antes` → la tarjeta no se muestra (al pasar al cubículo el backend **quita** esos dos datos) |
| Tiempo real | Sí (viene con la Task) |
| Mock | Tras triaje: ESI 3, 6 personas, "45–60 min"; tras muestras: 3 personas, "20–30 min" |
| SDK | igual que API-06 |
| Docs | [FHIR Task](https://hl7.org/fhir/R4/task.html) |

La fila **siempre es simulada**: la pantalla dice "espera estimada (simulada)" y "Es un estimado… si se siente peor, avise en recepción".

### API-08 · Quién me atiende (equipo y lugar)
| Campo | Detalle |
|---|---|
| Para qué (front) | "Quién la atiende" en Mi cuidado · **POR-66** ui-care · POR-77 (médico a cargo del ingreso) |
| Lo produce (back) | **POR-35** seed (Practitioner y Location) · **POR-36** (pone `participant` y `location` en la visita) |
| Recurso(s) | Practitioner: `name[0].given/family`, `qualification[0].code.text` (rol en palabras: "Médica de Emergencias"). Location: `name` |
| Operación | `GET <base>fhir/R4/Practitioner/<id>` con la referencia de `Encounter.participant[].individual`; el lugar sale de `Encounter.location[0].location.display` |
| Quién puede | Paciente · familiar con `visita` (Practitioner/Location/Organization están en todas las políticas) |
| Respuesta y sin permiso | Sin `participant` → no se muestra la tarjeta |
| Tiempo real | Llega con el cambio del Encounter (API-05) |
| Mock | Dra. Ana Ramos (Médica de Emergencias), Cubículo 12. Personal del seed: Dra. Ana Ramos, Enf. Marisol Cruz, Enf. José Rivera, Dr. Luis Ortiz, Dra. Ana Colón |
| SDK | `readReference`, `useResource` |
| Docs | [FHIR Practitioner](https://hl7.org/fhir/R4/practitioner.html) · [FHIR Location](https://hl7.org/fhir/R4/location.html) |

### API-09 · Estudios en curso (orden → muestra → reporte)
| Campo | Detalle |
|---|---|
| Para qué (front) | Una fila por estudio con su estado en español y barra · **POR-62** ui-studies |
| Lo produce (back) | **POR-37** bot-orm (ServiceRequest, Specimen) · **POR-38** bot-oru (DiagnosticReport con `basedOn`) |
| Recurso(s) | ServiceRequest: `status`, `code.text`, `category[0].text` (laboratorio / imagen), `authoredOn`, `note[0].text` (para qué sirve), `encounter`. Specimen: `request[]` → ServiceRequest, `collection.collectedDateTime`. DiagnosticReport: `status`, `code.text`, `basedOn[]` → ServiceRequest, `issued`, `result[]` |
| Operación | Tres búsquedas (probado): `ServiceRequest?patient=<P>&encounter=<E>` · `Specimen?patient=<P>` · `DiagnosticReport?patient=<P>&encounter=<E>` |
| Estado en pantalla | Listo = reporte `final` o `corrected`, o la orden `completed` · Corregido = reporte `amended`/`corrected` sobre uno ya listo · Preliminar = reporte `preliminary` o `partial` · En proceso = reporte `registered` · Muestra tomada = hay Specimen de esa orden · Ordenado = nada de lo anterior · Cancelado = orden `revoked` |
| Quién puede | Paciente · familiar con `estudios`. Familiar **sin** `estudios`: solo "N estudios en curso; los resultados son privados", con N = `estudios-en-curso` de la Task (API-06). Nunca un nombre de estudio |
| Respuesta y sin permiso | Bundle vacío (o el error del riesgo §1.3) → candado según API-02 |
| Tiempo real | Sí: `ServiceRequest?patient=<P>` y `DiagnosticReport?patient=<P>` (solo si API-02 permite `estudios`) |
| Mock | `ServiceRequest/hemograma` "Hemograma completo" con su DiagnosticReport `final` (Listo). Para ver los 5 estados en el mock se pueden añadir órdenes de ejemplo (lactato, panel metabólico, radiografía, hemocultivos) **marcadas solo-mock** |
| SDK | `searchResources`, `useSearchResources` |
| Docs | [orders-and-results](https://www.medplum.com/docs/integration/hl7-interfacing/orders-and-results) · [includes](https://www.medplum.com/docs/search/includes) · [FHIR ServiceRequest](https://hl7.org/fhir/R4/servicerequest.html) · [Specimen](https://hl7.org/fhir/R4/specimen.html) · [DiagnosticReport](https://hl7.org/fhir/R4/diagnosticreport.html) |

Atajo opcional **(no probado)**: una sola búsqueda con `_revinclude=DiagnosticReport:based-on&_revinclude=Specimen:request`. Si se usa, probar que no revela nada al familiar sin `estudios`.

### API-10 · Resultados (valor, rango, semáforo, preliminar)
| Campo | Detalle |
|---|---|
| Para qué (front) | Una tarjeta por valor · **POR-63** ui-results (momento estelar) |
| Lo produce (back) | **POR-38** bot-oru |
| Recurso(s) | Observation: `code.text`, `valueQuantity.value/unit` o `valueString` (imagen), `referenceRange[0].low/high/text`, `interpretation[0].coding[0].code`, `status` (preliminary · final · corrected · amended), `note[0].text` (explicación sencilla, viene del laboratorio), `effectiveDateTime`, `category` (laboratory / imaging). DiagnosticReport (API-09) para el nombre del estudio y "Preliminar" |
| Operación | `Observation?patient=<P>&encounter=<E>&category=laboratory,imaging&_sort=-date` (probado; excluye signos vitales del triaje) |
| Semáforo | `N` Normal · `H` Alto · `L` Bajo · `HH` Muy alto · `LL` Muy bajo · `A` Anormal. **Sin `interpretation` = "sin interpretación", nunca "Normal"** |
| Quién puede | Paciente · familiar con `estudios` |
| Respuesta y sin permiso | Vacío con permiso → "Todavía no hay resultados…". Sin permiso → candado "Doña Carmen no ha compartido los resultados" |
| Tiempo real | Sí: `DiagnosticReport?patient=<P>` (cambia al final de cada ORU) y, si se quiere, `Observation?patient=<P>` |
| Mock | Hemograma `final`: Glóbulos blancos 15.2 mil/µL, normal 4.5–11.0, `H`, "Están altos. Suele pasar cuando el cuerpo combate una infección." · Hemoglobina 12.8 g/dL, 12.0–15.5, `N`. Los otros 4 del caso (POR-63 pide 6) pueden ir en el mock marcados solo-mock |
| SDK | `searchResources`, `useSearchResources`; referencia visual: foomedical `LabResult` |
| Docs | [results-and-review](https://www.medplum.com/docs/labs-imaging/results-and-review) · [orders-and-results](https://www.medplum.com/docs/integration/hl7-interfacing/orders-and-results) · [FHIR Observation](https://hl7.org/fhir/R4/observation.html) |

Valor crítico: **nunca** "Su equipo ya fue avisado" salvo que el backend entregue una confirmación real del hospital (canon §7). Hoy no hay campo para eso → siempre texto neutral (ver §4).

### API-11 · Tiempo real (useSubscription)
| Campo | Detalle |
|---|---|
| Para qué (front) | Que la pantalla cambie sola en menos de 5 s · **POR-64** live · POR-60, POR-62, POR-63, POR-65, POR-66, POR-67 |
| Lo produce (back) | **POR-32** project-setup (función `websocket-subscriptions` y `bots` en el Project) · **POR-47** (permiso de Subscription en la política de paciente) · POR-48 (en las de familia) · POR-49 (al quitar acceso dejan de llegar) |
| Recurso(s) | Subscription en memoria (tipo websocket), una por criterio; comparte un WebSocket en `<base>ws/subscriptions-r4` |
| Criterios exactos | Paciente y familiar con `visita`: `Encounter?patient=<P>` · `Task?patient=<P>` · `Communication?subject=<P>` |
| | Solo si API-02 permite `estudios`: `ServiceRequest?patient=<P>` · `DiagnosticReport?patient=<P>` (opcional `Observation?patient=<P>`) |
| | Solo si permite `medicinas`: `MedicationAdministration?patient=<P>` · `MedicationRequest?patient=<P>` |
| | Solo si permite `instrucciones`: `CarePlan?patient=<P>` · `Appointment?patient=<P>` |
| Quién puede | Toda sesión con la entrada `Subscription?type=websocket&author=%profile` en su política **y** permiso de lectura del tipo suscrito |
| Respuesta y sin permiso | Suscribirse a un tipo sin permiso → el servidor lo rechaza: por eso el frontend **no** se suscribe a categorías apagadas. Medplum revisa la política vigente antes de cada notificación |
| Qué hacer al recibir | Esperar ~0.4 s (juntar varias), volver a leer la sección afectada, mostrar notificación corta y resaltar. En `Communication`, el texto del aviso viene en la entrada 1 del Bundle (`payload[0].contentString`) |
| Mock | MockClient trae un administrador de suscripciones de prueba: un botón solo-mock "Simular evento" dispara la notificación (no hay WebSocket real) |
| SDK | `useSubscription` (`@medplum/react` / `@medplum/react-hooks`), `getSubscriptionManager` |
| Docs | [use-subscription](https://www.medplum.com/docs/react/use-subscription) · [access-policies → WebSocket Subscriptions](https://www.medplum.com/docs/access/access-policies) · [project-settings](https://www.medplum.com/docs/self-hosting/project-settings) · [subscriptions](https://www.medplum.com/docs/subscriptions) |

Si funciona como admin pero no como Carmen: falta la entrada de Subscription en su política (POR-47). Al cambiar de rol o de criterio, el hook cierra la suscripción vieja solo. Si se cae la conexión: aviso "Sin conexión en vivo" y volver a leer todo al reconectar.

### API-12 · Avisos (Communication con categoría)
| Campo | Detalle |
|---|---|
| Para qué (front) | Línea de tiempo con hora y contador de no leídos · **POR-65** ui-notices · POR-64 (notificación corta) |
| Lo produce (back) | **POR-45** notices (el Bot `hl7-a-fhir` crea un aviso por evento) · POR-40 (avisos de medicina) |
| Recurso(s) | Communication: `status` = completed, `category[]` (sistema `urn:portal:aviso`), `subject` = `<P>`, `recipient`, `sent` (con −04:00), `payload[0].contentString` (texto de `docs/textos-de-la-app.md`) |
| Categoría de cada aviso | Llegada, triaje, ubicación, alta, ingreso → `visita` · órdenes y muestras → `estudios` · resultado listo → `resultado` · "Le dieron …" → `medicina` · por cada resultado, además, "Hay un resultado nuevo (privado)" con **dos** categorías: `visita` y `neutral-familia` |
| Operación | `Communication?subject=<P>&_sort=-sent&_count=30` |
| Quién puede | Paciente: todos. Familiar: **el servidor filtra** por categoría (el portal no filtra por su cuenta) |
| Qué oculta la pantalla | El aviso con `neutral-familia` se oculta si la sesión tiene `estudios` para ese paciente (la paciente y Rafael ya ven el aviso real). Es la única regla de filtro en el portal |
| Respuesta y sin permiso | Familiar sin acceso → Bundle vacío |
| Tiempo real | Sí: `Communication?subject=<P>` |
| Mock | 5–6 avisos de la visita (llegada 8:12, triaje 8:25, órdenes 8:31 `estudios`, cubículo 9:05, "Resultado listo: Hemograma completo" `resultado`, "Le dieron: Ceftriaxona" `medicina`) + el neutral |
| SDK | `searchResources`, `useSubscription`; referencia: foomedical `MessagesPage` |
| Docs | [communications](https://www.medplum.com/docs/communications) · [FHIR Communication](https://hl7.org/fhir/R4/communication.html) |

Contador de no leídos: lo lleva la pantalla en memoria de la sesión (hora del último visto); no se guarda en el servidor ni en el teléfono.

### API-13 · Medicinas que le dieron (MedicationAdministration)
| Campo | Detalle |
|---|---|
| Para qué (front) | "Medicinas que le dieron hoy" en Mi cuidado · **POR-66** ui-care |
| Lo produce (back) | **POR-40** bot-ras (un MedicationAdministration por cada RXA) |
| Recurso(s) | MedicationAdministration: `status` = completed, `medicationCodeableConcept.text`, `effectiveDateTime`, `dosage.text`, `dosage.route.text`, `dosage.dose.value/unit`, `context` = `<E>`, `note[0].text` (para qué) |
| Operación | `MedicationAdministration?patient=<P>&context=<E>` (probado) |
| Quién puede | Paciente · familiar con `medicinas` |
| Respuesta y sin permiso | Sin permiso → candado "Las medicinas de Doña Carmen son privadas" (decidido por API-02; QA-03: cada sección con su propia guarda) |
| Tiempo real | Sí, si permite `medicinas`: `MedicationAdministration?patient=<P>` |
| Mock | Ceftriaxona 1 g por la vena, 10:15 AM (canon §6). El caso trae además acetaminofén y oxígeno (POR-66 pide 2 medicinas): añadir en el mock marcados solo-mock |
| SDK | `searchResources`; referencia: foomedical `Medications` |
| Docs | [medications](https://www.medplum.com/docs/medications) · [FHIR MedicationAdministration](https://hl7.org/fhir/R4/medicationadministration.html) |

### API-14 · Alta: recetas, instrucciones, alarmas y cita
| Campo | Detalle |
|---|---|
| Para qué (front) | Tarjeta "Su alta" (diagnóstico, qué hacer en casa, NUEVA/SIGUE, "Vuelva a Emergencias si…", cita) · **POR-67** ui-discharge |
| Lo produce (back) | **POR-46** discharge-data (el simulador, como si fuera el sistema del hospital y marcado simulado, publica por FHIR justo después del A03; el A03 no trae recetas) |
| Recurso(s) | MedicationRequest: `status` active, `intent` order, `medicationCodeableConcept.text`, `dosageInstruction[0].text`, `category[0].text` = `nueva` · `sigue` (probado; `cambia`/`suspendida` POR CONFIRMAR), `note[0].text` (farmacia), `encounter`. CarePlan: `title` "Su alta", `description` (diagnóstico en palabras sencillas), `activity[].detail.description`; las alarmas llevan `activity[].detail.code.text` = `alarma`. Appointment: `status` booked, `start`/`end`, `description`, `participant[]` (paciente con `status` needs-action; médica con `actor.display`) |
| Operación | `MedicationRequest?patient=<P>&encounter=<E>` · `CarePlan?patient=<P>&encounter=<E>` · `Appointment?patient=<P>&status=booked&_sort=date` |
| Cuándo se muestra | Solo si la visita está `finished` con disposición `home` (API-05) |
| Quién puede | Paciente. Familiar: recetas con `medicinas`; CarePlan y Appointment con `instrucciones` (cada parte con su candado propio) |
| Respuesta y sin permiso | Bundle vacío → candado por API-02 |
| Tiempo real | Llega con el Encounter `finished` (API-05); opcional `MedicationRequest?patient=<P>`, `CarePlan?patient=<P>` |
| Mock | Diagnóstico "Pulmonía (neumonía) adquirida en la comunidad"; NUEVA amoxicilina/clavulanato 875 mg cada 12 h por 7 días; SIGUE metformina 500 mg y lisinopril 10 mg; alarmas: falta de aire, fiebre de más de 101 °F después de 3 días, confusión, dolor de pecho; cita viernes 16 oct 10:00 AM telemedicina, Dra. Ana Colón |
| SDK | `searchResources`, `formatDateTime` (con zona America/Puerto_Rico) |
| Docs | [scheduling](https://www.medplum.com/docs/scheduling) · [FHIR MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html) · [CarePlan](https://hl7.org/fhir/R4/careplan.html) · [Appointment](https://hl7.org/fhir/R4/appointment.html) |

### API-15 · Familia: quiénes son y qué ve cada uno (lectura)
| Campo | Detalle |
|---|---|
| Para qué (front) | Tarjeta por familiar con sus 4 interruptores · **POR-68** ui-family-patient · **POR-100** ui-multi-caregiver |
| Lo produce (back) | **POR-48** policy-family · **POR-99** multi-caregiver (Consent por persona) |
| Recurso(s) | RelatedPerson: `name`, `relationship[0].text`. Consent (registro, no permiso): `status` (active / inactive), `patient`, `dateTime`, `provision.type` (permit / deny), `provision.actor[0].reference` = el familiar, `provision.class[]` (`urn:portal:compartir`), `policyRule` (OPTIN / OPTOUT) |
| Operación | `RelatedPerson?patient=<P>` y, por cada uno, `Consent?patient=<P>&actor=RelatedPerson/<id>&_sort=-_lastUpdated&_count=1` |
| Regla para pintar | Sin Consent todavía → solo `visita` (así entra la invitación). Consent `inactive` → nada. Si no, las categorías de `provision.class` |
| Quién puede | Solo la paciente dueña (rol "Mi salud" de Carmen). En "Mi salud" de Lourdes: "Todavía no ha compartido su récord con nadie" |
| Respuesta y sin permiso | Familiar → Bundle vacío (no puede ver Consent) |
| Tiempo real | No: se vuelve a leer después de cada cambio (API-16) |
| Mock | Lourdes (hija): visita + medicinas + instrucciones. Rafael (esposo): las 4 |
| SDK | `searchResources`, `searchOne` (caché apagada) |
| Docs | [consent](https://www.medplum.com/docs/consent) · [family-relationships](https://www.medplum.com/docs/fhir-datastore/family-relationships) · [FHIR Consent](https://hl7.org/fhir/R4/consent.html) |

Si dos tarjetas salen iguales: se está leyendo el último Consent de la paciente y no el de cada persona.

### API-16 · Familia: compartir o cambiar categorías (Bot compartir-familia)
| Campo | Detalle |
|---|---|
| Para qué (front) | Cada interruptor de la tarjeta · **POR-68** · **POR-100** |
| Lo produce (back) | **POR-48** (Bot y 4 políticas + la vacía) · **POR-99** (por persona) |
| Recurso(s) | Bot `compartir-familia`; cambia la membresía (ProjectMembership.`access[]`) del familiar y crea un Consent |
| Operación | 1) Buscar el Bot: `Bot?name=compartir-familia` (probado; alternativa sin buscar: `POST <base>fhir/R4/Bot/$execute?identifier=<system>|compartir-familia` si el Bot lleva identificador). 2) `POST <base>fhir/R4/Bot/<id del Bot>/$execute` con `Content-Type: application/json` |
| Entrada | `familiar`: id del RelatedPerson (**siempre** mandarlo; sin él el Bot cambia a todos) · `compartir`: lista con 0 a 4 de `visita`, `medicinas`, `instrucciones`, `estudios` |
| Qué hace el Bot | Comprueba que quien llama es una **Patient** y que ese familiar es **suyo**. Si `compartir` no está vacío, añade `visita` (la base). En la membresía de ESA persona reemplaza **solo** las entradas cuyo parámetro `patient` es la paciente que llama (una por categoría; con lista vacía, la política vacía "Familiar sin acceso"); las demás entradas (por ejemplo, la "Mi salud" de Lourdes) no se tocan. Nunca deja la membresía sin entradas. Crea un Consent de esa persona |
| Salida | `ok` = verdadero · `compartir` = la lista final (ya con `visita`) · `familiares` = nombres cambiados. La pantalla pinta con esta lista |
| Quién puede | Solo la paciente. Familiar que lo intenta → rechazado (esperado **403**, canon §4; **no probado**: en la práctica solo se comprobó que falla) |
| Errores | Categoría desconocida o familiar que no es suyo → el Bot falla con un mensaje (OperationOutcome); la pantalla muestra "No se pudo guardar" y deja el interruptor como estaba |
| Tiempo real | No hay evento de permiso. La pantalla de Carmen vuelve a leer API-15; la del familiar se entera por API-17 |
| Mock | El mock no ejecuta Bots: el frontend intercepta la llamada en modo mock y devuelve la salida esperada y actualiza el archivo de políticas de ejemplo (API-02) |
| SDK | `executeBot`, `searchOne` |
| Docs | [bot-execute](https://www.medplum.com/docs/api/fhir/operations/bot-execute) · [access-policies (Parameterized, Caregiver)](https://www.medplum.com/docs/access/access-policies) · [ProjectMembership](https://www.medplum.com/docs/api/fhir/medplum/projectmembership) |

Aceptación (POR-68): apagar "mis medicinas" → en la otra ventana Lourdes deja de ver las recetas; prenderlo las devuelve. El portal **nunca** cambia membresías ni Consent por su cuenta.

### API-17 · Quitar el acceso (revocar) y cómo se entera la pantalla abierta
| Campo | Detalle |
|---|---|
| Para qué (front) | Interruptor principal de la tarjeta y mensaje "Acceso de Lourdes retirado de inmediato" · **POR-68** · **POR-69** (la vista de Lourdes se cierra) · POR-100 |
| Lo produce (back) | **POR-49** revoke |
| Recurso(s) | Igual que API-16, con `compartir` vacío → política "Familiar sin acceso" y Consent `inactive`, `provision.type` deny, `policyRule` OPTOUT |
| Operación | `POST <base>fhir/R4/Bot/<id>/$execute` con `familiar` y `compartir` vacío |
| Efecto en el servidor | Inmediato en la misma sesión del familiar (probado en la práctica): sus búsquedas pasan a vacío y dejan de llegarle notificaciones. Meta: **menos de 10 s** |
| Cómo se entera la pantalla del familiar (propuesto) | No hay evento push de permisos. La vista del familiar vuelve a pedir **auth/me cada 5 s**, al volver al foco y al reconectar; si una categoría se apagó, **borra primero** lo de esa categoría (inicio, voz, avisos, detalle) y luego pinta candados (QA-04, QA-05) |
| Quién puede | Solo la paciente |
| Respuesta y sin permiso | Como API-16 |
| Tiempo real | No (lo cubre la consulta de auth/me) |
| Mock | Igual que API-16 |
| SDK | `executeBot`, `get('auth/me')` |
| Docs | [access-policies](https://www.medplum.com/docs/access/access-policies) · [consent](https://www.medplum.com/docs/consent) |

"Retirado de inmediato" solo se dice si se midió en la prueba de dos ventanas (POR-49, POR-85).

### API-18 · Lo sensible nunca se comparte
| Campo | Detalle |
|---|---|
| Para qué (front) | Que nunca aparezca en la vista del familiar · **POR-69** · POR-63 |
| Lo produce (back) | **POR-50** sensitive |
| Recurso(s) | Cualquier recurso clínico con `meta.security` = `http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R`. Seed: 1 recurso de prueba (recomendado: Observation, así la prueba es real porque Observation sí está en la categoría Estudios; POR-50 sugiere Condition → decide el líder de backend) |
| Operación | Ninguna nueva: lo excluye el criterio `_security:not=…|R` de cada política de familia |
| Quién puede | Solo la paciente |
| Respuesta y sin permiso | Familiar, aun con las 4 categorías: búsqueda → no aparece; por id → 404 |
| Tiempo real | No |
| Mock | El mock **no** lo puede probar (no aplica permisos). El dato R va en el mock solo en la vista de Carmen |
| SDK | — |
| Docs | [access-policies](https://www.medplum.com/docs/access/access-policies) · [FHIR security labels](https://hl7.org/fhir/R4/security-labels.html) |

Prueba negativa (POR-85): encender TODO a Lourdes/Rafael → el dato sensible sigue oculto; además revisar Task, Communication, conteos y `_include`, no solo Observation.

### API-19 · Ingreso al hospital
| Campo | Detalle |
|---|---|
| Para qué (front) | Tarjeta "La van a ingresar" · **POR-77** ui-admit |
| Lo produce (back) | **POR-53** admit-data (A06/A01) |
| Recurso(s) | Encounter nuevo: `class.code` = IMP, `status` in-progress, `partOf` = la visita de Emergencias, `location[0]` = "Medicina 3er piso · Cama 304-B", `participant[0].individual` = Dr. Luis Ortiz. Horario de visitas en la Location de la unidad: `hoursOfOperation` (10:00 AM – 8:00 PM) **(propuesto)**. La visita de Emergencias pasa a `finished` con disposición "Ingreso al hospital" |
| Operación | `Encounter?patient=<P>&class=http://terminology.hl7.org/CodeSystem/v3-ActCode|IMP` (o `Encounter?part-of=<E>`) |
| Quién puede | Paciente · familiar con `visita` |
| Respuesta y sin permiso | Sin ingreso → Bundle vacío (no se muestra la tarjeta) |
| Tiempo real | Sí, con `Encounter?patient=<P>` |
| Mock | Solo con el botón solo-mock "Ingresar": cama 304-B, Dr. Luis Ortiz, visitas 10:00 AM – 8:00 PM |
| SDK | `searchOne` |
| Docs | [ADT](https://www.medplum.com/docs/integration/hl7-interfacing/adt) · [FHIR Encounter](https://hl7.org/fhir/R4/encounter.html) |

### API-20 · Mis trámites (después del alta)
| Campo | Detalle |
|---|---|
| Para qué (front) | Lista con estado y botones "Confirmar cita" y "Descargar excusa" · **POR-78** ui-tramites |
| Lo produce (back) | **POR-54** tramites-data |
| Recurso(s) | Task con `code` = `urn:portal:tarea|tramite`: `description`, `status` (completed = Listo · in-progress = En curso · requested = Le toca a usted), `focus` (lo que toca: Appointment, DocumentReference de la excusa, Claim de la pre-autorización). AppointmentResponse (lo crea la paciente): `appointment`, `actor` = `<P>`, `participantStatus` = accepted. DocumentReference (excusa): `content[0].attachment` |
| Operación | Leer: `Task?patient=<P>&code=urn:portal:tarea|tramite`. Confirmar: `POST <base>fhir/R4/AppointmentResponse`. Excusa: `GET` del DocumentReference en `focus` |
| Quién puede | Paciente: ver y confirmar. Familiar con `visita`: **ve** los trámites (la política de Task es por paciente) pero **no** confirma (crear → 403) |
| Respuesta y sin permiso | Confirmar como familiar → 403 → "Solo Doña Carmen puede confirmar su cita" |
| Tiempo real | Sí, con `Task?patient=<P>` |
| Mock | Las 5 tareas: receta lista en la farmacia (Listo) · confirmar la cita (Le toca a usted) · radiografía de control en 6 semanas con pre-autorización (En curso) · excusa para el trabajo (Le toca a usted) · hemocultivos pendientes (En curso) |
| SDK | `searchResources`, `createResource` |
| Docs | [appointment-confirm](https://www.medplum.com/docs/scheduling/appointment-confirm) · [FHIR AppointmentResponse](https://hl7.org/fhir/R4/appointmentresponse.html) · [DocumentReference](https://hl7.org/fhir/R4/documentreference.html) |

La política de paciente debe permitir **crear** AppointmentResponse (la de práctica era solo lectura). Quién actualiza el Appointment después: POR CONFIRMAR (el líder de backend).

### API-21 · Pre-autorización visible (simulada)
| Campo | Detalle |
|---|---|
| Para qué (front) | Dentro de Mis trámites: "Su plan está revisando el permiso · decisión en hasta 7 días", etiqueta "simulado" · **POR-82** ui-preauth |
| Lo produce (back) | **POR-57** preauth-data |
| Recurso(s) | Claim: `use` = preauthorization, `patient`, `status` active, `item[0]` (radiografía de control). ClaimResponse: `request` → Claim, `outcome` = queued (en revisión), `disposition` (texto). Los dos con `meta.tag` `urn:portal:origen|simulado` |
| Operación | `Claim?patient=<P>&use=preauthorization` y `ClaimResponse?request=Claim/<id>` (o seguir el `focus` del trámite) |
| Quién puede | Paciente. Familiar: POR CONFIRMAR (no está en ninguna categoría → hoy no la ve) |
| Respuesta y sin permiso | Bundle vacío → no se muestra |
| Tiempo real | No |
| Mock | Una pre-autorización "en revisión", simulada |
| SDK | `searchOne` |
| Docs | [electronic-prior-auth](https://www.medplum.com/docs/integration/electronic-prior-auth) · [Da Vinci PAS](https://build.fhir.org/ig/HL7/davinci-pas/) · [FHIR Claim](https://hl7.org/fhir/R4/claim.html) · [ClaimResponse](https://hl7.org/fhir/R4/claimresponse.html) |

### API-22 · Pre-registro desde la casa
| Campo | Detalle |
|---|---|
| Para qué (front) | Formulario casi lleno, envío y pase QR · **POR-80** ui-prereg |
| Lo produce (back) | **POR-55** prereg-data (Questionnaire + visita `planned`; el A04 la reutiliza) |
| Recurso(s) | Questionnaire (nombre `pre-registro`, propuesto): `item[]`. QuestionnaireResponse (lo crea la paciente): `questionnaire`, `subject` = `<P>`, `status` = completed, `item[].answer[]`. Encounter `planned` y Coverage (los crea el backend al recibir la respuesta). Para pre-llenar: Patient, Coverage y lo que ya esté en el récord |
| Operación | `Questionnaire?name=pre-registro` · `POST <base>fhir/R4/QuestionnaireResponse` · pase: `Encounter?patient=<P>&status=planned` |
| Quién puede | Solo la paciente |
| Respuesta y sin permiso | Familiar → 403 al enviar. **EMTALA:** no reserva turno ni cambia el orden; sin pre-registro todo funciona igual |
| Tiempo real | No |
| Mock | Questionnaire de ejemplo con 5 secciones (datos, plan, medicinas y alergias, contacto, motivo) |
| SDK | `QuestionnaireForm` (`@medplum/react`), `createResource`; referencia: foomedical `QuestionnairePage` |
| Docs | [questionnaires](https://www.medplum.com/docs/questionnaires) · [basic-tutorial](https://www.medplum.com/docs/questionnaires/basic-tutorial) · [FHIR QuestionnaireResponse](https://hl7.org/fhir/R4/questionnaireresponse.html) |

El QR del pase codifica solo un id (sin datos personales) **(propuesto)**. La política de paciente debe permitir crear QuestionnaireResponse.

### API-23 · Servicios cerca de usted
| Campo | Detalle |
|---|---|
| Para qué (front) | Lista de 4 servicios con distancia, espera simulada y "Acepta su plan" · **POR-81** ui-services |
| Lo produce (back) | **POR-56** services-data |
| Recurso(s) | HealthcareService: `name`, `type[0].text` (Emergencias / CDT / Telemedicina / Médico primario), `characteristic[].text` ("Acepta su plan"), `extraDetails` (texto fijo con distancia y espera simulada, por ejemplo "3.2 km · espera estimada (simulada) 40 min") **(propuesto)**, `location` → Location, `providedBy` → Organization |
| Operación | `HealthcareService?active=true&_include=HealthcareService:location` |
| Quién puede | Paciente (la política de paciente debe incluir HealthcareService) |
| Respuesta y sin permiso | Vacío → "No hay servicios cargados" |
| Tiempo real | No (puede estar hasta 60 s viejo, SPEC §4) |
| Mock | Emergencias del Hospital Demo (3.2 km) · CDT Demo de Jayuya (14.8 km) · Telemedicina del plan · Dra. Ana Colón, médico primario (2.1 km) |
| SDK | `searchResources` |
| Docs | [includes](https://www.medplum.com/docs/search/includes) · [FHIR HealthcareService](https://hl7.org/fhir/R4/healthcareservice.html) |

La app no pide la ubicación del teléfono (la distancia es fija del demo).

### API-24 · ¿Quién vio mi récord? (auditoría)
| Campo | Detalle |
|---|---|
| Para qué (front) | Lista "quién, qué, cuándo" en Más · **POR-75** ui-privacy |
| Lo produce (back) | **POR-52** audit (si Medplum local no genera AuditEvent de lecturas, lista simulada marcada) |
| Recurso(s) | AuditEvent: `recorded`, `agent[0].who` (quién), `entity[0].what` (qué), `action` (R = lectura). Si es simulada: `meta.tag` `urn:portal:origen|simulado` |
| Operación | `AuditEvent?entity=<P>&_sort=-date&_count=20` (parámetro exacto **POR CONFIRMAR** el 8: puede ser `patient=<P>`) |
| Quién puede | Solo la paciente (la política de paciente debe incluir AuditEvent de su récord) |
| Respuesta y sin permiso | Vacío → "Nadie más ha visto su récord" solo si la fuente es real; si es simulada, decirlo |
| Tiempo real | No |
| Mock | 2 entradas: "Lourdes (hija) vio su visita · 9:12 AM", marcadas simuladas |
| SDK | `searchResources` |
| Docs | [AuditEvent](https://www.medplum.com/docs/api/fhir/resources/auditevent) · [FHIR AuditEvent](https://hl7.org/fhir/R4/auditevent.html) |

"No participar (opt-out)" de la misma pantalla es **solo UI** (confirmación y explicación de la Ley 86-2026 Art. 13); no escribe nada en el servidor en el MVP.

### API-25 · Pregunta no urgente para el enfermero
| Campo | Detalle |
|---|---|
| Para qué (front) | Botón y ventana con aviso rojo "Si es una emergencia… avise al personal" · **POR-76** ui-nurse |
| Lo produce (back) | **Ningún issue backend lo cubre** → POR CONFIRMAR (el líder de backend): permiso de crear y a quién va |
| Recurso(s) | Communication: `subject` = `<P>`, `sender` = `<P>`, `recipient` = Practitioner (Enf. José Rivera), `payload[0].contentString`, `status` = completed, `category` `urn:portal:aviso|pregunta` (propuesto) |
| Operación | `POST <base>fhir/R4/Communication` |
| Quién puede | Solo la paciente. Familiar → 403 |
| Respuesta y sin permiso | 201 → "Su pregunta se envió". Nunca "le van a contestar en X minutos" |
| Tiempo real | No |
| Mock | Se guarda en memoria del mock |
| SDK | `createResource`; referencia: foomedical `MessagesPage` |
| Docs | [communications](https://www.medplum.com/docs/communications) |

### API-26 · Mi récord y compartir con QR
| Campo | Detalle |
|---|---|
| Para qué (front) | "Mi récord" y "Compartir con QR" en Más · **POR-73** ui-record (reutiliza foomedical) |
| Lo produce (back) | **Ningún issue backend específico**; lo cubre la política de paciente (POR-47) si incluye los tipos que lee foomedical (Condition, AllergyIntolerance, Immunization, MedicationRequest, Observation…) → POR CONFIRMAR (el líder de backend) |
| Recurso(s) | Los de las páginas `health-record` de foomedical; opcional `Patient/<id>/$everything` |
| Operación | Las búsquedas por `patient=<P>` que ya hace foomedical |
| Quién puede | Solo la paciente |
| Respuesta y sin permiso | Tipos sin datos → listas vacías ("No hay registros") |
| Tiempo real | No |
| Mock | Lo que traiga el seed de Carmen; el resto vacío (nunca datos de otro paciente: QA-08) |
| SDK | Componentes de foomedical; `searchResources` |
| Docs | [patient-everything](https://www.medplum.com/docs/api/fhir/operations/patient-everything) · [foomedical](https://github.com/medplum/medplum/tree/v5.1.42/examples/foomedical) |

### API-27 · Simulador del hospital (solo en el servidor; el navegador nunca tiene la llave)
| Campo | Detalle |
|---|---|
| Para qué (front) | No lo usa el portal: es una página aparte "Simulador del hospital" que maneja el líder de backend en el demo. El portal solo ve sus efectos (API-05 a API-14) |
| Lo produce (back) | **POR-41** sim-msgs · **POR-42** sim-panel · **POR-36/37/38/40** (el Bot `hl7-a-fhir`) · **POR-46** (alta por FHIR) · **POR-39** bot-tests |
| Piezas | 1) Servidor pequeño **solo en 127.0.0.1** (puerto POR CONFIRMAR; la práctica usó 5181) que guarda el id y secreto del cliente del simulador (`.env`, fuera de git) y entra con client credentials. 2) La página solo habla con ese servidor |
| Rutas del servidor pequeño (como en la práctica) | `GET /estado` (pasos, cuántos se enviaron, resultado) · `POST /siguiente` · `POST /tour` (uno cada 3 s) · `POST /reiniciar` · `POST /alta` · `POST /ingreso`. Ocupado → 409 |
| Envío al Bot | `POST <base>fhir/R4/Bot/<id de hl7-a-fhir>/$execute` con `Content-Type: x-application/hl7-v2+er7`; el Bot devuelve el ACK; OK = contiene `MSA|AA` |
| Qué traduce el Bot | Paciente por MRN (PID-3); visita por número de visita (PV1-19). **A04** → Encounter EMER `arrived` (o reutiliza la `planned` del pre-registro) · **A08** → `triaged`, `priority` "ESI n" (PV2-25), signos vitales como Observation `vital-signs` · **A02** → `in-progress`, nueva `location` y médica · **A03** → `finished`, disposición `home` · **A06/A01** → Encounter IMP nuevo · **ORM^O01** NW → ServiceRequest `active`; SC con estado IP → Specimen · **ORU^R01** → Observation por OBX + DiagnosticReport por OBR con estado de OBR-25 (I registered · P preliminary · F final · C corrected) y `basedOn`; orden `completed` si final · **RAS^O17** → MedicationAdministration por RXA. En cada paso: actualiza la Task de etapa (API-06) y crea el aviso con su categoría (API-12). Guarda Provenance con el mensaje original |
| Alta (POR-46) | Después del A03, el servidor pequeño publica por FHIR (marcado simulado): 3 MedicationRequest, 1 Appointment, 1 CarePlan (API-14) |
| Reiniciar | Borra **solo** los datos de la visita de Carmen, estos 11 tipos: Encounter, Task, Communication, ServiceRequest, Specimen, DiagnosticReport, Observation, MedicationAdministration, MedicationRequest, Appointment, CarePlan. Deja cuentas, datos fijos y el dato sensible (R). Es destructivo: requiere OK humano. El portal **no se entera solo** (no hay aviso al borrar): recargar |
| Quién puede | Solo el cliente del simulador, con la membresía **mínima** (ejecutar el Bot; crear/borrar los 11 tipos). Bots también con lo mínimo; admin solo si una prueba lo exige y se anota en el issue (canon §5) |
| Respuesta y sin permiso | Sin permiso → 403 en el envío |
| Tiempo real | Sus efectos llegan al portal por API-11 |
| Mock | No aplica (en modo mock, los botones solo-mock de API-06/11/19 hacen ese papel) |
| SDK | `startClientLogin`, `executeBot`, `createResource`, `deleteResource`; en el Bot, `Hl7Message` |
| Docs | [hl7-into-fhir](https://www.medplum.com/docs/bots/hl7-into-fhir) · [hl7-interfacing](https://www.medplum.com/docs/integration/hl7-interfacing) · [client-credentials](https://www.medplum.com/docs/auth/client-credentials) · [bot-execute](https://www.medplum.com/docs/api/fhir/operations/bot-execute) |

Comprobación: en Herramientas de desarrollo → Red y Fuentes del navegador, buscar el id/secreto del cliente → cero resultados.

### API-28 · Modo demo público (mock en Vercel) y túnel opcional
| Campo | Detalle |
|---|---|
| Para qué (front) | Arrancar sin backend y publicar · **POR-34** mock-start · **POR-72** deploy |
| Lo produce (back) | **POR-51** cors (demo accesible para los jueces) |
| Qué | Vercel publica el portal con `MEDPLUM_USE_MOCK=true`: sin servidor, sin login real, sin claves. El demo con datos reales se hace en la laptop (y el video es el respaldo) |
| Túnel (solo si los organizadores lo aprueban) | Proxy con llave que deja pasar solo el portal y las rutas que usa: `auth/login`, `auth/method`, `auth/me`, `oauth2/token`, `fhir/R4`, `ws/subscriptions-r4`; solo cuentas demo; niega client credentials; se apaga solo. Nunca la app de administración |
| Vercel | Variables solo públicas en el panel de Vercel; foomedical ya trae la regla que manda toda ruta a la página principal (SPA) |
| Mock | Este es el mock: seed de canon §6 (borrador, **falta OK del líder de backend y el líder de frontend**) cargado en MockClient |
| SDK | `MockClient` de `@medplum/mock` (tiene opción de perfil y administrador de suscripciones de prueba; **no** aplica políticas ni ejecuta Bots) |
| Docs | [setting-up-cors](https://www.medplum.com/docs/self-hosting/setting-up-cors) · [MockClient (código)](https://github.com/medplum/medplum/blob/v5.1.42/packages/mock/src/client.ts) · [Vercel env](https://vercel.com/docs/environment-variables) |

Un pase "sintético" (mock) no cuenta como integrado (AGENTS-frontend): cada reporte dice en qué modo se probó.

---

## 3. Tabla de trazabilidad (issue → API)

### Backend (28)
| Issue | Clave | API |
|---|---|---|
| POR-32 | project-setup | API-11, API-16, API-27 (activa `bots` y `websocket-subscriptions`) |
| POR-33 | demo-users | API-01, API-03, API-27 (cliente del simulador) |
| POR-35 | seed | API-04, API-08, API-28 (y ids de §1.5) |
| POR-36 | bot-adt | API-05, API-06, API-08, API-12, API-27 |
| POR-37 | bot-orm | API-09, API-12, API-27 |
| POR-38 | bot-oru | API-09, API-10, API-12, API-27 |
| POR-39 | bot-tests | API-27 |
| POR-40 | bot-ras | API-13, API-12, API-27 |
| POR-41 | sim-msgs | API-27 |
| POR-42 | sim-panel | API-27 |
| POR-43 | stages | API-06, API-09 (conteo) |
| POR-44 | queue | API-07 |
| POR-45 | notices | API-12 |
| POR-46 | discharge-data | API-14, API-27 |
| POR-47 | policy-patient | API-02, API-11, API-20, API-22, API-24, API-26 |
| POR-48 | policy-family | API-02, API-11, API-15, API-16 |
| POR-49 | revoke | API-17, API-11 |
| POR-50 | sensitive | API-18 |
| POR-51 | cors | API-28 |
| POR-52 | audit | API-24 |
| POR-53 | admit-data | API-19 |
| POR-54 | tramites-data | API-20 |
| POR-55 | prereg-data | API-22, API-05 (visita `planned`) |
| POR-56 | services-data | API-23 |
| POR-57 | preauth-data | API-21 |
| POR-98 | identity-login | API-01, API-04 |
| POR-99 | multi-caregiver | API-15, API-16, API-17 |
| POR-101 | multi-role | API-03, API-02 |

### Frontend (28)
| Issue | Clave | API |
|---|---|---|
| POR-34 | mock-start | API-28 (y la columna Mock de todas) |
| POR-58 | login | API-01, API-03, API-04 |
| POR-59 | shell | sin API: solo UI (5 pestañas, marco de teléfono); usa API-04 para el nombre |
| POR-60 | ui-visit | API-05, API-06, API-11 |
| POR-61 | ui-wait | API-07 |
| POR-62 | ui-studies | API-09, API-06 (conteo), API-02 |
| POR-63 | ui-results | API-10, API-02, API-11 |
| POR-64 | live | API-11, API-02 |
| POR-65 | ui-notices | API-12, API-11 |
| POR-66 | ui-care | API-08, API-06 (indicaciones), API-13 |
| POR-67 | ui-discharge | API-14, API-05 |
| POR-68 | ui-family-patient | API-15, API-16, API-17 |
| POR-69 | ui-family-view | API-02, API-17, API-18 |
| POR-70 | a11y | API-05, API-06 (lo que se lee en voz alta); el resto solo UI |
| POR-71 | copy-pass | sin API: solo UI (textos) |
| POR-72 | deploy | API-28 |
| POR-73 | ui-record | API-26 |
| POR-74 | ui-cms | sin API: solo UI (lista fija de 6 hospitales CMS con fuente) |
| POR-75 | ui-privacy | API-24 (opt-out: solo UI) |
| POR-76 | ui-nurse | API-25 |
| POR-77 | ui-admit | API-19, API-08 |
| POR-78 | ui-tramites | API-20 |
| POR-79 | ui-nav | sin API: solo UI (reglas fijas firmadas, sin IA; guardar la respuesta es opcional y no está en el backlog) |
| POR-80 | ui-prereg | API-22 |
| POR-81 | ui-services | API-23 |
| POR-82 | ui-preauth | API-21, API-20 |
| POR-100 | ui-multi-caregiver | API-15, API-16, API-17 |
| POR-102 | ui-role-switch | API-03, API-02, API-01 |

### Integración
| Issue | Clave | API |
|---|---|---|
| POR-31 | contract | Todo este documento (aprobar v1; copiarlo al repo como `docs/contrato-de-datos.md`) |
| POR-83 | int-1 | API-01, API-10, API-11, API-27 (ORU del hemograma llega en < 5 s sin recargar) |
| POR-84 | int-2 | API-05, API-06, API-09, API-10, API-12, API-14, API-15, API-16, API-17, API-27 |
| POR-85 | neg-test | API-02, API-16, API-17, API-18 |

Issues que no se pudieron mapear a un dueño backend: **POR-76** (API-25) y **POR-73** (API-26) dependen de permisos que ningún issue backend pide explícitamente.

---

## 4. Qué falta decidir (corto)
1. **Búsqueda de un tipo sin permiso:** si Medplum 5.1.42 responde error (como en la práctica) y no Bundle vacío, ¿se añaden a las políticas de familia entradas que no devuelven nada, o se acepta esa excepción a canon §4? — el líder de backend (Claudio lo prueba el jueves).
2. Nombres de §1.5 (sistemas `urn:…`, ids del mock, variable `MEDPLUM_USE_MOCK`) y etapas 1–7 vs 0–6 — el líder de backend y el líder de frontend en POR-31.
3. Aviso al familiar cuando le quitan acceso: ¿basta consultar auth/me cada 5 s o se quiere un evento propio? — el líder de backend y el líder de frontend.
4. Valor crítico: ¿habrá un campo de "confirmación real del hospital"? Si no, siempre texto neutral — el líder de backend.
5. Política de paciente: permisos de **crear** (AppointmentResponse, QuestionnaireResponse, Communication) y de leer AuditEvent, HealthcareService y lo de "Mi récord" — el líder de backend.
6. ¿El familiar ve trámites y pre-autorización (hoy entran con `visita` o no entran)? — Carmen/diseño: El líder de backend y el líder de frontend.
7. Dato sensible de prueba: Observation (recomendado) o Condition (POR-50) — el líder de backend.
8. Puerto del servidor del simulador y nombre exacto del archivo del contrato en el repo (`docs/contrato-de-datos.md` según POR-31; la skill contrato-y-mock dice `docs/contratos.md`) — el líder de backend y el líder de frontend.
9. Seed de canon §6: **propuesto — falta OK del líder de backend y el líder de frontend**.
