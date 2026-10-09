---
name: trabajo-en-pareja
description: Úsala al empezar una tarea, al terminarla o cuando haya conflictos de git. Coordina el trabajo de dos personas con dos agentes sobre el mismo repo.
---
# Trabajo en pareja (el líder de backend + el líder de frontend, cada uno con su agente)
**Al empezar:**
1. `git pull` en `main` y crea una rama con el rol y la tarea, nunca con nombres de personas (`front-resultados`, `back-seed`).
2. Confirma que la tarea está en la lista del día y que nadie más la tiene.

**Mientras trabajas:**
- No toques archivos del área del otro sin avisar. El reparto sugerido es:
  - El líder de backend: servidor, Bots y simulador;
  - El líder de frontend: pantallas del portal.
- Haz commits pequeños con mensajes en español.

**Al terminar:**
1. Corre la skill `listo-para-demo` (los puntos que apliquen).
2. Escribe un resumen para la otra persona: qué cambió, cómo probarlo y si toca algo de su área.
3. Unan a `main` en los **puntos de integración** (skill `integracion-cada-3h`: controles cada ~3 h + int-1 ~11 AM e int-2 ~4:30 PM del viernes), no a cada rato.

**Si hay conflicto de git:** explícalo en palabras ("los dos cambiaron el título de la pantalla de resultados"), propone cuál versión dejar y **espera el OK** antes de resolverlo.
