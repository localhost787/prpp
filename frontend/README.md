# Frontend PRPP — demo sintética local, NO integración live

La demo abre directamente **Carmen Rivera Colón**, sin login ni selector inicial. Sólo hay **Vista Carmen** (rol propio) y **Vista Lourdes** (hija, rol delegado), ambas sobre Carmen. Rafael ya no está en UI ni fixtures activos. No hay contraseñas públicas ni cuenta real iniciada.

## Alcance y procedencia

Base local `origin/main`: `67e791b6e265c4676ee5add0ba215acce01ebeb9`. Snapshot frontend importado desde `ec5ff7b46ee048974aead378d84e051906a6bdfb`, ahora modificado para entrada directa. `IMPORT-MANIFEST.json` es evidencia histórica de la importación original, **no hashes del árbol actual**.

El repositorio fuente deriva de [Foo Medical / Medplum](https://github.com/medplum/foomedical), Apache-2.0. Se conservan `LICENSE.txt`, `apps/dashboard/src/reports/FONT-LICENSE.txt` y créditos Lucide/SVG del README dashboard. No implica cumplimiento o seguridad del upstream.

Sólo frontend. No se leyó, probó ni modificó backend en este cambio. La publicación de esta demo sintética fue autorizada por Beto. Main y preview 3001 no se modifican; se publica en `integration/frontend-final`. Los artefactos locales y dependencias reutilizadas permanecen ignorados.

## GitHub → Vercel

Proyecto `prpp-frontend`, equipo `TSKTEST`, repositorio `localhost787/prpp`. Root Directory: `frontend/apps/dashboard`; Node 22.x; instalación `npm ci`; build `npm run export:web`; output `dist`. `vercel.json` conserva build y fallback SPA para recargas. No requiere variables de entorno ni acceso Medplum.

La rama protegida `main` sigue siendo la rama de producción predeterminada; los pushes a la rama de integración generan previews. Un despliegue inicial de demostración puede promoverse explícitamente sin fusionar main. Eso no certifica integración ni resuelve los fallos de QA enumerados abajo.

## Verificación local

Desde `frontend/apps/dashboard`, con dependencias ya instaladas:

```sh
npm test
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 npm run export:web
```

- Node: **88 PASS, 0 FAIL**, sin omitidos; incluye prueba real de Chromium y seis PDFs con `pdftotext`.
- Export Expo web: PASS.
- Browser: **11 PASS / 5 FAIL de 16 suites** ejecutadas. Entrada directa, idioma reversible, resultados, cuidado, familia, informes, servicios, estudios, reference-shell, reference-sections y services-states pasan.
- Entrada probada a 320/390/1280, ES→EN→ES, escalas 1/1.5, teclado, recarga y storage vacío. Cambiar de vista reinicia navegación, resultados, permisos locales de Familia y etapa simulada. Lourdes no muestra resultados/PDF restringidos; fuentes denegadas tienen cero invocaciones en pruebas de modelo.
- Fallos restantes no ocultados: `browser` espera copy anterior al disclosure; `visit` espera la presentación anterior de estados; `care-guard` busca un control inglés en harness con idioma inicial distinto; `visual` falla contraste de texto; `actions` observa 3.496 frente a 4.5. Las aserciones de contraste permanecen.
- `legacy-width.mjs`: no ejecutado, depende de Vite antiguo no importado. Backend/live/nativo: no probados y fuera de alcance.

Browser usa el preload existente en scratch para entregar los bytes de `dist` mediante interceptación Playwright y bloquear otros destinos. **No contacta el servidor 3001 ni valida un despliegue HTTP.** Informe detallado: `prpp-demo-direct-entry-report.md` en scratch del perfil ady; logs `prpp-demo-*.log`, resultados `prpp-demo-browser-results.json`; capturas ignoradas bajo `frontend/docs/evidence`.

Los tests importan Playwright desde `frontend/node_modules`; también requieren Vite, Chrome y `pdftotext`. Se reutilizan symlinks ignorados ya existentes, sin instalar. **No se demuestra QA reproducible desde un checkout limpio** con sólo las dependencias declaradas del dashboard.

## Datos e integración pendiente

Se mantienen explícitas las fuentes sintéticas actuales. No se portó PR16/18 ni ninguna capa con contraseñas `EXPO_PUBLIC`. Los controles Familia sólo cambian ejemplos locales: no revocan ni conceden permisos reales, y no cambian el fixture delegado de Lourdes.

El objetivo final sigue siendo consumir eventos de Edwin mediante un adaptador público seguro pendiente de contrato y revisión. No hay conexión live, autorización servidor ni suscripciones demostradas. Backend prohibido en este alcance. Tampoco hay validación clínica nueva, copy diagnóstico inventado ni validación iOS/Android. Antes de publicar quedan revisión/rotación, contraste, QA reproducible e integración segura independiente.
