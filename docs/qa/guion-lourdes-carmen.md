# Guion de prueba: Lourdes → Carmen → revocación

Estado: GUION, no ejecutado. Se corre cuando el líder de frontend/el líder de backend aprueben login (seed sintético o equivalente).
Datos: solo personas inventadas. **Ninguna credencial, token ni URL privada en este archivo ni en sus resultados.**
Resultado de cada paso: `pasa` / `falla` / `no probado-bloqueado` + evidencia (captura, código HTTP, hora).

## Datos de prueba (seed) — BORRADOR: seed propuesto, falta OK del líder de backend y el líder de frontend
Issue dueño: **POR-35** (backend). 100% inventados; hospital: "Hospital Demo". Contraseñas NUNCA aquí ni en el repo: van en `.env`/`.secrets.json` local fuera de git. El seed es idempotente (actualiza sin duplicar; la invitación crea el Patient).
- **Carmen** (paciente, MRN-0001): visita activa a Emergencias, ESI 3; 1 orden de hemograma (resultado listo), 1 medicina administrada (Ceftriaxona), instrucciones de alta + 1 cita de seguimiento. Nada con etiqueta R, excepto 1 recurso de prueba con etiqueta R para comprobar que nunca se comparte.
- **Lourdes** (hija de Carmen y también paciente, MRN-0002): cuidadora con Estado + Medicinas + Instrucciones (SIN resultados). Tiene su propia ficha ("Mi salud").
- **Rafael** (esposo de Carmen): cuidador con las 4 categorías.

## Precondiciones
- P1. Medplum local arriba, versión anotada.
- P2. Carmen (paciente) con datos sintéticos en las 4 categorías, incluido 1 recurso con etiqueta R (sensible).
- P3. Lourdes (cuidadora) con permiso: Estado + Medicinas + Instrucciones. **Sin** Estudios y resultados (como en DISENO §3).
- P4. Membresía de Lourdes nunca sin entradas (sin acceso = política vacía).
- P5. Rafael (cuidador) con las 4 categorías.

## A. Login y contexto
| # | Paso | Esperado |
|---|---|---|
| A1 | Lourdes inicia sesión | Entra; arriba se ve cuenta "Lourdes" y paciente activo |
| A2 | Selecciona a Carmen | Contexto cambia a Carmen; no aparece ninguna otra paciente que no cuide |
| A3 | Lourdes cambia a "Mi salud" y vuelve a "Cuido a: Carmen" | En "Mi salud" ve solo su ficha (sí ve su MRN); al volver, solo datos de Carmen (sin MRN ni dirección de Carmen). Nada del contexto anterior queda en pantalla |

## B. Permisos por categoría (servidor + pantalla)
| # | Paso | Esperado |
|---|---|---|
| B1 | Ver Estado en Emergencias | Encounter/Task visibles; Patient sin identificadores ni dirección |
| B2 | Ver Medicinas | MedicationRequest/Administration visibles |
| B3 | Ver Instrucciones | CarePlan/Appointment visibles |
| B4 | Pantalla de Estudios | Candado o "no compartido"; **nunca** "Normal" ni vacío ambiguo |
| B5 | Búsqueda y GET por id a Observation/DiagnosticReport de Carmen | Búsqueda → Bundle vacío (no error); lectura por id → 404. Nunca 403 en lectura |
| B6 | Avisos | Ningún aviso `estudios`/`resultado`; conteos y `_include` no revelan que existen |
| B7 | Recurso con etiqueta R | No visible en ninguna categoría |
| B8 | Rafael inicia sesión y abre a Carmen | Ve las 4 categorías (incluidos Estudios y resultados) |
| B9 | Recurso con etiqueta R, como Rafael (todo autorizado) y como Lourdes | Nunca visible para ningún familiar, ni en búsqueda, ni por id, ni en avisos o conteos |

## C. Revocación (dos pruebas separadas)
| # | Paso | Esperado |
|---|---|---|
| C1 | Con la pestaña de Lourdes abierta en Medicinas, Carmen quita Medicinas (Bot compartir-familia) | El Bot reemplaza **solo las entradas de Carmen** en la membresía de Lourdes (Estado + Instrucciones quedan); la decisión queda registrada/versionada en el Consent de Lourdes (`provision.class` sin Medicinas, nuevo `meta.versionId`). Un solo Consent por persona, no uno nuevo |
| C2 | Servidor: búsqueda de MedicationRequest como Lourdes (y GET por id) | Bundle vacío (búsqueda) / 404 (por id). Anotar segundos desde C1 |
| C3 | Pantalla abierta: sin recargar | Se limpia por evento, o al volver el foco (refetch). Anotar segundos y cuál de los dos |
| C4 | Lo no revocado | Estado e Instrucciones siguen visibles; otras relaciones de Lourdes intactas |
| C5 | Revocar todo | Política vacía (nunca membresía sin entradas); Lourdes no ve a Carmen; cuenta de Lourdes y su "Mi salud" siguen intactas |
| C6 | Multi-cuidador: Carmen cambia lo de Lourdes (C1/C5) | Rafael sigue viendo sus 4 categorías, sin cambios |

## D. Cierre
- Pegar resultados en la matriz de QA del agente de apoyo (pedírsela al líder de frontend) con los IDs A1…C6.
- Toda `falla` abre issue con el ID del paso. Nada se declara "listo" con pasos en `no probado-bloqueado`.
