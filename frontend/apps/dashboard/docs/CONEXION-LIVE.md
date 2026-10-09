# Conexión live (Medplum real)

Capa de datos en `src/live/` para pasar el dashboard del mock al servidor Medplum 5.1.42. No toca la UI: el equipo de frontend la conecta. Solo lee, salvo el Bot `compartir-familia` (compartir/quitar).

## Cómo activarlo

Variables públicas de Expo (van dentro del JavaScript que descarga cualquiera):

| Variable | Valor |
|---|---|
| `EXPO_PUBLIC_DATA_MODE` | `mock` (por defecto) o `live` |
| `EXPO_PUBLIC_MEDPLUM_BASE_URL` | dirección del servidor |
| `EXPO_PUBLIC_MEDPLUM_PROJECT_ID` | id del proyecto |
| `EXPO_PUBLIC_BOT_COMPARTIR_ID` | opcional; solo si la búsqueda del Bot no está permitida |

`readConfig()` las lee; si falta alguna, `live` queda en `false` y la app sigue en mock.

**Contraseñas:** las de las cuentas demo nunca se suben al repositorio. Ponerlas en `EXPO_PUBLIC_*` las hace públicas; si se quieren botones de "entrar con un clic", lo decide el líder del equipo (solo en local, nunca en el despliegue público).

## Qué función alimenta cada pantalla

| Pantalla (POR) | Función |
|---|---|
| Entrada / salir (POR-58, POR-102) | `login`, `logout`, `getRoles`, `openLiveSession` (devuelve la misma forma de sesión del mock: `patient`, `permissions`) |
| Candados (POR-69) | `loadAccess(client)` → `access.canView(patientId, categoria)`; `permissionsFor(id)` = `session.permissions` |
| Mi visita, etapa, fila (POR-60, POR-61) | `getVisit` (forma de `visitFixture`), `getStage`; adaptador `liveVisitSource(ctx)` para `createVisitController` |
| Estudios (POR-62) | `getStudies` |
| Resultados (POR-63) | `getResults` (Observation + `report`, como `resultFixtures`); adaptador `liveResultsSource(ctx)` |
| Mi cuidado (POR-66) | `getCare` (misma forma que `loadCare`), `getCareTeam`, `getMedications` |
| Alta (POR-67) | `getPrescriptions`, `getCarePlan`, `getAppointments` |
| Avisos (POR-65) | `getNotices` |
| Tiempo real (POR-64) | `subscribePatient(client, access, patientId, { onChange })` → `unsubscribe()` |
| Familia (POR-68, POR-100) | `listFamily`, `setFamilySharing`, `revokeFamilyAccess`, `toggleCategory` |

`ctx = { client, access, patientId, encounterId? }`.

## Regla del candado

Cada lectura devuelve `{status:'ok', data}`, `{status:'locked'}` o `{status:'error', error}`.
El candado sale **solo** de auth/me (API-02): si `canView` dice que no, no se consulta al servidor y es `locked`. Si dice que sí y la lectura falla, es `error` ("No pudimos cargar. Reintentar"). Permitido y vacío = `ok` con `[]` o `null` ("Todavía no hay…"). Volver a pedir `loadAccess` al entrar, al cambiar de rol, al volver el foco, después del Bot y cada ~5 s en la vista del familiar.

## Modo demostración

`withFallback(liveFn, mockFn)`: si el servidor no responde (red, 5xx o ~4 s), devuelve el mock con `demoFallback: true` para mostrar "Modo demostración". Nunca reemplaza un candado ni un 401/403.

## Diferencias con el mock

- Textos del servidor solo en español (`{es, en}` con el mismo texto).
- `clinician` viene con prefijo ("Dra. …"); `cubicle` se saca del nombre del lugar; `roleKey` solo se reconoce "Médica de Emergencias" (el resto queda en `roleText`).
- Los ids son UUID; `loadCare` del mock solo acepta ids del mock: usar `getCare` directamente.
- Las indicaciones actuales salen de la Task de etapa (`indicacion`); las del alta, de `getCarePlan`.

## Pruebas

`node --test tests/live-unit.node.mjs` (sin red). `tests/live-server.node.mjs` solo corre si existe el archivo local de entorno (fuera del repo); cambia lo compartido y restaura el seed al final.
