import * as THREE from 'three'
import { uParty, uTime } from './shaders'

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Chapa metálica: planchas con juntas, remaches y un cepillado horizontal. */
export function createPlateTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#b9bec8'
  ctx.fillRect(0, 0, size, size)

  let seed = 4242
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // Cepillado: rayas finas horizontales de distinta luminosidad.
  for (let y = 0; y < size; y++) {
    const v = 150 + Math.floor(rand() * 90)
    ctx.fillStyle = `rgba(${v},${v},${v + 6},0.22)`
    ctx.fillRect(0, y, size, 1)
  }

  // Dos filas de planchas, la de abajo desplazada media plancha.
  const half = size / 2
  ctx.strokeStyle = 'rgba(40,44,54,0.55)'
  ctx.lineWidth = 2
  for (let row = 0; row < 2; row++) {
    for (let col = -1; col < 2; col++) {
      const x = col * half + (row ? half / 2 : 0)
      const y = row * half
      ctx.strokeRect(x + 1.5, y + 1.5, half - 3, half - 3)
      // Bisel claro por dentro de la junta.
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 5, y + 5, half - 10, half - 10)
      ctx.restore()
      for (const [rx, ry] of [
        [12, 12],
        [half - 12, 12],
        [12, half - 12],
        [half - 12, half - 12],
      ]) {
        ctx.fillStyle = 'rgba(40,44,54,0.7)'
        ctx.beginPath()
        ctx.arc(x + rx, y + ry, 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.arc(x + rx - 1, y + ry - 1, 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Interior de las cajas de cristal: hilos de energía que suben por dentro.
 * `uPulse` es el latido de la caja actual y `uBoost` el realce de la activa.
 */
export function createEnergyMaterial(color: string, size: [number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uParty,
      uColor: { value: new THREE.Color(color) },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uPulse: { value: 0 },
      uBoost: { value: 0 },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform vec3 uColor;
      uniform vec2 uSize;
      uniform float uPulse;
      uniform float uBoost;
      varying vec2 vUv;
      float hash(float n) {
        return fract(sin(n * 127.1) * 43758.5453);
      }
      void main() {
        vec2 p = vUv * uSize;
        float column = floor(p.x * 2.6);
        float h = hash(column + 3.0);
        // Hilo vertical fino en el centro de cada columna.
        float lx = abs(fract(p.x * 2.6) - 0.5);
        float thread = smoothstep(0.09, 0.02, lx);
        // Cabezas de luz que suben, cada columna a su ritmo.
        float run = fract(p.y * 0.22 - uTime * (0.16 + h * 0.3) * (1.0 + uParty) + h * 9.0);
        float head = smoothstep(0.75, 1.0, run);
        // Nodos fijos: pequeñas soldaduras a alturas distintas.
        float ny = abs(fract(p.y * 0.9 + h * 5.0) - 0.5);
        float node = smoothstep(0.2, 0.05, length(vec2(lx * 2.2, ny)));
        // Resplandor del fondo, más intenso abajo, que late con la caja.
        float haze = (1.0 - vUv.y) * (0.05 + uPulse * 0.3);
        float a = thread * (0.1 + head * 1.1) + node * 0.35 + haze;
        a *= 1.0 + uBoost * 0.8 + uPulse * 1.4;
        gl_FragColor = vec4(uColor * a * 2.2, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Onda que se abre en el suelo con cada latido de la caja actual. */
export function createShockMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uProgress: { value: 1 } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uProgress;
      varying vec2 vUv;
      void main() {
        vec2 p = abs(vUv * 2.0 - 1.0);
        // Distancia "cuadrada": la onda tiene la forma de la base de la caja.
        float r = max(p.x, p.y);
        float radius = mix(0.35, 0.95, uProgress);
        float ring = smoothstep(0.08, 0.0, abs(r - radius));
        float a = ring * (1.0 - uProgress) * 0.9;
        gl_FragColor = vec4(uColor * a * 2.0, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/**
 * Pantalla encendida. `kind`: 0 = código que se desplaza, 1 = gráficas,
 * 2 = terminal que va escribiendo líneas.
 */
export function createScreenMaterial(kind: 0 | 1 | 2, color: string, seed = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uColor: { value: new THREE.Color(color) },
      uKind: { value: kind },
      uSeed: { value: seed },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uKind;
      uniform float uSeed;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec2 uv = vUv;
        vec3 col = vec3(0.012, 0.018, 0.034);
        if (uKind < 0.5) {
          // Código: renglones de "palabras" de colores, con sangría, que suben.
          float y = (1.0 - uv.y) * 13.0 + uTime * 0.8;
          float row = floor(y);
          float fy = fract(y);
          float h = hash(vec2(row, uSeed));
          float indent = 0.07 + floor(h * 4.0) * 0.06;
          float len = 0.18 + hash(vec2(row, uSeed + 3.0)) * 0.6;
          float word = floor((uv.x - indent) * 11.0 + h * 5.0);
          float gap = step(0.22, fract((uv.x - indent) * 11.0 + h * 5.0));
          float ink = step(indent, uv.x) * step(uv.x, indent + len) * gap;
          ink *= step(0.28, fy) * step(fy, 0.7) * step(0.12, h);
          float wh = hash(vec2(word, row + uSeed));
          vec3 tint = mix(uColor, vec3(1.0, 0.45, 0.75), step(0.62, wh));
          tint = mix(tint, vec3(0.75, 0.95, 1.0), step(0.86, wh));
          col += tint * ink * 1.5;
          // Numeración de líneas, tenue, en el margen.
          col += vec3(0.25) * step(uv.x, 0.045) * step(0.02, uv.x) * step(0.35, fy) * step(fy, 0.65);
        } else if (uKind < 1.5) {
          // Gráficas: barras que respiran y una línea que ondula por encima.
          float bx = floor(uv.x * 9.0);
          float fx = fract(uv.x * 9.0);
          float top = 0.12 + 0.42 * (0.5 + 0.5 * sin(uTime * 1.2 + bx * 1.7 + uSeed));
          float bar = step(0.18, fx) * step(fx, 0.82) * step(0.1, uv.y) * step(uv.y, top);
          col += uColor * bar * (0.7 + 0.6 * uv.y / max(top, 0.01));
          float line = 0.76 + 0.1 * sin(uv.x * 8.0 + uTime * 1.1) + 0.04 * sin(uv.x * 23.0 - uTime * 1.7);
          col += vec3(1.0, 0.75, 0.2) * smoothstep(0.022, 0.0, abs(uv.y - line)) * 1.6;
          col += vec3(0.2) * step(abs(uv.y - 0.1), 0.004);
        } else {
          // Terminal: las líneas aparecen de una en una y vuelve a empezar.
          float rows = 11.0;
          float row = floor((1.0 - uv.y) * rows);
          float fy = fract((1.0 - uv.y) * rows);
          float tick = floor(uTime * 2.4);
          float page = floor(tick / (rows + 4.0));
          float shown = mod(tick, rows + 4.0);
          float h = hash(vec2(row + page * 17.0, uSeed));
          float len = 0.12 + h * 0.7;
          float ink = step(row, shown) * step(0.07, uv.x) * step(uv.x, 0.07 + len);
          ink *= step(0.3, fy) * step(fy, 0.68) * step(0.2, fract((uv.x) * 14.0 + h * 3.0));
          vec3 tint = mix(vec3(0.3, 1.0, 0.5), vec3(1.0, 0.4, 0.3), step(0.9, h));
          col += tint * ink * 1.3;
          // Indicador ">" al principio de cada línea.
          col += uColor * step(row, shown) * step(0.025, uv.x) * step(uv.x, 0.05) * step(0.38, fy) * step(fy, 0.6);
        }
        // Líneas de barrido y un brillo suave en el centro.
        col *= 0.86 + 0.14 * sin(uv.y * 240.0);
        col *= 0.75 + 0.35 * (1.0 - distance(uv, vec2(0.5)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  })
}
