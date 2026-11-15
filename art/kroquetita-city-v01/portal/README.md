# El pato y los portales

Una persecución entre dos ventanas: el pato roba una neurona de THE CORE, cinco asistentes de IA lo siguen a una dimensión nocturna y todos regresan. El pato termina escondiendo el contexto en el café. La experiencia reutiliza el reparto Blender de la ciudad y carga un diorama específico, sin montar el mapa completo en la ventana invitada.

## Abrir la experiencia

1. Desde la raíz del proyecto, ejecutar `npm run dev -- --host 127.0.0.1` y abrir `http://127.0.0.1:5173/`.
2. Pulsar **El pato y los portales** en la portada o **Abrir otra dimensión** junto a THE CORE en la ciudad. La segunda ventana se abre desde ese clic explícito.
3. Colocar las ventanas una junto a otra. Se pueden conectar por la izquierda, derecha, arriba o abajo. El indicador muestra **PORTALES CONECTADOS** cuando comparten un borde válido y las escenas están listas.
4. Separarlas durante la ida o el regreso para detener la persecución; acercarlas para continuar. **Ver otra ventana** recupera la invitada si se cerró o navegó a otro sitio. **Otra vez** reinicia la historia; la flecha de regreso o Escape sale de la experiencia.

Las dos ventanas deben pertenecer al mismo navegador, perfil y origen web —protocolo, dominio y puerto—. Por ejemplo, `localhost:5173` y `127.0.0.1:5173` son orígenes distintos. El botón de lanzamiento genera ambas direcciones correctamente y comparte un identificador de sesión criptográfico. No hay servidor de sincronización ni comunicación entre dispositivos.

En pantallas de hasta 760 píxeles, dispositivos con puntero táctil o cuando el navegador bloquea la ventana emergente, se muestran los dos mundos dentro de una pantalla. También se puede elegir **Jugar en una pantalla**. La unión central permite separar y reconectar los portales de este modo. La disponibilidad del modo móvil está implementada; su revisión visual debe registrarse por separado de las pruebas de escritorio.

## Secuencia y conexión

La historia dura **32 segundos de tiempo activo**, más la carga, las pausas y el tiempo que añada la limitación de pestañas en segundo plano. Los seis actores —pato, Claude, ChatGPT, Gemini, Qwen3 y Mistral— cruzan con salidas escalonadas.

| Tiempo activo | Acción | Comportamiento sin conexión |
| --- | --- | --- |
| 0–4 s | Robo de la neurona | Puede avanzar en la ventana principal una vez cargada su escena; espera en 4 s. |
| 4–14 s | Persecución hacia la noche | Se congela en su posición hasta recuperar conexión y carga de la invitada. |
| 14–18 s | Reencuentro en la otra dimensión | Puede avanzar hasta la puerta de regreso, en 18 s. |
| 18–28 s | Regreso a casa | Se congela mientras las ventanas estén separadas o la invitada no esté lista. |
| 28–32 s | El contexto acaba en la cafetera | Termina el desenlace local. |

La ventana principal es la autoridad del reloj y envía instantáneas a **10 Hz**. `setReady(false)` detiene su reloj en cualquier fase: la historia no se consume antes de que carguen los modelos. Los cruces también requieren que la invitada confirme su carga. Reiniciar conserva esa disponibilidad. La invitada recibe el tiempo del host; nunca decide el avance por su cuenta.

La posición se calcula en píxeles CSS de pantalla. Los bordes pueden estar separados hasta **120 px** y necesitan al menos **100 px de solape perpendicular**. El punto común del borde determina el anclaje de ambos portales. Dos ventanas casi superpuestas no forman una conexión. El contrato también expone `stretch`, de 0 a 1, según la separación del borde.

La comunicación utiliza `BroadcastChannel`; si falta, recurre a eventos de `localStorage`. Un mensaje de salida detecta el cierre inmediatamente cuando llega; sin mensajes, el peer se considera perdido después de **3 segundos**. La sesión rechaza otras sesiones, un segundo invitado mientras el primero siga activo, secuencias antiguas y mensajes encolados demasiado viejos. La reconexión conserva el progreso de la ventana principal.

## Fuente Blender y archivos web

- `portal-outpost.blend`: fuente editable del diorama, con las piezas separadas.
- `build_outpost.py`: reconstruye la fuente, renderiza la imagen de revisión y exporta el modelo web agrupando las mallas estáticas por material.
- `outpost-preview.png`: revisión del modelo en Blender.
- `outpost-manifest.json`: tamaño, geometría, pivotes y puntos `Hook_*` del export.
- `public/models/portal/outpost.glb`, desde la raíz del proyecto: **545.992 bytes, aproximadamente 546 kB decimales**, 18.218 triángulos y 28 mallas en el export comprobado. Es el tamaño del diorama; los seis personajes se cargan adicionalmente desde `public/models/city/cast/`.

Para regenerar, desde la raíz del proyecto y con Blender 5.3 disponible en PATH:

```powershell
blender --background --factory-startup --threads 4 --python art/kroquetita-city-v01/portal/build_outpost.py
```

El script escribe directamente el GLB en `public/models/portal/`; no necesita pasar por `assets:city`. Conserva pivotes para `CoffeeLid`, `Core_Brain` y `Portal_Neuron`. Las luces, reflejos, poses y efectos se calculan en la web. Guardar aparte cualquier edición manual antes de reconstruir desde el script y recargar el navegador después de sustituir un GLB.

Los archivos de la experiencia están en `src/portal/`: `launch.ts` abre o recupera la invitada; `protocol.ts` define geometría y mensajes; `session.ts` controla comunicación, disponibilidad y reloj; `portalStory.ts` deriva las poses; `PortalScene.tsx` dibuja cada lado y `PortalExperience.tsx` presenta los controles. `App.tsx` carga la experiencia de forma diferida. Una URL con `?dimension=guest&portalSession=…` monta únicamente el lado invitado.

## Verificar cambios

```powershell
npm run check:portals
npm run typecheck
npm run build
```

`check:portals` ejecuta dos comprobaciones deterministas:

- `scripts/check-portals.mjs`: cuatro bordes y anclajes compartidos; límites 120/100 px; monitores con coordenadas negativas; puertas temporales; dos controladores con carga, autoridad, separación, reconexión y cierre; invitado duplicado; mensajes antiguos; timeout; limpieza de StrictMode; secuencia integrada de 32 s; transporte localStorage y bloqueo de popup.
- `scripts/check-portal-launch.mjs`: enfocar una invitada sana sin reiniciarla; recuperar la misma ventana después de navegar a la ciudad o a otro origen; cerrar una ventana creada por la app y volver a la ciudad desde una pestaña independiente.

Estas pruebas no renderizan WebGL ni mueven ventanas reales. Para QA visual:

1. Abrir desde portada y desde THE CORE; comprobar el indicador de carga y que el reloj siga en cero hasta que esté lista la escena principal.
2. Colocar dos ventanas del mismo perfil lado a lado, observar el cruce y comparar su progreso. Repetir con los otros bordes y con ventanas de diferentes tamaños.
3. Separar durante ida o regreso durante más de diez segundos; comprobar que ambos lados mantengan la misma posición y reanuden al acercarlos.
4. Cerrar la invitada, recuperarla y reiniciar. Navegar la invitada a la ciudad y usar **Ver otra ventana**. Comprobar que no aparezcan ventanas adicionales ni se pierda la sesión.
5. Dejar terminar hasta 32 s y revisar el desenlace en la cafetera. Probar el modo integrado, su unión, Escape, movimiento reducido y carga fallida/reintento.
6. Revisar móvil por separado: controles, orientación, legibilidad, dos escenas y rendimiento en dispositivo real o emulación claramente identificada.

**QA observado el 15/11/2026:** dos ventanas Chrome adyacentes mostraron conexión y el mismo progreso en 15 s; separarlas en 20 s mantuvo ambos lados detenidos en 20 s durante más de diez segundos; reconectarlas reanudó la historia. Ambas completaron los 32 s y mostraron **CONTEXTO RECUPERADO**, sin errores en los registros de Chrome. La vista de 390 × 844 cargó automáticamente el modo integrado; su pausa y reanudación estaban pendientes de comprobación al escribir este registro. La vista estrecha no sustituye una revisión en dispositivo móvil físico.

## Límites de posicionamiento

El navegador expone `screenX/Y` y tamaños interiores/exteriores, pero no la posición exacta del lienzo en píxeles físicos. El origen del contenido se estima descontando bordes y barra de navegador. Zoom, distintas escalas DPI entre monitores, barras laterales, marcos del sistema y políticas de privacidad pueden introducir desajustes. Conviene contrastar la alineación en la configuración de pantallas de destino; el modo integrado evita depender de esas coordenadas. Las pestañas en segundo plano pueden ralentizar la historia. El efecto se dibuja dentro de cada ventana, sin contenido sobre el escritorio entre ellas.
