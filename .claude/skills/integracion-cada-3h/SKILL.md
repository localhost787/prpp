---
name: integracion-cada-3h
description: Úsala en los controles del viernes 9 (~11 AM y ~4:30 PM) y en cualquier unión a main. Une, prueba de punta a punta y decide cortes por escrito en 30–60 min.
---
# Integración cada ~3 horas
Controles fijos: **int-1 (vie ~11 AM, decisión a las 12 PM)** y **int-2 (vie ~4:30 PM, decisión antes de la mentoría de las 6 PM**; entrar a la mentoría con el demo andando y 2–3 preguntas). Además, controles cortos cada ~3 h. **Vie 11 PM: freeze de funciones** (solo arreglos). **Sáb 11:30 AM: hard freeze** (todo entregado). Fuera de esos, se une a `main` solo si las dos personas están presentes.

**1. Congelar (5 min):** cada uno termina su commit, corre `listo-para-demo` y escribe en el hilo: rama, qué trae, qué contrato toca, qué NO está probado.

**2. Unir (10 min):** merge a `main` por pull request, primero backend y después frontend. Conflicto = explicarlo en palabras y esperar OK (skill `trabajo-en-pareja`).

**3. Probar de punta a punta (15–30 min), con dos ventanas: Carmen y Lourdes:**
- El evento del simulador llega al celular sin recargar (< 5 s).
- Lourdes ve solo lo autorizado; quitar una categoría la limpia de su pantalla.
- Paciente vacío: no aparecen datos constantes.
- Cada punto se anota como pasa / falla / no probado-bloqueado, con evidencia (captura o salida).

**4. Decidir (5 min), por escrito en el issue:**
- Todo esencial pasa → seguir con el plan.
- Algo esencial falla → los dos se enfocan solo en eso y se aplican los cortes de que-cortamos-primero (int-1: #1–#5; int-2: #1–#7). Cortar alcance es decisión del líder de backend y el líder de frontend, no de los agentes.

**5. Etiquetar:** si pasa, tag `demo-estable-N` en `main`. El demo siempre sale de la última etiqueta estable, nunca de una rama a medias.

**Si se pasa de 45 min:** congelar lo que funciona, etiquetarlo, y el resto sigue en ramas.
