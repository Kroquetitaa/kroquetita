# Kroquetita — piloto visual 01

Escena de prueba de una esquina de la plaza: avatar voxel de vinilo, cafetera,
baldosas satinadas, mobiliario y luz de estudio cálida con acento cian.

## Abrir y revisar

- `kroquetita-plaza-v01.blend`: escena editable. Cámara `01 / Full plaza` para
  la composición general y `02 / Character and coffee` para inspeccionar detalle.
- `preview-plaza.png` y `preview-detail.png`: renders de referencia.
- La línea de tiempo 1–96 contiene el ciclo `Idle` del avatar; 24 fps.
- Las colecciones numeradas separan suelo, cafetera, personaje y mobiliario.
- `LOOKDEV / cameras and lights (not exported)` contiene el montaje de estudio.

## Modelos para la web

`exports/manifest.json` describe los GLB independientes. Los tres modelos tienen
la raíz en el origen y escala 1, con Y hacia arriba y el frente hacia +Z:

| Archivo | Origen y dimensiones | Integración prevista |
| --- | --- | --- |
| `avatar.glb` | Entre los pies; altura nominal 1,05 m | Conservar el wrapper de escala 1,15 del jugador y su física actual |
| `coffee_machine.glb` | Centro de la base; cuerpo 1,5 × 2,2 × 1,2 m | Conservar alcance de interacción, bonificación y espera actuales |
| `plaza_module.glb` | Centro del módulo; 4,8 × 3,6 m; baldosas con superficie Y=0 | La base se extiende hacia abajo; bordillo decorativo del fondo requiere decisión de colisión |

El avatar conserva los nodos `AvatarRoot`, `Body`, `Head`, `Arm_L`, `Arm_R`,
`Leg_L` y `Leg_R`. La animación `Idle` no desplaza la raíz. Para usar las
animaciones procedurales actuales habrá que adaptar sus referencias a estos
pivotes o sustituir solo el modo reposo por el clip.

La cafetera incluye `SteamSocket` y `ServeSocket`. Sus rótulos están en español
y convertidos en mallas para esta prueba; la versión bilingüe debe mostrar los
textos localizados desde la interfaz/escena de la web.

Los materiales son Principled PBR con colores, rugosidad y metalicidad; no
dependen de texturas procedurales ni de recursos externos. Las luces y cámaras
de estudio no se exportan a los assets. El resultado del navegador deberá
ajustarse y comprobarse por separado: el render de referencia usa Cycles/AgX.

## Alcance de esta versión

Es un piloto de dirección artística, todavía sin integrar en `src`. Los GLB
mantienen piezas y nodos editables; antes de una integración completa conviene
agrupar mallas estáticas por material y medir el coste en el navegador.

## Reproducir

Ejecutar `build_scene.py` en una instancia nueva de Blender en segundo plano:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe' --background --factory-startup --threads 4 --python 'C:/Users/kroquetita/Desktop/kroquetita/art/kroquetita-lookdev-v01/build_scene.py'
```

El script reemplaza sus propias salidas en este directorio. Genera geometría,
exporta los modelos, guarda la escena y renderiza ambas cámaras. No modifica
la sesión interactiva abierta ni los archivos fuente de la web.
