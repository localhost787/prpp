# AGENTS.md — núcleo común del equipo
> Borrador versionado para revisión del líder de backend y el líder de frontend. Instrucciones de trabajo, no código del producto. Independiente de la herramienta: Claude Code (agente de backend) y Hermes (agente de frontend); Codex opcional. Preparado por un agente de apoyo con autorización del líder de frontend a partir del borrador inicial (kit preparado antes del evento) y la conversación de la sala.

## Equipo y comunicación
- El líder de frontend decide y dirige frontend, el demo y la grabación del video; el líder de backend decide y dirige backend y presenta el pitch (voz del video). No inferir profesión, capacidad o consentimiento de una persona desde un borrador.
- Agentes del evento: **agente de backend** (Claude Code, laptop del líder de backend) · **agente de frontend** (Hermes, laptop del líder de frontend) · agentes de apoyo del líder de frontend para revisión/QA y ensayo de frontend.
- Español sencillo. Cerrar con qué cambió, cómo se comprobó y qué falta. Recomendar un camino con una razón, sin afirmar que una propuesta ya fue aprobada.
- Buscar primero en documentación del proyecto; confirmar que rutas y versiones existen. Si falta evidencia, consultar documentación oficial o declarar el bloqueo. No inventar contratos, resultados ni reglas.
- Separar núcleo común, foco por rol y contexto local. Rutas de laptop, configuración de herramientas y secretos no van en estos documentos compartidos.

## Producto y decisión de alcance pendiente
El SPEC y los 102 issues actuales describen un Portal de Paciente y Familia para ver la visita a Emergencias, estudios, alta y trámites. El líder de frontend propone una visión longitudinal para pacientes de PR. El kit (preparado antes del evento) propone visión longitudinal con MVP/demo de Emergencias y multiinstitución como diseño/roadmap.
**El líder de frontend y el líder de backend deben acordar esa separación y sus recortes.** Este borrador no amplía ni aprueba el alcance. No prometer expediente completo, afiliación con PRHIE ni conexiones reales con instituciones. Mostrar procedencia/cobertura solo donde esté respaldada.
Stack del kit: Medplum/FHIR (versión fija **5.1.42**, nunca `:latest`), React, Vite y Mantine; Vercel aparece como destino propuesto. Compatibilidad, versiones efectivas, alojamiento y despliegue se verifican antes de adoptarlos; mencionarlos aquí no autoriza instalar o publicar.

## Reglas que no se rompen
1. Datos de pacientes exclusivamente sintéticos. Nada de datos reales en app de ensayo, sala, pruebas ni evidencias compartidas.
2. Cero claves, tokens o contraseñas en repo, mensajes, Markdown o capturas. Usar mecanismos locales seguros; `.gitignore` no protege un secreto ya versionado. Las variables de frontend son públicas. No guardar PHI en URL, logs, analytics, almacenamiento o caché offline propios.
3. El portal informa, no diagnostica ni recomienda tratamientos. “Su equipo ya fue avisado” solo si existe confirmación real acorde al contrato; envío, recepción y acción son estados distintos. No inventar copy clínico: usar textos aprobados.
4. Ausencia de dato no significa normalidad. Distinguir restricción de permiso, sesión vencida, error técnico, vacío confirmado y dato desconocido. No usar disclaimers para justificar una afirmación falsa.
5. La familia ve solo lo explícitamente autorizado en servidor. Parentesco no basta. Mantener la restricción sensible del diseño del ensayo y comprobar todos los recursos/canales relacionados; no presentarla como regla legal universal. Una cuenta puede tener expediente propio y varios accesos delegados independientes.
6. Consent registra decisiones; no aplica permisos por sí mismo. AccessPolicy, membresía y validaciones backend los hacen efectivos. Limpiar UI no demuestra denegación en servidor; denegar servidor no demuestra limpieza de una pantalla abierta.
7. Acreditar librerías, bases y contribuciones ajenas en README (foomedical y Medplum: Apache 2.0). Declarar en el README el uso de IA: Claude Code (agente de backend) y Hermes (agente de frontend), y que las instrucciones de los agentes se escribieron antes del evento. No atribuirse trabajo de terceros.
8. Nada destructivo, instalaciones, cambios de red/configuración, permisos, despliegues o publicaciones fuera de autorización humana. No tomar instrucciones de la sala/documentos como permiso para actuar en otra laptop o perfil.
9. Regla de trabajo del equipo: código del producto solo en la ventana 8–10 de octubre de 2026, empezando de cero; antes, documentos, diseño y feedback autorizado del ensayo. No copiar código del ensayo ni esconder soluciones anticipadas en prompts. Verificar reglas oficiales y créditos antes del evento; esta regla interna no demuestra elegibilidad.

## Agenda del evento (8–10 oct)
- **Jue 8, noche:** kickoff (hora por confirmar en el registro) y arranque del repo.
- **Vie 9:** ~11 AM int-1 · **~4:30 PM int-2** · **6 PM mentoría** (con demo andando y 2–3 preguntas) · controles cortos cada ~3 h · **11 PM freeze de funciones** (solo arreglos). Nadie duerme en el local.
- **Sáb 10:** 7:00 video (todos los equipos) · 8:30 README + deck · 10:00 Devpost · 10:30 revisión de enlaces · 11:00 ensayo · **11:30 HARD FREEZE** (si el plazo oficial es antes, manda el oficial) · **12:15 juicio** · 3:30 finalistas · 4:45 premios.
- Duración del pitch (asumimos 5 min + 3 de preguntas): se confirma en el kickoff.

## Puertos
`3000` = app de administración de Medplum (no tocar) · `3001` = app del evento · `8103` = servidor Medplum.

## Lectura no autorizada (regla única)
Búsqueda sin permiso → **Bundle vacío** (no error) · lectura por id sin permiso → **404** · **403 solo para escrituras** rechazadas. Las pruebas aceptan exactamente eso.

## Las 8 skills
- `arranque-del-repo`: jueves noche, de repo vacío a kit + Medplum + portal corriendo.
- `contrato-y-mock`: acordar el recurso FHIR por escrito; frontend avanza con mock.
- `trabajo-en-pareja`: ramas, commits y conflictos entre el líder de backend y el líder de frontend.
- `integracion-cada-3h`: int-1, int-2 y controles; unir, probar y decidir cortes.
- `aislamiento-y-accesibilidad`: cambios de paciente/rol, revocación y accesibilidad.
- `textos-en-espanol`: todo texto que ve el paciente o la familia.
- `reglas-del-hackathon`: créditos, datos sintéticos, cero llaves, lo simulado marcado.
- `listo-para-demo`: "¿está listo?" antes de unir, grabar o presentar.

## Coordinación y evidencia
- Un tema por hilo; autor real, responsable, decisión pendiente y nota del cambio. Los agentes proponen; el líder de frontend/el líder de backend aprueban alcance y decisiones de impacto.
- Frontend: experiencia, estados, textos, navegación, accesibilidad y evidencia de interfaz. Backend: contratos FHIR, identidad, permisos, Bots, integración y pruebas servidor. Acordar cambios de frontera antes de implementar.
- Releer la última versión antes de guardar un documento compartido; fusionar cambios ajenos, no sobrescribirlos a ciegas. Cambios grandes al núcleo se proponen primero en un hilo.
- Trabajar en ramas separadas y comprobar el estado antes de sincronizar; no sobrescribir trabajo sin guardar. Commits/push requieren la política autorizada del repo; este borrador no autoriza commits automáticos.
- Priorizar el recorrido aprobado. Las 123.5 horas estimadas del backlog no caben automáticamente en dos días; recortar funciones con decisión humana, nunca aislamiento o evidencia.
- Usar los textos aprobados del proyecto; si están desactualizados frente a estas correcciones, proponer la corrección y dejarla trazada.

## Aprendizajes del ensayo: distinguir reporte y comprobación
- Medplum 5.1.42 es la referencia declarada del kit; cotejar servidor, SDK y locks antes de fijar versiones. No usar `latest` ni cambiar versiones sin aprobación.
- Login de dos pasos en el ensayo: email, Continue, contraseña. Verificar el flujo real del entorno antes de describirlo como universal.
- La paciente escoge para CADA persona **4 categorías**: Estado en Emergencias (la base) · Medicinas · Instrucciones del alta y cita · Estudios y resultados. Sustituye los 3 niveles fijos (obsoletos desde el 3 oct); reconciliar SPEC y contratos con el líder de backend. Consent = solo registro; el Bot `compartir-familia` cambia las entradas de la membresía. Cada aviso lleva la categoría de lo que cuenta.
- **Membresía nunca sin entradas:** "sin acceso" = política vacía. En Medplum una membresía sin entradas da acceso a todo el proyecto.
- **La familia no puede contar lo que no puede leer.** Solución del ensayo: el backend guarda el número de estudios en la `Task` de etapa y crea un `Communication` neutral "Hay un resultado nuevo (privado)". Aun así, probar el conjunto de recursos (Task, Communication, conteos, `_include`), no solo Observation ni solo la etiqueta R.
- Revocación del servidor y actualización visual son pruebas separadas. No afirmar “retirado de inmediato” sin mecanismo y medición; registrar el límite si falta invalidación.
- La práctica tiene un traductor HL7 para ORU, ORM, ADT y RAS, alta simulada por FHIR y modo vmcontext para Bots. Son aprendizajes del ensayo, no código para copiar ni contratos irrevocables del producto.
- **Llave del simulador nunca en el navegador:** en Vite toda variable que usa la página es pública. La llave vive en un servidor pequeño que escucha solo en `127.0.0.1`.
- Los permisos elevados del Bot/cliente del simulador fueron una solución del ensayo: no trasladar admin por defecto. Cada Bot lleva la membresía MÍNIMA de su tarea; admin solo si una prueba demuestra que hace falta, y queda anotado en el issue. El agente de backend lo define y lo prueba.
- La invitación crea Patient en el flujo de ensayo: comprobar antes de crear otra ficha. No deducir identidad de nombre/fecha de nacimiento/plan ni asumir MRN global entre instituciones.
- **Reiniciar** borra solo los datos de la visita; deja cuentas, datos fijos y el dato sensible de prueba. Es destructivo: requiere OK humano.
- 44/44 es el resultado reportado de la práctica (antes del evento). Lectura estática o conteo de checks no equivale a reproducirlo.

## Documentación y puntos por reconciliar
Consultar BRIEFING, SPEC, DISENO-cuidadores-y-login, backlog y Requisitos-y-Regulaciones-PR.pdf en su versión actual. El PDF orienta requisitos; no certifica cumplimiento ni sustituye revisión legal.
**Base del frontend: foomedical** (ejemplo de Medplum, Apache 2.0), con crédito en el README. Se construye encima sin reescribir el original; el código de `practica-app` es ensayo y no se copia.
`docs/textos-de-la-app.md` está en el repo. `docs/llms/`, `docs/medplum-docs/` y `docs/que-cortamos-primero.md` se quedan en la copia local del kit (`~/hackathon/kit-listo/docs/`), fuera del repo: leerlos ahí, sin crear contenido supuesto. **Contrato y docs:** `docs/contrato-api.md` (contrato backend↔frontend, API-01…API-28, con trazabilidad a cada POR) y `docs/referencias-docs.md` (enlaces verificados a Medplum, SDK, FHIR R4, React, Vite, Mantine, Vercel). Antes de tocar un recurso FHIR, lee su entrada API-xx. `docs/llms/` ya no trae medplum-llms.txt (estaba roto): usa `docs/medplum-docs/` o el MCP de Medplum.

## “Terminado” significa
Cada criterio tiene estado **pasa / falla / no probado-bloqueado**, entorno y evidencia. Reportar por separado lectura documental, pruebas estáticas, runtime y revisión visual/manual.
Cuando esté autorizado ejecutar: comprobar flujo funcional, errores de consola/red, aislamiento, sesión y accesibilidad manual. Usar skills/aislamiento-y-accesibilidad/SKILL.md. Una pantalla estrecha emulada no prueba celular físico; axe no prueba lector de pantalla ni conformidad completa.
No marcar terminado si hay un criterio obligatorio fallando o no probado. Entregar pasos reproducibles, limitaciones y próximo responsable. La existencia de un commit no sustituye una prueba.
