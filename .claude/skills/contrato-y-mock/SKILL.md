---
name: contrato-y-mock
description: Úsala antes de construir cualquier pantalla o Bot que comparta datos. Backend y frontend acuerdan el recurso FHIR por escrito; frontend avanza con mock mientras backend hace el real.
---
# Contrato y mock
La frontera entre el líder de backend (servidor) y el líder de frontend (pantallas) es docs/contratos.md. Sin contrato escrito, ninguno de los dos empieza la pieza compartida.

**1. Proponer (quien necesita el dato, 10 min):** una entrada en docs/contratos.md con:
- Pantalla y destinatario (paciente / cuidador con qué categoría).
- Recurso y búsqueda exacta: parámetros, `_include`, orden, paginación.
- Un ejemplo JSON SINTÉTICO completo y uno "vacío" (paciente recién creado).
- Estados que se pintan (`preliminary`, `final`, `amended`, `corrected`, `cancelled`) y qué se muestra en cada uno. Sin `interpretation` = "sin interpretación", nunca "Normal".
- Errores, sin filtrar existencia (plantilla; **no probado en Medplum hasta el día 8**): 401 sesión vencida → login · búsqueda no autorizada → 200 con Bundle vacío · lectura por id no autorizada → 404, igual que inexistente · 403 solo para escrituras rechazadas (nunca en lecturas) · 5xx/red = error técnico con reintento. El candado de categoría sale del endpoint de permisos (Consent/membresía), nunca de sondear recursos. Privacidad ≠ error técnico.
- Actualización: evento de invalidación sin datos clínicos `{tipo: permiso|datos, paciente, categorias, version, ts}`, SIN pantallas (el mapa categoría→pantallas vive en canView). Al recibirlo: refetch de permisos y luego datos; versión ≤ conocida se ignora. Al reconectar o volver al foco: refetch de permisos y limpiar lo apagado antes de pintar.
- Identidad, tres cosas separadas: local (un servidor) = `resourceType/id` + `meta.versionId`; institucional = `identifier.system|value`; procedencia = `meta.source` (nunca clave ni dedupe).

**2. Aceptar (la otra persona, 5 min):** "OK contrato <nombre> v1" en el hilo. Desde ahí:
- Frontend carga el ejemplo en `@medplum/mock` y construye contra él.
- Backend implementa y añade una prueba que compara su salida real con el ejemplo (mismos campos).

**3. Cambiar:** subir versión (v2), avisar en el hilo ANTES de tocar, y decir qué se rompe. Nunca cambiar un contrato en silencio.

**4. Cerrar:** en el punto de integración se cambia una línea de `.env` (mock → real). Si algo no calza, el contrato manda: se corrige el lado que se apartó.

**Comprobar antes de decir "terminado":** el mismo flujo pasa con mock y con real; el ejemplo vacío no muestra datos constantes; un cuidador sin la categoría recibe Bundle vacío o 404 (igual que inexistente), nunca el dato. Cada regla marcada 'no probado' pasa a 'pasa/falla' solo con prueba contra Medplum real.
