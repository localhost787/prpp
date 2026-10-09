# Preguntas para Edwin (de Claudio, noche del 8→9 oct)

_Cada pregunta trae mi recomendación. Nada de esto está aprobado: decides tú (y Beto si toca frontend)._

## 1. Búsqueda sin permiso: Medplum da 403, el canon pide Bundle vacío (contrato §4, pregunta 1)

- **Probado esta noche** contra la nube: si el tipo no está en la política → **403** en búsqueda y en lectura por id (bitácora, 00:27).
- **Recomiendo:** que las políticas de familia lleven **todos** los tipos clínicos siempre, y para las categorías apagadas una entrada de solo lectura con un criterio que nunca coincide. Así la búsqueda da Bundle vacío y la lectura por id 404, como dice el canon, sin cambiar el contrato.
- Lo voy a construir así en POR-48 (es reversible) y lo pruebo. Si prefieres aceptar el 403 como excepción, se quita.
