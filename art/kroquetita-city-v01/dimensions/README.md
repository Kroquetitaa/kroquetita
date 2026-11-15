# Tres capas de Kroquetita

Las ventanas descubren automáticamente otras ventanas con **la misma URL de origen y ruta, en el mismo navegador y perfil**. La primera conserva la ciudad jugable; las siguientes actúan como lentes sobre ella. No hay servidor de sincronización ni conexión entre dispositivos. Dos pestañas pueden comunicarse, pero deben separarse en ventanas para colocarlas sobre el mapa.

| Orden del documento | Función | Zona que revela |
| --- | --- | --- |
| 1 · capa 0 | Ciudad anfitriona | Mapa y controles normales. |
| 2 · capa 1 | Subsuelo | Intersección de esta ventana con la anfitriona. |
| 3 · capa 2 | Origen | Intersección común de las **tres** ventanas. |
| 4 y siguientes | Ciudad independiente | Sin revelado; pueden ocupar una plaza si se cierra una anterior. |

El orden se decide por antigüedad del documento e ID, sin cambiar al mover ventanas. Cerrar una ventana promociona las siguientes; quedarse solo devuelve una lente al modo normal. **Explorar esta ciudad** permite salir de la lente hasta recargar. La vista previa en una pantalla ofrece Subsuelo/Origen sin depender de tres ventanas: no equivale a una prueba de alineación entre ellas.

## Comunicación y alineación

`src/dimensions/session.ts` usa `BroadcastChannel` y, si falta, eventos de `localStorage`. Genera un ID criptográfico por documento, sin reutilizar `sessionStorage` que pudiera clonarse al duplicar una pestaña. Publica presencia y posición a 15 Hz; considera perdido un peer tras 3 segundos sin noticias. El anfitrión envía la cámara hasta 20 Hz, con matrices, proyección, viewport y estado `city/brain`. Las lentes no controlan la cámara principal.

`protocol.ts` calcula recortes normalizados; `lensProjection.ts` adapta la proyección de la cámara anfitriona para que un punto del mundo corresponda al mismo píxel de pantalla. La tercera capa intersecta explícitamente **local ∩ anfitriona ∩ segunda ventana**: superponer la segunda y la tercera fuera del mapa no revela nada. La renderización aplica ese recorte también al lienzo. Dentro del cerebro se suspende la alineación de ciudad y se indica volver al mapa.

El alcance es el mismo origen —protocolo, dominio y puerto— y la misma ruta. `localhost` y `127.0.0.1`, perfiles distintos o rutas diferentes no comparten sesión. La aventura del pato mantiene su propio protocolo: las URLs `?dimension=guest` quedan excluidas y su lanzamiento suspende la presencia de la ciudad. Al reactivar el mismo documento se conserva su identidad y antigüedad.

La posición del contenido se **estima** desde `screenX/Y` y los tamaños interior/exterior. Marcos del navegador, zoom y diferentes escalas DPI entre monitores pueden introducir desajustes. Las pruebas matemáticas no eliminan esa limitación del navegador; hay que revisar la alineación en las pantallas de destino. El contenido se dibuja dentro de las ventanas, sin pintar sobre el escritorio.

## Movimiento y fuentes Blender

`windowMotion.ts` comparte un sondeo de movimiento a 15 Hz, sin actualizaciones React por fotograma. Entrega velocidad/aceleración suavizadas y acotadas y una intensidad que decae al detener la ventana. Resize, pantalla completa y movimiento reducido borran el impulso. `CityDimensionalEffects.tsx` aplica el temblor visual; el reparto puede balancearse sin cambiar posiciones físicas, navegación ni colisiones. Los límites visuales también deben mantenerse dentro de las huellas del reparto.

- **Subsuelo:** `underworld.blend`, `build_underworld.py`, `manifest.json`, `underworld-preview.png` y `underworld-detail.png`.
- **Origen:** `origin.blend`, `build_origin.py`, `origin-manifest.json` y `origin-preview.png`.
- **Web:** `public/models/dimensions/underworld.glb` y `origin.glb`, desde la raíz del proyecto. Los manifiestos contienen sus tamaños, pivotes y puntos de referencia actuales.

Ambos generadores leen `src/world/blenderAssembly.ts` y conservan las coordenadas nativas del montaje. Las capas son modelos separados; no sustituyen ni mueven los edificios de la ciudad. La lente añade una representación tenue del mapa como referencia. Para regenerar, con el contrato de ciudad actualizado y Blender 5.3 en PATH:

```powershell
blender --background --factory-startup --threads 4 --python art/kroquetita-city-v01/dimensions/build_underworld.py
blender --background --factory-startup --threads 4 --python art/kroquetita-city-v01/dimensions/build_origin.py
```

Los scripts guardan fuentes editables, renders y GLB finales. Guardar aparte las ediciones manuales antes de reconstruir y recargar la web después de reemplazar modelos.

## Comprobación

```powershell
npm run check:dimensions
node art/kroquetita-city-v01/dimensions/verify_dimensions.mjs
npm run typecheck
npm run build
```

`check-dimensions.mjs` verifica descubrimiento, liderazgo, orden de tres capas, triple solape, cuarta ventana, cámaras, cierre/reconexión, exclusión del pato y límites/limpieza del movimiento. `check-lens-projection.mjs` contrasta 1.800 puntos para cámaras perspectiva y ortográfica, coordenadas negativas y viewports de distintos tamaños.

**QA real en Chrome, 15 de noviembre de 2026:** tres ventanas con la misma URL local reconocieron ciudad, subsuelo y origen sin parámetros especiales. La tercera solo mostró geometría en la intersección común; al separar la ventana intermedia apareció la indicación de volver a superponer las tres. Al seleccionar Plaza en la ciudad, la lente reprodujo el nuevo encuadre. Las tarjetas revelaron las historias de los secretos.

Una cuarta ventana mostró «Las tres capas ya están abiertas». Al cerrar la segunda, la tercera pasó a Subsuelo y la cuarta a Origen. Un desplazamiento real de la ventana anfitriona activó «¡Sujetad las croquetas!» y el efecto se apagó al quedarse quieta. Las tres ventanas no registraron errores de consola durante estas comprobaciones.

La vista de una pantalla se comprobó a 390 × 844: selector Subsuelo/Origen, acercamiento al tocar una señal, botón Volver al mapa, regreso a la ciudad y ausencia de desbordamiento horizontal. La cámara de esta vista es independiente; las lentes de escritorio conservan la cámara compartida.

Capturas de la web: `../previews/web-dimensions-underworld.jpg`, `../previews/web-dimensions-origin.jpg`, `../previews/web-dimensions-mobile.jpg` y `../previews/web-window-motion.jpg`. El viewport estrecho no equivale a una prueba en un teléfono físico. El comportamiento con diferentes escalas DPI/zoom y marcos de otros navegadores queda sujeto a la estimación descrita arriba. Las pruebas de movimiento reducido y pantalla completa son deterministas; no se ha cambiado la configuración de accesibilidad del ordenador.
