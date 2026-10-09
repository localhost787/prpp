---
name: listo-para-demo
description: Úsala cuando el equipo diga "¿está listo?", antes de unir una rama a main, antes de grabar el video o antes de presentar. Revisa que el demo no falle.
---
# ¿Listo para el demo?
Revisa y reporta cada punto en español con uno de tres estados: ✅ pasa · ❌ falla · ⏸️ no probado/bloqueado (di qué lo bloquea). Nunca marques ✅ sin evidencia (comando, captura o prueba). Cada reporte dice su MODO: sintético (mock/storage) o Medplum integrado; un ✅ sintético no vale como ✅ integrado.
1. La app arranca desde cero siguiendo las instrucciones del README.
2. "Tour completo" del simulador corre de principio a fin sin errores en la consola.
3. El resultado llega en vivo al celular sin recargar la página (en menos de 5 segundos).
4. "Ver como familiar": no ve lo que el paciente no autorizó. Reporta por separado: (a) el servidor niega el acceso tras revocar (búsqueda → Bundle vacío; lectura por id → 404; 403 solo en escrituras) y (b) la pantalla ya abierta se limpia sin recargar. Son dos checks distintos.
5. Una sola función de permiso (puedeVer/canView por paciente y categoría) decide lo que muestran inicio, voz, avisos e historial. Ningún componente decide permisos por su cuenta.
6. Paciente vacío = todo vacío: una persona recién registrada no muestra ningún dato clínico; nada viene de constantes en componentes. Un dato ausente se muestra como "sin dato", nunca como "Normal".
7. Layout medido, no a ojo, en 320×700, 390×844 y 1280×577 (proyector): `scrollWidth ≤ clientWidth` en cada contenedor, estilos computados (no solo la variable de escala ni el `body`), controles móviles presentes y sin colisiones, con la letra grande. Contraste AA (4.5:1 texto normal; 3:1 texto grande e iconos) con hex y número.
8. Concurrencia: dos pestañas/cuentas a la vez; una revocación y un alta simultáneas no se pierden (escrituras versionadas, retest entre pestañas).
9. No hay claves ni contraseñas en pantalla ni en el repo.
10. Lo simulado dice "simulado".
11. La tabla de créditos y la de "funciona vs. simulado" del README están al día.

Si algo sale ❌, di cómo arreglarlo y cuánto tomaría. No lo arregles sin preguntar si faltan menos de 2 horas para entregar. Plazos: **hard freeze sáb 11:30 AM** (todo entregado) · **juicio 12:15 PM**.
