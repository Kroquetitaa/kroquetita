import * as THREE from 'three'

/** Reloj compartido por todos los shaders; se actualiza una vez por frame. */
export const uTime = { value: 0 }

/** 0..1: se enciende al recoger todas las monedas (neones en arcoíris). */
export const uParty = { value: 0 }

/** 0..1: alarma roja mientras producción está caída (botón DEPLOY). */
export const uAlarm = { value: 0 }

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Tira de neón con un destello que la recorre. Emite en HDR para el bloom. */
export function createNeonMaterial(color: string, intensity = 1.5) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uParty,
      uAlarm,
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform float uAlarm;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      vec3 rainbow(float h) {
        return 0.55 + 0.45 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
      }
      void main() {
        float sweep = fract(vUv.x - uTime * (0.22 + uParty * 0.6));
        float pulse = smoothstep(0.0, 0.1, sweep) * smoothstep(0.3, 0.1, sweep);
        float flicker = 0.93 + 0.07 * sin(uTime * 7.0 + vUv.x * 18.0);
        vec3 base = mix(uColor, rainbow(vUv.x * 0.6 - uTime * 0.35) * 1.5, uParty);
        base = mix(base, vec3(1.0, 0.07, 0.04) * (0.5 + step(0.5, fract(uTime * 3.0))), uAlarm);
        vec3 col = base * uIntensity * flicker + vec3(1.0) * pulse * 0.7;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Halo radial aditivo (bajo los emblemas y las monedas). */
export function createGlowMaterial(color: string, intensity = 1.2) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5)) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.4);
        a *= 0.8 + 0.2 * sin(uTime * 1.8);
        gl_FragColor = vec4(uColor * uIntensity * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Anillo de portal sobre el suelo con barrido angular animado. */
export function createPortalMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float ang = atan(p.y, p.x);
        float ring = smoothstep(0.07, 0.0, abs(r - 0.82));
        float halo = smoothstep(0.3, 0.0, abs(r - 0.82)) * 0.25;
        float core = smoothstep(0.8, 0.0, r) * 0.1;
        float sweep = 0.55 + 0.45 * sin(ang * 3.0 - uTime * 2.4);
        float a = ring * (0.6 + sweep) + halo * sweep + core;
        gl_FragColor = vec4(uColor * 2.6 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Motas de polvo flotando: puntos con deriva y parpadeo en el vertex shader. */
export function createDustMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.25 + aSeed * 6.2831) * 0.6;
        p.x += cos(uTime * 0.18 + aSeed * 12.0) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (10.0 + aSeed * 22.0) * uPixelRatio / -mv.z;
        float twinkle = 0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0);
        vAlpha = (0.1 + 0.35 * twinkle) * smoothstep(70.0, 25.0, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Rejilla tenue sobre el suelo con ondas que se expanden desde `uCenter`. */
export function createGridMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uParty,
      uColor: { value: new THREE.Color(color) },
      uCenter: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec2 uCenter;
      uniform float uParty;
      varying vec3 vWorld;
      void main() {
        vec2 cell = vWorld.xz / 2.0;
        vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float d = length(vWorld.xz - uCenter);
        float ripple = pow(0.5 + 0.5 * sin(d * 0.7 - uTime * (1.8 + uParty * 3.0)), 8.0);
        float fade = smoothstep(46.0, 5.0, d);
        float a = line * (0.035 + (0.3 + uParty * 0.5) * ripple) * fade;
        vec3 col = mix(uColor, vec3(1.0, 0.78, 0.2), uParty);
        gl_FragColor = vec4(col * a * 1.6, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    toneMapped: false,
  })
}

/** Destello de cuatro puntas que parpadea; la fase sale de su posición. */
export function createSparkleMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = modelMatrix[3].x * 7.0 + modelMatrix[3].y * 13.0 + modelMatrix[3].z * 3.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        float rays = smoothstep(0.09, 0.0, abs(p.x)) * smoothstep(1.0, 0.0, abs(p.y))
                   + smoothstep(0.09, 0.0, abs(p.y)) * smoothstep(1.0, 0.0, abs(p.x));
        float core = smoothstep(0.3, 0.0, d);
        float twinkle = pow(0.5 + 0.5 * sin(uTime * 3.2 + vPhase), 5.0);
        float a = (rays * 0.8 + core) * twinkle;
        gl_FragColor = vec4(uColor * 2.4 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

/** Estallido de chispas con gravedad al recoger una moneda. */
export function createBurstMaterial(
  color: string,
  { speed = 2.2, gravity = 5.5, life = 0.55, size = 26 } = {},
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uStart: { value: -100 },
      uOrigin: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(color) },
      uPixelRatio: { value: 1 },
      uSpeed: { value: speed },
      uGravity: { value: gravity },
      uLife: { value: life },
      uSize: { value: size },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uStart;
      uniform vec3 uOrigin;
      uniform float uPixelRatio;
      uniform float uSpeed;
      uniform float uGravity;
      uniform float uLife;
      uniform float uSize;
      attribute vec3 aDir;
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        float t = uTime - uStart;
        // Frenado exponencial: sale rápido y se queda flotando, como una palmera.
        float travel = (1.0 - exp(-t * 2.4)) / 2.4;
        vec3 p = uOrigin + aDir * travel * uSpeed * (1.0 + aSeed * 1.1) * 2.4;
        p.y -= uGravity * t * t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float life = clamp(1.0 - t / (uLife * (1.0 + aSeed * 0.7)), 0.0, 1.0);
        vAlpha = life;
        gl_PointSize = t < 0.0 ? 0.0 : uSize * (1.0 + aSeed) * life * uPixelRatio / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, d) * vAlpha;
        gl_FragColor = vec4(uColor * 3.0 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Cara de la moneda: oro acuñado con cordoncillo y la imagen en el centro. */
export function createCoinTexture(image: HTMLImageElement | null, size = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const r = size / 2
  const circle = (radius: number) => {
    ctx.beginPath()
    ctx.arc(r, r, radius, 0, Math.PI * 2)
  }

  const gold = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r)
  gold.addColorStop(0, '#fff3bd')
  gold.addColorStop(0.45, '#f6c13c')
  gold.addColorStop(1, '#b3740a')
  ctx.fillStyle = gold
  circle(r)
  ctx.fill()

  // Canto y cordoncillo de puntos.
  ctx.lineWidth = r * 0.05
  ctx.strokeStyle = 'rgba(120, 74, 4, 0.7)'
  circle(r * 0.95)
  ctx.stroke()
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2
    ctx.fillStyle = i % 2 ? '#fff0b0' : '#c98a12'
    ctx.beginPath()
    ctx.arc(r + Math.cos(a) * r * 0.845, r + Math.sin(a) * r * 0.845, r * 0.026, 0, Math.PI * 2)
    ctx.fill()
  }

  // Medallón central.
  const inner = ctx.createRadialGradient(r, r * 0.8, r * 0.05, r, r, r * 0.76)
  inner.addColorStop(0, '#fff6cf')
  inner.addColorStop(1, '#e6a727')
  ctx.fillStyle = inner
  circle(r * 0.75)
  ctx.fill()
  ctx.lineWidth = r * 0.03
  ctx.strokeStyle = 'rgba(110, 66, 2, 0.85)'
  ctx.stroke()

  if (image) {
    const iw = image.naturalWidth || 1
    const ih = image.naturalHeight || 1
    const fit = (r * 1.42) / Math.max(iw, ih)
    ctx.save()
    circle(r * 0.73)
    ctx.clip()
    ctx.drawImage(image, r - (iw * fit) / 2, r - (ih * fit) / 2, iw * fit, ih * fit)
    ctx.restore()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Barrido de luz y trama de puntos sobre la cara de un monolito. */
export function createScanMaterial(color: string, phase: number, size: [number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uColor: { value: new THREE.Color(color) },
      uPhase: { value: phase },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uPhase;
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * uSize;
        // Banda que sube por la cara cada pocos segundos.
        float head = fract(uTime * 0.11 + uPhase) * (uSize.y + 3.0) - 1.5;
        float band = smoothstep(1.6, 0.0, head - p.y) * step(p.y, head);
        float edge = smoothstep(0.06, 0.0, abs(p.y - head));
        // Trama de puntos que solo se enciende al paso de la banda.
        vec2 cell = fract(p * 5.0) - 0.5;
        float dots = smoothstep(0.16, 0.06, length(cell));
        float a = band * (0.05 + dots * 0.22) + edge * 0.5;
        a *= smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        gl_FragColor = vec4(uColor * a * 1.5, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Anillo de polvo que se abre y desvanece (al aterrizar). */
export function createPuffMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 1 } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      varying vec2 vUv;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        float radius = mix(0.15, 0.85, uProgress);
        float ring = smoothstep(0.16, 0.0, abs(r - radius));
        float a = ring * (1.0 - uProgress) * 0.55;
        gl_FragColor = vec4(vec3(0.8, 0.86, 1.0) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Geometría para `createBurstMaterial`: direcciones repartidas en una esfera. */
export function createBurstGeometry(count: number, lift = 0.5) {
  const dirs = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    // Espiral de Fibonacci: reparto uniforme sin aleatoriedad.
    const y = 1 - (i / (count - 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = i * 2.39996
    dirs[i * 3] = Math.cos(angle) * radius
    dirs[i * 3 + 1] = y + lift
    dirs[i * 3 + 2] = Math.sin(angle) * radius
    seeds[i] = (i * 0.618034) % 1
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  g.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  return g
}

/** Haz cónico de proyector holográfico: más denso en la base y con líneas que suben. */
export function createBeamMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float fall = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6);
        float lines = step(0.55, fract(vUv.y * 22.0 - uTime * 1.4));
        float flicker = 0.85 + 0.15 * sin(uTime * 11.0 + vUv.y * 30.0);
        float a = (fall * 0.2 + lines * 0.07 * (1.0 - vUv.y)) * flicker;
        gl_FragColor = vec4(uColor * a * 1.8, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Trampolín: anillos que se contraen hacia el centro y flechas de "arriba". */
export function createPadMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uColor: { value: new THREE.Color(color) } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float rim = smoothstep(0.06, 0.0, abs(r - 0.9));
        float waves = smoothstep(0.1, 0.0, abs(fract(r * 2.2 + uTime * 1.3) - 0.5)) * 0.55;
        float disc = smoothstep(0.92, 0.6, r);
        float a = rim + waves * disc + disc * 0.12;
        a *= smoothstep(1.0, 0.94, r);
        gl_FragColor = vec4(uColor * 2.2 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Frontal de un armario de servidores: filas de LED parpadeando. */
export function createRackMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uSeed: { value: seed } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec2 grid = vUv * vec2(6.0, 14.0);
        vec2 cell = floor(grid);
        vec2 f = fract(grid) - 0.5;
        float led = smoothstep(0.24, 0.1, length(f));
        float h = hash(cell + uSeed);
        float blink = step(0.45, fract(h * 13.0 + uTime * (0.4 + h * 3.0)));
        vec3 color = mix(vec3(0.1, 1.0, 0.45), vec3(1.0, 0.45, 0.1), step(0.86, h));
        // Rejillas de ventilación entre filas de luces.
        float slot = step(0.5, fract(vUv.y * 7.0)) * 0.03;
        float a = led * blink * step(h, 0.72);
        gl_FragColor = vec4(color * a * 2.0 + vec3(slot), 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Textura procedural de piedra/hormigón: grano y vetas suaves en un canvas. */
export function createStoneTexture(size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#c4c4c4'
  ctx.fillRect(0, 0, size, size)

  // Semilla fija para que la textura sea idéntica en cada carga.
  let seed = 1337
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  for (let i = 0; i < 26; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 30 + rand() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const v = rand() > 0.5 ? 255 : 0
    g.addColorStop(0, `rgba(${v},${v},${v},0.09)`)
    g.addColorStop(1, `rgba(${v},${v},${v},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }

  const image = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rand() - 0.5) * 20
    image.data[i] += n
    image.data[i + 1] += n
    image.data[i + 2] += n
  }
  ctx.putImageData(image, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Aurora lejana: cortinas de ruido que fluyen despacio tras los bloques. */
export function createAuroraMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float t = uTime * (0.035 + uParty * 0.1);
        // Cortinas verticales deformadas por ruido.
        float warp = fbm(vec2(vUv.x * 3.0 + t, t * 0.7));
        float curtain = fbm(vec2(vUv.x * 7.0 + warp * 2.0 - t * 1.5, vUv.y * 1.3 + t));
        curtain = pow(smoothstep(0.3, 0.72, curtain), 1.5);
        float height = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float sides = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        vec3 cold = vec3(0.1, 0.32, 1.0);
        vec3 warm = vec3(1.0, 0.36, 0.12);
        vec3 col = mix(cold, warm, smoothstep(0.3, 0.75, vUv.x + (warp - 0.5) * 0.4));
        float a = curtain * height * sides * 0.5;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  })
}

/** Estela de una estrella fugaz: fina y brillante en la cabeza. */
export function createStreakMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        float along = pow(clamp(vUv.x, 0.0, 1.0), 3.0);
        float across = smoothstep(0.5, 0.0, abs(vUv.y - 0.5));
        float a = along * across * uAlpha;
        gl_FragColor = vec4(vec3(0.8, 0.9, 1.0) * a * 2.5, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  })
}

/**
 * Neuronas del cerebro: puntos de luz con color y tamaño propios, que se
 * encienden (aGlow) cuando les llega un impulso.
 */
export function createNodeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute vec3 color;
      attribute float aSize;
      attribute float aGlow;
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // Un latido propio de cada neurona, además del encendido por impulso.
        float idle = 0.85 + 0.15 * sin(uTime * 2.0 + position.x * 9.0 + position.z * 7.0);
        gl_PointSize = (9.0 * aSize * idle + aGlow * 16.0) * uPixelRatio / -mv.z;
        vColor = color;
        vGlow = aGlow;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uParty;
      varying vec3 vColor;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.55, 0.0, d);
        float halo = smoothstep(1.0, 0.2, d) * 0.45;
        vec3 col = mix(vColor, vec3(1.0, 0.8, 0.3), uParty * 0.6);
        float a = core + halo;
        gl_FragColor = vec4((col * (1.2 + vGlow * 2.6) + vec3(vGlow) * core) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}
