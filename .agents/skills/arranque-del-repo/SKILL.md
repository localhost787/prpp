---
name: arranque-del-repo
description: Úsala el jueves 8 en la noche, al crear el repo del portal. Lleva de repo vacío a kit + Medplum + portal corriendo en ~30–45 min, con evidencia de cada paso.
---
# Arranque del repo (jueves 8, noche)
Orden de los issues: kickoff (POR-28) → repo-init (POR-29) → repo-agents (POR-30) → contract (POR-31) → project-setup / mock-start en paralelo.
Antes de la hora permitida por los organizadores: nada de código del producto. Solo se copia el kit (texto) y se levanta lo instalado sin cambios.

**Pasos (cada uno termina con una evidencia, no con "listo"):**
1. El líder de frontend crea el repo en la organización (2FA activo) con README y licencia. Evidencia: URL del repo.
2. El líder de backend copia a la raíz el CONTENIDO de `~/hackathon/kit-listo` (armado en POR-21 desde la repo-plantilla del paquete, 07-Kit-agentes-laptop-nueva): AGENTS.md, docs/ y las **8 skills** iguales en `.claude/skills` (Claude Code) y `.agents/skills` (Hermes y Codex; para el agente de frontend también en el perfil de Hermes de la laptop del líder de frontend, fuera del repo). `.gitignore` con `.env`, `.env.local`, `medplum-link`. Evidencia: `git status` sin `.env`; búsqueda de claves en el diff = 0.
3. Cada agente (backend, frontend; Codex opcional) lee AGENTS + skills y recita: reglas que no se rompen, idioma, qué es "terminado", qué skills tiene. No cambia nada. Evidencia: la respuesta pegada en el hilo de arranque.
4. El líder de backend: Medplum 5.1.42 arriba (receta de POR-16, sin `:latest`; servidor 8103, admin en 3000: no tocar), clave de admin ya cambiada, proyecto del hackathon creado. Evidencia: las 4 piezas healthy + id del proyecto en `.env` local, no en git.
5. El líder de frontend: base del portal (foomedical si org-msg lo confirmó; si no, `@medplum/react`) en el puerto 3001 (el 3000 es del admin de Medplum) con modo mock por una sola línea de `.env`. Evidencia: Carmen visible en vista de celular, sin el Medplum del líder de backend.
6. Contrato inicial: el primer recurso (estado de la visita) publicado en docs/contratos.md con ejemplo sintético (ver skill `contrato-y-mock`).
7. Primer commit del kit por pull request aprobado por la otra persona. Push y merge a `main` solo con OK humano.

**Si algo se traba más de 15 minutos:** anotarlo en el hilo con el error exacto y seguir con el paso siguiente que no dependa de ese. Medplum de respaldo (POR-17) es el plan B, no una segunda tarea.

**No hacer:** copiar código del ensayo; usar el admin de fábrica; poner claves del simulador en el navegador; editar el docker-compose más allá de fijar la versión.
