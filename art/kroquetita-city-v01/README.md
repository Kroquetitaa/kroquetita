# Kroquetita — ciudad de juguetes, v01

Ciudad editable de estética voxel, con biseles, materiales satinados, personajes expresivos, día/noche y reflejos. La web conserva la distribución y las proporciones de Blender a escala 1:1. El kit GLB completo verificado ocupa **11,88 MB decimales**, por debajo del presupuesto de 12 MB; los tamaños por archivo figuran en `public/models/city/manifest.json`.

## Archivos para editar y revisar

- `kroquetita-city.blend`: montaje completo al atardecer, fotograma 150.
- `kroquetita-city-day.blend`, `kroquetita-city-golden.blend` y `kroquetita-city-night.blend`: iluminaciones del mismo montaje.
- `kroquetita-city-cycle.blend`: ciclo día → atardecer → noche → amanecer, fotogramas 300–1740 a 24 fps; guardado en 660. Espacio reproduce/pausa.
- `kroquetita-cast.blend` y `cast/`: galería y fuentes individuales de los **23 modelos pulidos**: 13 humanos, cinco asistentes de IA, gato, pato, bug, jefe y Roomba.
- `districts/avatar.blend`: avatar jugable pulido, además de esos 23 modelos. Conserva máscara original, `FaceScreen`, capucha, ropa, zapatillas y portátil articulado. La web controla sus expresiones y articulaciones.
- `districts/` y `exports/`: fuentes por módulo y GLB locales. `renderpreview/avatar-polished.png`, `renderpreview/core-brain-polished.png` y `cast-polished-preview.png` muestran los acabados revisados.

La ciudad contiene plaza, trayectoria, biblioteca, taller de bugs, hangar, laboratorio, fábrica, transporte y observatorio elevado. Los once logos originales pertenecen a sus edificios. El conjunto **THE CORE** se eleva 2,70 m para despejarlos: plataforma a z=8,73, placa a z=9,35 y foco del cerebro a z=10,72, en coordenadas locales de Blender. Sus soportes se alargan desde los anclajes originales. El cerebro de juguete tiene hemisferios coral/lavanda, pliegues suaves, expresión y puntos neuronales.

## Experiencia web

La portada muestra el mapa completo. Al entrar se puede elegir cámara **cercana, isométrica, aérea o libre**, desde el selector o con **C**. La cámara libre permite girar y acercarse. **M** abre el mapa y **E** usa las estaciones. Se mantienen diálogos, misiones, monedas, saltos, libros, demos, café y reacciones del taller.

La carga dura un mínimo de **3,6 segundos** y muestra cinco asistentes de IA persiguiendo a un pato. Las hojas de marcha se renderizan desde los modelos Blender: ocho fotogramas por personaje, con PNG y WebP en `public/images/loading/`. El mínimo permite ver la escena; la carga real puede durar más según el equipo.

**El pato y los portales** amplía esa persecución a dos ventanas. Se abre desde la portada o con **Abrir otra dimensión** junto a THE CORE. Sus 32 segundos de historia se pausan al separar las ventanas durante los cruces; los portales admiten los cuatro bordes, hasta 120 px de separación y un solape perpendicular mínimo de 100 px. Hay alternativa en una pantalla para móvil, popup bloqueado o elección del visitante. Las ventanas deben compartir navegador, perfil y origen web. El diorama Blender específico pesa **545.992 bytes (aprox. 546 kB)**, más los seis personajes reutilizados. Fuente editable, protocolo, límites de DPI y procedimiento de QA en [portal/README.md](portal/README.md).

La ampliación **Tres capas** descubre ventanas de la misma URL: ciudad, lente del Subsuelo y lente del Origen, esta última limitada al solape común de las tres. Incluye fuentes Blender separadas, sincronización de cámara y temblor visual acotado. Protocolo, regeneración, pruebas y límites de posicionamiento en [dimensions/README.md](dimensions/README.md). Su QA visual se registra por separado de las pruebas deterministas.

La navegación combina comprobación del trayecto por barrido y rutas A* para evitar atravesar obstáculos. El dron usa también **95 volúmenes elevados**, extraídos de los GLB fuente. `check-city-movement.mjs` comprueba paredes finas, desvíos, espacios ocupados, huellas reales del reparto y recorridos terrestres y aéreos.

## Contrato entre Blender y Three.js

- Una unidad representa un metro: Blender usa Z arriba y frente −Y; GLB usa Y arriba y frente +Z.
- `exports/native-assembly.json` extrae las matrices del montaje. `npm run assets:city` genera distritos en coordenadas globales y los contratos `src/world/blenderAssembly.ts` y `blenderGeometry.ts`. Los distritos se montan sin transformaciones adicionales.
- La preparación elimina de la plaza los duplicados estáticos que sustituyen el avatar, la cafetera y los compañeros interactivos. Conserva sus pivotes y los puntos `Hook_*`; estos puntos son referencias, no lógica de juego.
- `brain_exterior` es el observatorio elevado del mapa; `brain_inside` conserva la experiencia interior local. El cerebro de trayectoria pertenece a `career` y recibe información en `Hook_Career_CoreFocus`.
- El kit agrupa mallas por material y comprueba límites y poses de animación. Las torres parten de su pose completa; el controlador web anima el avatar y el reparto.

El montaje y la geometría se conservan, pero **el render de Blender y el navegador no son idénticos**. Los GLB contienen materiales PBR; las luces, el entorno, las sombras y los reflejos de Cycles se reconstruyen en Three.js. La web combina superficies satinadas, reflejo planar localizado, ciclo solar, lluvia y calidad adaptable. El acabado y el rendimiento se revisan también en el navegador.

## Regeneración

Guardar una copia de cualquier edición manual antes de reconstruir desde scripts. Usar Blender 5.3 con `--background --factory-startup --threads 4 --python`; los siguientes scripts están en esta carpeta:

1. Reconstrucción completa: `build_city.py`, `refine_city.py`, `repair_native_bridge.py` y `export_city.py`, en ese orden.
2. Actualizar el conjunto CORE en los seis archivos guardados: `polish_core_brain.py`. Genera `exports/career.glb` y el render; admite `-- no-render` para omitirlo. El modelado está en `district_career_brain.py`, con `CORE_LIFT=2.70`.
3. Después de exportar ciudad: `build_player.py` y `build_cast.py`. Para las hojas de marcha del loader: `render_cast_walk.py`; su informe está en `cast/walk-report.json` y la revisión visual en `cast-walk-contact.png`.
4. Ejecutar `extract_web_assembly.py` y repetirlo con `-- cycle-reference` para contrastar el montaje principal con el ciclo.
5. Desde la raíz del proyecto:

```powershell
npm run assets:city
node --experimental-strip-types scripts/prepare-air-obstacles.mjs
npm run check:city
node --experimental-strip-types scripts/check-city-movement.mjs
npm run check:portals
npm run build
```

`prepare-air-obstacles.mjs` debe ir **después** de `assets:city`: consume el contrato recién generado y escribe `src/game/airObstacles.ts`. No hace falta reconstruir Blender para cambiar una interacción web. Tras sustituir GLB durante una sesión, recargar la página para renovar la caché.

Las comprobaciones contrastan montaje, contenido, articulaciones, accesos, movimiento y presupuesto. `native-validation.json` registra la comparación main/cycle; `exports/manifest.json` describe las fuentes y `public/models/city/manifest.json` los archivos finales. Las cifras de geometría de versiones anteriores no representan el kit actual. Las copias de seguridad están en `backups/`.
