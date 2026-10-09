# Conexión live (Medplum real)

Capa de datos en `src/live/` para pasar el dashboard del mock al servidor Medplum 5.1.42. No toca la UI: el equipo de frontend la conecta. Solo lee, salvo el Bot `compartir-familia` (compartir/quitar).

## Primer bloque recomendado

1. **Modo integrado explícito, separado del mock.** `resolveDataMode()` decide: `live` (servidor disponible), `unavailable` (mostrar error y **ofrecer** "Modo demostración sin servidor") o `mock` (solo si la persona lo eligió o la configuración no es live). Nunca se mezclan datos del mock con datos del servidor; cambiar de modo reinicia sesión y estado de la UI.
2. **Login:** formulario manual (correo + contraseña) y, si están configuradas, botones "Entrar como Carmen / Lourdes / Rafael" (`demoButtons(cfg)` + `loginDemo(cfg, key)`), ambos contra el **servidor real**.
3. **Perfil + auth/me → 4 permisos explícitos** (`getRoles`, `openLiveSession`, `access.permissionsFor(patientId)`).
4. **Leer solo la visita y la Task de etapa** (`getVisit`, `getStage`).
5. **Probar:** permitido con datos, permitido vacío, error técnico, 401 (sesión vencida → volver al login), y cambio de contexto (cuenta/paciente/rol: `closeAll(client)` + limpiar estado + nuevo auth/me).

## Cómo activarlo

Variables públicas de Expo (van dentro del JavaScript que descarga cualquiera). Ver `.env.example` (solo marcadores):

| Variable | Valor |
|---|---|
| `EXPO_PUBLIC_DATA_MODE` | `mock` (por defecto) o `live` |
| `EXPO_PUBLIC_MEDPLUM_BASE_URL` | dirección del servidor |
| `EXPO_PUBLIC_MEDPLUM_PROJECT_ID` | id del proyecto (**obligatorio**: sin él el servidor responde 400 "User not found") |
| `EXPO_PUBLIC_BOT_COMPARTIR_ID` | opcional; solo si la búsqueda del Bot no está permitida |
| `EXPO_PUBLIC_DEMO_{CARMEN,LOURDES,RAFAEL}_{EMAIL,PASSWORD}` | opcionales; activan los botones de entrada demo |

`readConfig()` las lee; si falta la URL o el proyecto, `live` queda en `false` y no hay botones demo. Si a una cuenta demo le falta el correo o la contraseña, su botón no aparece.

## Credenciales demo (decisión del equipo)

- Los valores **nunca** se suben al repositorio: ni en código, ni en `.env.example`, ni en documentos, ni en pruebas. Solo en las variables de Vercel o en un `.env` local que git ignora.
- El formulario manual y los botones demo escriben/usan la contraseña solo en memoria para `login()`; nada la guarda.
- **Riesgo aceptado:** con `EXPO_PUBLIC_DEMO_*` los valores quedan visibles en el bundle público. Mitigación: datos 100 % sintéticos, cuentas sin privilegios de admin y de mínimo privilegio (verificado: 403 en `admin/`, `ProjectMembership`, `AccessPolicy` y en cualquier escritura clínica), y rotación de las contraseñas al terminar el hackathon.
- El servidor permite 5 logins por minuto por IP: no reintentar en bucle (`LIVE_LOGIN_THROTTLED`).

## Login

`login(email, password, cfg)` sigue la respuesta de `startLogin` sin suponer que trae `code`: `code` → `processCode`; `memberships` → elige la del proyecto y `POST auth/profile`; `mfaRequired` → `LiveLoginError` `LIVE_LOGIN_MFA_REQUIRED`; otra cosa → `LIVE_LOGIN_UNEXPECTED`. Errores tipados (`err.code`): `LIVE_CONFIG_INCOMPLETE`, `LIVE_LOGIN_REJECTED` (correo/contraseña: el servidor da 400), `LIVE_LOGIN_THROTTLED`, `LIVE_NO_PROJECT_MEMBERSHIP`, `LIVE_UNAVAILABLE`.

Sesión: el cliente usa memoria por defecto (recargar = volver a entrar). El SDK puede usar `localStorage` si se le pasa ese `storage`; aceptable para la demo. `logout()` revoca y limpia.

## Qué función alimenta cada pantalla

| Pantalla (POR) | Función |
|---|---|
| Entrada / salir (POR-58, POR-102) | `login`, `loginDemo`, `logout`, `getRoles`, `openLiveSession` (devuelve la misma forma de sesión del mock: `patient`, `permissions`) |
| Candados (POR-69) | `loadAccess(client)` → `access.canView(patientId, categoria)`; `permissionsFor(id)` = `session.permissions` |
| Mi visita, etapa, fila (POR-60, POR-61) | `getVisit` (forma de `visitFixture`), `getStage`; adaptador `liveVisitSource(ctx)` para `createVisitController` |
| Estudios (POR-62) | `getStudies` |
| Resultados (POR-63) | `getResults` (Observation + `report`, como `resultFixtures`); adaptador `liveResultsSource(ctx)` |
| Mi cuidado (POR-66) | `getCare` (misma forma que `loadCare`), `getCareTeam`, `getMedications` |
| Alta (POR-67) | `getPrescriptions`, `getCarePlan`, `getAppointments` |
| Avisos (POR-65) | `getNotices` |
| Tiempo real (POR-64) | `subscribePatient(client, access, patientId, { onChange })`; `closeAll(client)` al cambiar de contexto |
| Familia (POR-68, POR-100) | `listFamily`, `setFamilySharing`, `revokeFamilyAccess`, `toggleCategory` |

`ctx = { client, access, patientId, encounterId? }`.

## Regla del candado (solo auth/me)

Cada lectura devuelve `{status:'ok', data}`, `{status:'locked'}` o `{status:'error', error}`. El candado sale **solo** de auth/me; un 403, 404 o una lista vacía nunca deciden el candado (el servidor da 200 vacío para tipos clínicos no compartidos, 403 para tipos fuera de la política y 404 al leer por id algo no visible).

Regla estable, sin buscar texto dentro de otro texto (`permissions.mjs`):
- **Familiar:** la categoría está permitida para el paciente `P` solo si `accessPolicy.basedOn[].display` es **igual** al nombre de la política de esa categoría (`Familiar: estado en Emergencias`, `Familiar: medicinas`, `Familiar: instrucciones del alta`, `Familiar: estudios y resultados`) **y** existe en `accessPolicy.resource[]` la entrada del tipo ancla (Encounter, MedicationAdministration, CarePlan, DiagnosticReport) con `criteria` **igual** a `<Tipo>?patient=Patient/<P>&_security:not=http://terminology.hl7.org/CodeSystem/v3-Confidentiality|R`.
- **Récord propio** ("Mi salud"): `basedOn` incluye `Paciente (portal)` y existen exactamente `Patient?_id=<P>` y `Encounter?_compartment=Patient/<P>` → las 4 categorías.
- Si auth/me no tiene esa forma → todo con candado (falla cerrada).

Volver a pedir `loadAccess` al entrar, al cambiar de rol, al volver el foco, después del Bot y cada ~5 s en la vista del familiar (el cambio se ve con el mismo token, en menos de 1 s).

## Tiempo real

Solo se suscribe a las categorías que auth/me permite (el servidor acepta crear suscripciones de tipos no permitidos y simplemente no entrega sus eventos). `onChange({ types })` trae solo los tipos que cambiaron: **releer** esas secciones, nunca pintar el contenido del aviso. Al cambiar de cuenta, paciente o rol, y al salir: `closeAll(client)`.

## Sin servidor

`checkLive(cfg)` (GET `healthcheck`) y `withLive(fn)`: si el servidor no responde (red, 5xx o ~4 s) devuelven `{status:'unavailable'}`; nunca devuelven datos del mock. La UI muestra el error y ofrece "Modo demostración sin servidor" como elección explícita.

## Diferencias con el mock

- Textos del servidor solo en español (`{es, en}` con el mismo texto).
- `clinician` viene con prefijo ("Dra. …"); `cubicle` se saca del nombre del lugar; `roleKey` solo se reconoce "Médica de Emergencias" (el resto queda en `roleText`).
- Los ids son UUID; `loadCare` del mock solo acepta ids del mock: usar `getCare` directamente.
- Las indicaciones actuales salen de la Task de etapa (`indicacion`); las del alta, de `getCarePlan`.
- La visita puede estar en alta (`status: finished`): no filtrar por `in-progress`.

## Pruebas

`npm test` (sin red). `tests/live-server.check.mjs` solo corre si existe el archivo local de entorno (fuera del repo); cambia lo compartido y restaura el seed al final.

> La prueba contra el servidor **no** corre con `npm test` (cambia por un momento lo que comparte la cuenta de demo). Se corre a mano: `node --test tests/live-server.check.mjs`. Nunca durante una demo.
