# AGENTS — foco frontend

Estado: borrador de un agente de apoyo, autorizado por el líder de frontend, para el agente de frontend, en revisión con el líder de backend. Solo instrucciones de trabajo, sin código del producto. Complementa comun/AGENTS.md y la personalidad del agente de frontend (local); no instala nada en la laptop.

## Arranque de una tarea
1. Leer el núcleo común, el alcance aprobado y las skills pertinentes. Consultar SPEC, BRIEFING, diseño de cuidadores y backlog; registrar divergencias antes de escoger una versión.
2. Identificar pantalla, cuenta, paciente consultado, rol, resultado esperado y contrato backend. Confirmar rutas/archivos reales, no asumir que existe una ruta de docs.
3. Delimitar aceptación y evidencia. Antes de la ventana autorizada del evento, limitarse a documentos, diseño y feedback del ensayo; sin componentes, scaffolds ni soluciones copiables del producto.
4. Trabajar en el frontend. Proponer al agente de backend cambios de contrato; no modificar su área ni simular que un endpoint existe.
5. Skills de uso diario: `textos-en-espanol` (todo texto visible), `contrato-y-mock` (antes de cada pantalla con datos), `listo-para-demo` (antes de unir, grabar o presentar).

Puertos: la app del evento corre en **3001** (el 3000 es la app de administración de Medplum: no tocar); servidor Medplum en 8103.

## Contrato mínimo con backend
Acordar recursos FHIR, referencia del paciente, institución/fuente cuando exista, paginación, fecha clínica/recibida, estados/correcciones, errores y canales de actualización. Definir expiración de sesión, cambio de perfil y notificación de cambios de permiso.
El consentimiento se recoge y explica en la interfaz, pero AccessPolicy/membresía y validaciones del servidor aplican permisos. Ocultar botones o filtrar una respuesta ya recibida no es control de acceso.
Modelo documentado actual: autorización por destinatario y cuatro categorías (estado de Emergencias; medicinas; instrucciones de alta/cita; estudios/resultados). No volver a los 3 niveles fijos (obsoletos) por arrastre de la spec. Cualquier conflicto se resuelve con el líder de backend; no inventar un mapeo clínico.
Respuestas ante lectura no autorizada (regla única): búsqueda → Bundle vacío (no error); lectura por id → 404; 403 solo para escrituras rechazadas. El candado sale del endpoint de permisos, no de interpretar errores.
Login de dos pasos (como en el ensayo): email → "Continue" → contraseña.
Una cuenta puede ser paciente y cuidadora. Separar identidad de acceso, Patient, RelatedPerson y concesión explícita. Revocar una relación no borra la cuenta, su acceso propio ni otras relaciones válidas.

## Contexto visible y estados
Mantener identificables “Cuenta de”, “Información de” y “Rol”; cambiar de persona de forma explícita, también con teclado/lector. No usar solo color para distinguir contexto.
Distinguir carga, vacío confirmado, datos no disponibles, sin permiso, sesión vencida, error técnico y desconexión. Un recurso sin interpretación no es “Normal”. No revelar mediante conteos, títulos o avisos la existencia de información restringida.
Mostrar procedencia y fecha disponibles; no fabricar instituciones, horarios ni cobertura. Cuando un requisito de procedencia no está en el contrato, marcarlo pendiente.
“Su equipo ya fue avisado” requiere confirmación respaldada por backend; no basta crear Communication. No diagnosticar ni recomendar tratamiento; textos clínicos críticos requieren contenido/revisión aprobados.

## Sesiones, cambios de persona y eventos
Aplicar skills/aislamiento-y-accesibilidad/SKILL.md. Invalidar el contexto anterior al cambiar persona, rol, sesión o permisos; retirar datos y avisos viejos, cancelar/ignorar respuestas tardías y cerrar suscripciones anteriores. Verificar pestañas múltiples y volver atrás/adelante.
No afirmar revocación instantánea sin contrato de notificación y prueba en pantalla abierta. Si falta esa capacidad, dejarla bloqueada y describir el límite, no esconderlo con copy.
El secreto del simulador nunca va en el navegador (toda variable de Vite es pública): vive en un servidor pequeño en `127.0.0.1`. No incluir PHI, tokens o contraseñas en URL, logs, analytics, capturas compartidas, localStorage ni caché offline propia. Verificar por separado el manejo de sesión del SDK; no atribuirle garantías sin inspección. PWA/SSR/hosting siguen sujetos a decisiones técnicas explícitas; no son obligaciones legales por sí mismos.

## Accesibilidad y móvil
Usar HTML semántico, nombres accesibles, labels, foco visible y orden lógico. Probar teclado sin trampas, gestión de foco al cambiar paciente, zoom/reflow, contraste, errores de formulario y anuncios de actualización que no saturen al lector.
Referencia de diseño: WCAG 2.2 AA; la aplicabilidad legal y sus fechas se validan aparte. Un resultado axe sin alertas no equivale a conformidad.
Todo par de color nuevo (texto/fondo, icono/fondo, borde de control) se anota en docs/ con sus hex y su proporción WCAG calculada (mínimo 4.5:1 texto normal; 3:1 texto grande, iconos y bordes de control); sin hex y número, no entra.
Registrar navegador y viewport; emular ancho móvil no equivale a prueba en celular físico. No declarar lector de pantalla probado si solo se inspeccionó el DOM.

## Implementación durante el evento
Usar dependencias/stack realmente aprobados y compatibles. No añadir Router, librerías de formularios, i18n o PWA solo porque aparecieron como propuesta. Conservar versiones comprobadas y créditos; no copiar el ensayo.
Priorizar el recorrido acordado. El backlog de 102 issues no es promesa de entrega: proponer cortes con impacto y pedir decisión al líder de frontend/el líder de backend. No cortar aislamiento, veracidad ni controles para esconder retrasos.

## Entrega y coordinación
Por hallazgo: Pantalla · Cuenta/rol y paciente sintéticos · Pasos · Esperado · Observado · Gravedad · Evidencia · Estado (pasa/falla/no probado-bloqueado).
Cada reporte declara su modo: sintético o Medplum integrado. Un pasa sintético no cuenta como integrado.
Layout se mide, no se supone: en 320×700, 390×844 y 1280×577, scrollWidth ≤ clientWidth y estilos computados de los controles; no basta revisar la variable de escala ni el body.
Pruebas mínimas cuando se autorice ejecutar: build/tipos, flujos funcionales, errores del contrato, matriz aislamiento y revisión accesible manual. Adjuntar ejecución real; no heredar 44/44 del briefing como resultado propio.
Un hilo por tema, autor real y nota del cambio en cada versión. Antes de guardar un documento compartido, releer versión actual y fusionar sin borrar trabajo ajeno. No publicar evidencia con secretos ni activar el perfil local desde un borrador remoto.
