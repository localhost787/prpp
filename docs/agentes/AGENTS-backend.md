# AGENTS — foco backend

Estado: borrador para el **agente de backend** (Claude Code, del líder de backend en el evento), preparado antes del evento (kit preparado antes del evento) para revisión con el líder de frontend. Solo instrucciones de trabajo, sin código del producto. Complementa comun/AGENTS.md y calza con frontend/AGENTS-frontend.md; no instala nada.

Puertos: `3000` = app de administración de Medplum (no tocar) · `3001` = app del evento · `8103` = servidor Medplum (5.1.42).

## Arranque de una tarea
1. Leer el núcleo común, el alcance aprobado y la skill pertinente. Consultar SPEC, DISENO-cuidadores-y-login y backlog/backend.md; si se contradicen, anotar la divergencia y preguntar al líder de backend antes de escoger.
2. Identificar recurso(s) FHIR, quién lee/escribe (paciente, cuidador, Bot, simulador), qué AccessPolicy aplica y qué consume el frontend.
3. Escribir primero la aceptación y la prueba negativa (quién NO debe poder ver/escribir). Sin prueba negativa no hay tarea de permisos.
4. Antes del 8 de octubre: solo documentos y diseño. Nada de Bots, seeds ni scripts del producto.

## Contrato con frontend (lo que backend entrega)
Por cada recurso que pinta una pantalla, publicar en docs/contratos.md antes de implementarlo:
- Recurso y búsqueda exacta (parámetros, `_include`, orden, paginación), con un ejemplo JSON sintético.
- Identidad (ámbito: un solo servidor FHIR): `resourceType/id` identifica el recurso y `meta.versionId` la versión. Una corrección es versión nueva, no duplicado (QA-10). Entre fuentes/instituciones la identidad de negocio es `identifier.system|value`; `meta.source` es solo dato de procedencia, nunca clave única ni de deduplicación.
- Estados y correcciones: `status` (preliminary/final/amended/corrected/cancelled) y qué debe mostrar el frontend en cada uno. Sin `interpretation` = "sin interpretación", nunca "Normal".
- Errores, sin filtrar existencia:
  - 401 = sesión vencida o inválida → volver a login.
  - Lectura/búsqueda de algo no autorizado responde IGUAL que algo inexistente: búsqueda → 200 con **Bundle vacío** (no error); lectura por id → **404**. El cuidador nunca distingue "no existe" de "no te dejan".
  - **403 solo para escrituras** rechazadas. Nunca para lecturas. Las pruebas aceptan exactamente esto.
  - El candado de una categoría apagada sale del Consent/membresía de la relación (endpoint de permisos), no de sondear recursos.
  - 5xx/red = error técnico con reintento. Verificar el comportamiento real de Medplum el día 8 (no probado).
- Actualizaciones: canal Subscription/WebSocket + refetch al volver al foco. Evento de invalidación sin datos clínicos: `{tipo: "permiso" | "datos", paciente: "Patient/<id>", categorias: [...], version: <meta.versionId del Consent o del recurso>, ts}`. Backend no conoce pantallas: el mapa categoría→pantallas vive en el frontend (canView).
  - El evento es aviso, no verdad: al recibirlo, refetch de permisos primero y luego datos. Evento con versión menor o igual a la conocida se ignora (llegada tardía o fuera de orden).
  - Al reconectar o volver al foco: refetch de permisos; si la versión cambió, limpiar las categorías que se apagaron antes de pintar nada.
  - El frontend avanza con mock del ejemplo mientras backend hace el real.
Un cambio de contrato se avisa en el hilo antes de tocarlo; no romper al frontend en silencio.

## Permisos: el servidor es la verdad
- Escrituras de permiso (Consent, membresía) serializadas y versionadas: update condicional con `If-Match: W/"<versionId>"`; si responde 412, releer, fusionar y reintentar. Nunca escribir desde una copia vieja (lección QAR-01/02 del ensayo: snapshots obsoletos perdieron revocaciones y altas concurrentes). Verificar soporte en Medplum el día 8 (no probado).
- Una AccessPolicy por categoría (las 4 del diseño, parametrizada por `%patient`); la membresía del familiar lleva una entrada por categoría autorizada. "Sin acceso" = política vacía: **una membresía vacía (sin entradas) = acceso total al proyecto**; nunca dejarla así. El Bot `compartir-familia` reemplaza solo las entradas de esa paciente. La UI es defensa adicional, no el control (QA-03/QA-04 del ensayo: la UI dejaba ver medicinas y visita sin permiso).
- Matriz de pruebas negativas: por cada categoría apagada, el cuidador recibe Bundle vacío (búsqueda) o 404 (lectura por id) en TODOS los recursos de esa categoría, incluidos Task, Communication, conteos y `_include` que la revelen. 403 solo al intentar escribir. Sin permiso de resultados: el conteo va en la Task de etapa y el aviso es un Communication neutral "Hay un resultado nuevo (privado)".
- Revocar en el servidor y limpiar una pantalla abierta son dos pruebas separadas. Backend prueba la primera y entrega el evento/señal para la segunda; no prometer "inmediato" sin medirlo.
- Permiso mínimo: cada Bot y el cliente del simulador con su propia ClientApplication y la membresía MÍNIMA de su tarea. Nada de admin por defecto (fue un atajo del ensayo); admin solo si una prueba demuestra que hace falta, y queda anotado en el issue. La llave del simulador vive solo en `127.0.0.1`, nunca en el navegador.
- Sensible (POR-50): restringir el conjunto de recursos relacionados, no solo Observation ni solo la etiqueta.

## Identidad y cuentas
- Una cuenta puede ser paciente y cuidador (POR-101). Separar ProjectMembership, Patient y RelatedPerson; revocar una relación no borra la cuenta ni otras relaciones.
- Invitar a los familiares (`RelatedPerson`) con `scope: 'project'` (por defecto Medplum los crea a nivel de servidor y se cruzan cuentas entre proyectos).
- No crear un Patient si la invitación ya lo creó: buscar antes. No vincular identidad por nombre + fecha de nacimiento + plan; MRN es por institución (`identifier.system`).

## Bots, simulador y datos
- Mensajes HL7 (ADT/ORM/ORU/RAS) del simulador → Bots → FHIR. Cada Bot: idempotente (reintentar el mismo mensaje no duplica), registra fuente en `meta.source`, falla con error claro y tiene prueba con mensaje bueno, malo y repetido.
- Seed y usuarios demo exclusivamente sintéticos, idempotentes y reproducibles con un comando: ver "Datos de prueba (seed)" en qa/guion-lourdes-carmen.md (Carmen, Lourdes, Rafael; issue dueño POR-35; seed propuesto — falta OK del líder de backend y el líder de frontend). Contraseñas solo en `.env`/`.secrets.json` local fuera de git. Resetear solo con OK humano: borra solo los datos de la visita; deja cuentas, datos fijos y el dato sensible de prueba.
- Auditoría (POR-52): AuditEvent de lecturas del cuidador; verificar que existe, no asumirlo.

## Terminado (backend)
Cada criterio en pasa / falla / no probado-bloqueado, con el comando o petición que lo demuestra. Mínimo: pruebas de Bots, matriz de permisos (positivas y negativas), contrato publicado con ejemplo, y prueba del paciente vacío (paciente nuevo = todo vacío, sin datos de otro). Reportar al líder de frontend qué cambió en el contrato.
