# AYO-114 — primer recorrido preparado (no integración remota)

## Alcance
Rama desde main: feat/ayo114-session-results. Solo frontend.
ResultsPanel acepta `session.mode = 'live'` y `session.resultsSource`. La entrada pública App sigue mock: no se introduce login, configuración live, variables públicas ni credenciales.

`createAuthorizedResultsSource(getContext)` recibe un cliente Medplum ya autenticado externamente y un snapshot inmutable `{client, patientId, account, role, permissions}`. El dueño de sesión debe reemplazar el snapshot al cambiar sesión, persona o permisos y volver a renderizar ResultsPanel con una sesión nueva. Este contrato de inyección frontend NO implementa auth/me ni sustituye verificación del servidor.

Lecturas Observation y DiagnosticReport filtradas por paciente, sin caché. Permiso explícito antes de lecturas. Revisión de contexto después de cada await. Sin fuente válida, no vuelve a fixtures. Duplicados, paciente inesperado, paginación adicional o asociación ambigua producen error en vez de mostrar información potencialmente incompleta/equivocada. No define política de versiones de AYO-99.

En modo live, tarjetas usan datos suministrados y se omiten agrupaciones, instituciones y PDFs ficticios. Copy separado para carga/error/vacío/permisos desconocidos. El mock conserva sus informes y flujo anterior.

## Verificación ejecutada
- RED: módulo ausente; contrato de inyección ausente; browser detecta texto de error de ejemplo incorrecto.
- `npm test`: 96 pasa, 0 falla.
- `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 npm run export:web`: pasa.
- `node tests/live-results-browser.mjs`: componente real y adaptador con cliente de prueba sintético, 320/390/1280; permiso denegado/desconocido cero consultas, interpretación desconocida, preliminar, vacío/error/reintento, respuesta tardía y ausencia de PDF. Cero solicitudes de red; no es prueba Medplum integrada.
- entry/results/reports-browser sobre export aislado mediante Playwright route fulfillment: pasan. Sin servidor localhost. PDFs mock conservados.
- Avisos use-client del bundler y localStorage experimental de Node preexistentes; no equivalen a errores de navegador ni fueron ocultados.

## Pendiente antes de activar live
Autenticación autorizada, normalización de identidad/permisos desde servidor, sesión vencida/desconexión diferenciadas según errores reales, paginación y procedencia/versiones acordadas, conexión del store principal, Visita/Mi cuidado/Familia, compartir/retirar, pruebas reales de revocación y dato sensible, accesibilidad completa/nativo. El primer corte no habilita live público y no cierra AYO-114.
