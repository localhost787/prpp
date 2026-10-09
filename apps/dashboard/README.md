# PRPP dashboard — Expo web local

App React Native/Expo independiente del respaldo Vite en la raíz. SDK 54 / React 19.1 / RN 0.81; versiones y lock propios. Datos sintéticos, sin backend, EAS ni servicios cloud. No hay cuenta real iniciada.

## Ver el export validado

Desde este directorio:

```sh
npm test
EXPO_OFFLINE=1 npm run export:web
# Solo si el puerto está libre:
python3 -m http.server 3001 --bind 127.0.0.1 --directory dist
```

Abrir `http://127.0.0.1:3001` y pulsar **Entrar al ejemplo**. Para probar con Chrome instalado y Playwright de la raíz (en otra terminal):

```sh
node tests/browser.mjs
```

`npm run web` inicia Metro para desarrollo, pero la ruta ejercitada de esta entrega es el export estático. No ejecutar ambos servidores al mismo tiempo. No detener procesos desconocidos.

## Iconografía y créditos

- La navegación usa el paquete oficial [`lucide-react-native` 1.54.0](https://lucide.dev/), bajo licencia ISC. Algunos iconos Lucide se derivan de Feather Icons y conservan su atribución MIT, según el archivo `LICENSE` distribuido por el paquete.
- La representación SVG multiplataforma usa [`react-native-svg` 15.12.1](https://github.com/software-mansion/react-native-svg), bajo licencia MIT.
- Los iconos son decorativos dentro de controles que mantienen nombres accesibles completos en texto; no reemplazan las etiquetas de navegación.

## Límites

- Cinco secciones navegables con datos sintéticos explícitos; un pase mock no demuestra integración clínica.
- Los permisos son fixtures, no reglas aplicadas por servidor.
- Reutiliza `../../src/mock/session.ts` mediante `src/context.mjs`; corrige únicamente en el adaptador el perfil propio de Lourdes.
- UI con componentes React Native y React Native Web; sin Mantine ni Medplum React DOM.
- No se probó Expo Go, Android/iOS, compilación nativa, lector de pantalla real ni conformidad completa.
- `npm audit` reportó vulnerabilidades pendientes: esta app no se declara apta para producción.

Informe, comandos reales, arquitectura, versiones, evidencia TDD, matriz pasa/falla/no probado, fuentes y créditos: [dashboard-expo-aceptacion.md](../../docs/dashboard-expo-aceptacion.md).
