---
name: aislamiento-y-accesibilidad
description: Úsala al probar cambios de paciente o rol, revocación y avisos. Verifica aislamiento y uso accesible con datos sintéticos.
---

# Aislamiento de paciente y accesibilidad

Estado: borrador compartido para revisión frontend/backend. Es un procedimiento, no código ni constancia de pruebas ya ejecutadas.

## Cuándo usar
Al diseñar o revisar login, logout, selector de paciente/rol, caché, suscripciones, revocación, notificaciones y pantallas clínicas; repetir tras cualquier cambio que afecte esos flujos.

## Preparación
- Confirmar autorización de pruebas y entorno; datos sintéticos exclusivamente. Nada de ataques, carga ni producción. Respetar límites de login del ensayo.
- Registrar versión/build, navegador, viewport/dispositivo, cuenta, rol, paciente objetivo, políticas esperadas y hora. No registrar tokens ni credenciales.
- Preparar acceso propio, cuidador autorizado y otro paciente sin autorización. Carmen, Lourdes y Rafael solo si el entorno los contiene. Usar sesiones aisladas para roles; un selector visual no crea otra sesión.
- Acordar con el agente de backend las cuatro categorías, evidencia de denegación y método de detectar cambios de permisos. No usar errores de transporte como prueba de autorización correcta.

## Matriz mínima
1. Acceso propio: consultar datos propios y comprobar que no aparecen datos de otro paciente.
2. Cuidador: permitir cada categoría autorizada y denegar cada categoría retirada; revisar listado, detalle, búsqueda, descarga, conteos y avisos, no solo pestañas.
3. Multirrol: Lourdes pasa de cuidar a Carmen a Mi salud y vuelve. Títulos, contenido, acciones, URL y avisos deben corresponder al contexto vigente.
4. Respuesta tardía: con solicitud pendiente, cambiar de paciente. Su respuesta no debe pintar, anunciarse ni guardarse bajo el contexto nuevo.
5. Eventos tardíos: tras cambiar paciente o salir, los eventos de la suscripción previa no deben reaparecer. Verificar reconexión sin duplicados ni cruces.
6. Revocación: retirar una categoría desde sesión paciente con cuidador abierto; comprobar nuevas lecturas denegadas y limpieza/estado del contenido ya cargado según contrato. Medir el retraso, no prometer inmediatez. Repetir logout/login. Si falta invalidación, registrar falla o bloqueo según el criterio acordado.
7. Multicuidador: retirar acceso de un destinatario no debe cambiar el del otro. Revocación no elimina el acceso propio de quien también es paciente.
8. Sesión: probar expiración y logout, pestañas múltiples, atrás/adelante, recarga y cachés. No dejar datos/avisos de sesión anterior visibles o accesibles a otra cuenta.
9. Datos sensibles: revisar recursos y canales relacionados, no solo Observation. La existencia, tipo, conteo o texto de un aviso también puede revelar información. No inventar avisos “privados” sin política aprobada.
10. Fallos: lectura no autorizada = Bundle vacío (búsqueda) o 404 (por id); 403 solo en escrituras; 401 = sesión vencida. Diferenciar también desconexión, 5xx, vacío confirmado, dato sin interpretación y restricción. Ninguno debe mostrarse como normalidad ni una denegación por error debe contarse como éxito.

## Pasada accesible manual
- Completar login, selección de persona, consulta, permisos y logout con teclado: foco visible, orden lógico, sin trampas; modales devuelven foco.
- Con lector de pantalla real, comprobar nombre/rol/estado de controles, encabezados, paciente activo y anuncios de cambios. No leer datos del contexto anterior ni repetir continuamente avisos.
- Revisar labels, instrucciones y errores asociados; no comunicar urgencia, selección o permisos solo con color.
- Probar reflow a 320 CSS px y zoom 200 %/400 % cuando corresponda; revisar desbordamiento y controles táctiles. Registrar dispositivo real o emulación sin confundirlos.
- Ejecutar comprobador automático si está disponible y autorizado; complementarlo con contraste y revisión manual. No instalar herramientas sin permiso. WCAG 2.2 AA es referencia de diseño, no certificación automática ni conclusión legal.

## Evidencia y decisión
Por caso registrar identificador, precondiciones, pasos, esperado, observado, estado y evidencia sanitizada. Pasa solo con comprobación real; falla si lo observado incumple; no probado/bloqueado si falta cuenta, contrato, herramienta, implementación o autorización.
Cruce de paciente, exposición no autorizada o acción sobre persona equivocada bloquean aceptación del flujo; informar a ambos responsables sin publicar datos. No convertir un bypass visual en corrección de permisos.
Reportar por separado servidor y UI: servidor deniega no demuestra pantalla limpia; pantalla limpia no demuestra servidor deniega. No marcar “todo pasa” si hay casos no probados.

## Ejemplos de reporte
- “Cambio Mi salud → Cuido a Carmen; solicitud previa pendiente; resultado del paciente propio apareció bajo Carmen: falla de aislamiento; evidencia sintética.”
- “Revocación en sesión abierta: no probado/bloqueado; backend todavía no define señal de invalidación; no se promete retiro inmediato.”

## Límites
Antes del evento usar esta matriz para planificar; ejecutarla solo contra el ensayo con autorización. No generar código del producto anticipado. Accesibilidad, seguridad y cumplimiento requieren evidencias independientes; esta skill no certifica ninguna de ellas por sí sola.
