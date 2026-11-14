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

/** Esfera del núcleo de IA: brilla más en el contorno (fresnel) y late. */
export function createCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.5);
        float pulse = 0.75 + 0.25 * sin(uTime * 1.7);
        vec3 cold = mix(vec3(0.08, 0.35, 1.0), vec3(0.6, 0.9, 1.0), rim);
        vec3 gold = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.9, 0.5), rim);
        vec3 col = mix(cold, gold, uParty) * (0.3 + rim * 2.4) * pulse;
        gl_FragColor = vec4(col, 0.35 + rim * 0.65);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
}

/** Iluminación RGB: un arcoíris que fluye a lo largo de la pieza (uv.x). */
export function createRgbMaterial(phase = 0, speed = 0.25) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty, uAlarm, uPhase: { value: phase }, uSpeed: { value: speed } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform float uAlarm;
      uniform float uPhase;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        float hue = vUv.x + uPhase - uTime * uSpeed * (1.0 + uParty * 2.0);
        vec3 col = 0.55 + 0.45 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
        col = mix(col, vec3(1.0, 0.06, 0.04) * (0.4 + step(0.5, fract(uTime * 3.0))), uAlarm);
        gl_FragColor = vec4(col * 1.9, 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Chapa de la caja: panel oscuro con rejilla hexagonal y un resplandor al fondo. */
export function createCaseMaterial(size: [number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uSize: { value: new THREE.Vector2(size[0], size[1]) } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uSize;
      varying vec2 vUv;
      // Distancia al borde de la celda hexagonal más cercana.
      float hex(vec2 p) {
        vec2 r = vec2(1.0, 1.732);
        vec2 a = mod(p, r) - r * 0.5;
        vec2 b = mod(p - r * 0.5, r) - r * 0.5;
        vec2 g = dot(a, a) < dot(b, b) ? a : b;
        g = abs(g);
        return max(dot(g, vec2(0.5, 0.866)), g.x);
      }
      void main() {
        vec2 p = vUv * uSize;
        float cell = hex(p / 0.75);
        float hole = smoothstep(0.34, 0.3, cell);
        float rim = smoothstep(0.06, 0.0, abs(cell - 0.36));
        // Luz ambiental de los componentes: más viva cerca del suelo.
        float low = smoothstep(uSize.y, 0.0, p.y);
        vec3 metal = vec3(0.022, 0.024, 0.03) * (0.6 + low);
        vec3 leak = mix(vec3(0.05, 0.35, 0.6), vec3(0.6, 0.15, 0.5), 0.5 + 0.5 * sin(p.x * 0.08 + uTime * 0.25));
        vec3 col = metal * (1.0 - hole * 0.75) + rim * vec3(0.03, 0.035, 0.045) + leak * hole * 0.05 * low;
        // Juntas de panel.
        float seam = smoothstep(0.04, 0.0, abs(fract(p.x / 11.5) - 0.5) - 0.495);
        col += vec3(0.02) * seam;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Líquido refrigerante: remolinos de color y burbujas que suben. */
export function createCoolantMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty, uAlarm },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform float uAlarm;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        // Remolino: bandas diagonales que giran alrededor del cilindro.
        float swirl = 0.5 + 0.5 * sin((vUv.x * 2.0 + vUv.y * 3.0) * 6.2831 - uTime * 1.6);
        vec3 a = vec3(0.05, 0.75, 1.0);
        vec3 b = vec3(0.55, 0.2, 1.0);
        vec3 col = mix(a, b, swirl);
        col = mix(col, 0.55 + 0.45 * cos(6.28318 * (vUv.y - uTime * 0.3 + vec3(0.0, 0.33, 0.67))), uParty);
        col = mix(col, vec3(1.0, 0.1, 0.05), uAlarm);
        // Burbujas: puntos que ascienden por columnas.
        vec2 grid = vec2(vUv.x * 14.0, vUv.y * 9.0 - uTime * 0.9);
        vec2 cell = floor(grid);
        vec2 f = fract(grid) - 0.5;
        float bubble = smoothstep(0.2, 0.08, length(f + (hash(cell) - 0.5) * 0.5)) * step(0.6, hash(cell + 3.1));
        float level = smoothstep(0.93, 0.9, vUv.y);
        gl_FragColor = vec4((col * (0.7 + swirl * 0.5) + bubble * 0.9) * level * 1.3, 0.9 * level);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
}

/** Tubo rígido de la refrigeración: blanco, con el líquido viéndose pasar. */
export function createPipeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uAlarm },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAlarm;
      varying vec2 vUv;
      void main() {
        // Sombreado falso de cilindro (uv.y da la vuelta al tubo).
        float shade = 0.45 + 0.55 * sin(vUv.y * 3.14159);
        float flow = smoothstep(0.35, 0.5, fract(vUv.x * 9.0 - uTime * 0.9)) * smoothstep(0.75, 0.6, fract(vUv.x * 9.0 - uTime * 0.9));
        vec3 liquid = mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.12, 0.06), uAlarm);
        vec3 col = vec3(0.5, 0.52, 0.56) * shade + liquid * flow * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  })
}

/** Cristal templado: casi invisible, con el canto iluminado y reflejos diagonales. */
export function createGlassMaterial(size: [number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uSize: { value: new THREE.Vector2(size[0], size[1]) } },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * uSize;
        vec2 inset = min(p, uSize - p);
        float border = min(inset.x, inset.y);
        float edge = smoothstep(0.13, 0.0, border);
        float bevel = smoothstep(0.7, 0.0, border) * 0.12;
        // Dos reflejos que se deslizan muy despacio por el panel.
        float d = (p.x + p.y * 0.6) * 0.085 - uTime * 0.018;
        float wide = smoothstep(0.4, 0.5, fract(d)) * smoothstep(0.64, 0.5, fract(d));
        float thin = smoothstep(0.47, 0.5, fract(d * 2.3 + 0.3)) * smoothstep(0.53, 0.5, fract(d * 2.3 + 0.3));
        float a = 0.018 + wide * 0.03 + thin * 0.02 + bevel + edge * 0.6;
        gl_FragColor = vec4(vec3(0.62, 0.82, 1.0) * a * 1.25, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Textura de la placa base: máscara oscura, pistas de cobre, vías y serigrafía. */
export function createPcbTexture(size: [number, number]) {
  const W = 1024
  const H = Math.round((W * size[1]) / size[0])
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0a151a'
  ctx.fillRect(0, 0, W, H)

  // Semilla fija: la placa es idéntica en cada carga.
  let seed = 2024
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // Haces de pistas con un quiebro a 45 grados, rematados en una vía.
  ctx.lineWidth = 2
  for (let i = 0; i < 90; i++) {
    const lines = 2 + Math.floor(rand() * 5)
    const horizontal = rand() > 0.5
    const x = rand() * W
    const y = rand() * H
    const first = 40 + rand() * 180
    const jog = 20 + rand() * 60
    const second = 40 + rand() * 200
    const sign = rand() > 0.5 ? 1 : -1
    ctx.strokeStyle = `rgba(50, 160, 148, ${0.22 + rand() * 0.25})`
    for (let l = 0; l < lines; l++) {
      const o = l * 7
      ctx.beginPath()
      if (horizontal) {
        ctx.moveTo(x, y + o)
        ctx.lineTo(x + first, y + o)
        ctx.lineTo(x + first + jog, y + o + jog * sign)
        ctx.lineTo(x + first + jog + second, y + o + jog * sign)
      } else {
        ctx.moveTo(x + o, y)
        ctx.lineTo(x + o, y + first)
        ctx.lineTo(x + o + jog * sign, y + first + jog)
        ctx.lineTo(x + o + jog * sign, y + first + jog + second)
      }
      ctx.stroke()
    }
  }
  for (let i = 0; i < 320; i++) {
    const x = rand() * W
    const y = rand() * H
    ctx.fillStyle = 'rgba(200, 170, 90, 0.75)'
    ctx.beginPath()
    ctx.arc(x, y, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a151a'
    ctx.beginPath()
    ctx.arc(x, y, 1.3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Serigrafía: zócalos, ranuras y rótulos.
  ctx.strokeStyle = 'rgba(225, 232, 240, 0.6)'
  ctx.fillStyle = 'rgba(225, 232, 240, 0.72)'
  ctx.lineWidth = 2.5
  ctx.strokeRect(W * 0.34, H * 0.26, W * 0.31, H * 0.34)
  for (let i = 0; i < 4; i++) ctx.strokeRect(W * (0.735 + i * 0.045), H * 0.14, W * 0.03, H * 0.58)
  for (let i = 0; i < 3; i++) ctx.strokeRect(W * 0.08, H * (0.79 + i * 0.065), W * 0.6, H * 0.03)
  ctx.font = 'bold 26px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillText('KROQUETITA AI-BOARD', W * 0.08, H * 0.74)
  ctx.font = '15px ui-monospace, Menlo, Consolas, monospace'
  ctx.fillText('REV 5.2  ·  MADE WITH THREE.JS', W * 0.08, H * 0.765)
  ctx.fillText('CPU_SOCKET', W * 0.34, H * 0.245)
  ctx.fillText('DIMM_A1 A2 B1 B2', W * 0.735, H * 0.125)
  ctx.fillText('PCIE_X16', W * 0.69, H * 0.812)
  ctx.fillText('ATX_PWR', W * 0.9, H * 0.36)
  ctx.fillText('CPU_FAN  AIO_PUMP', W * 0.34, H * 0.635)

  // Taladros de montaje con su corona dorada.
  for (const [u, v] of [[0.03, 0.04], [0.97, 0.04], [0.03, 0.96], [0.97, 0.96], [0.5, 0.04], [0.5, 0.96]]) {
    ctx.fillStyle = 'rgba(214, 178, 92, 0.9)'
    ctx.beginPath()
    ctx.arc(W * u, H * v, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#05080a'
    ctx.beginPath()
    ctx.arc(W * u, H * v, 6.5, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Ventilador en marcha, para superponer a uno ya pintado en la textura del
 * modelo: un aro RGB y el barrido de las aspas, que es lo que da el giro.
 */
export function createSpinMaterial(phase = 0, blades = 9, speed = 14) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uParty,
      uAlarm,
      uPhase: { value: phase },
      uBlades: { value: blades },
      uSpeed: { value: speed },
    },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform float uAlarm;
      uniform float uPhase;
      uniform float uBlades;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float angle = atan(p.y, p.x);
        float turn = uTime * uSpeed * (1.0 + uParty * 1.5);
        // Aspas: destellos que giran entre el buje y el marco.
        float sweep = pow(0.5 + 0.5 * sin(angle * uBlades + turn), 4.0);
        float disc = smoothstep(0.26, 0.34, r) * smoothstep(0.9, 0.8, r);
        float ring = smoothstep(0.05, 0.0, abs(r - 0.93)) + smoothstep(0.04, 0.0, abs(r - 0.25)) * 0.6;
        vec3 hue = 0.55 + 0.45 * cos(6.28318 * (angle / 6.28318 + uPhase - uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
        hue = mix(hue, vec3(1.0, 0.06, 0.04) * (0.4 + step(0.5, fract(uTime * 3.0))), uAlarm);
        float a = sweep * disc * 0.2 + ring * 0.85;
        gl_FragColor = vec4(hue * a * 1.6, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Burbujas y brillo del refrigerante, para superponer al depósito del modelo. */
export function createBubblesMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uParty, uAlarm },
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uParty;
      uniform float uAlarm;
      varying vec2 vUv;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        float swirl = 0.5 + 0.5 * sin((vUv.x * 2.0 + vUv.y * 2.5) * 6.2831 - uTime * 1.4);
        vec3 liquid = mix(vec3(0.1, 0.7, 1.0), vec3(0.6, 0.25, 1.0), swirl);
        liquid = mix(liquid, 0.55 + 0.45 * cos(6.28318 * (vUv.y - uTime * 0.3 + vec3(0.0, 0.33, 0.67))), uParty);
        liquid = mix(liquid, vec3(1.0, 0.1, 0.05), uAlarm);
        vec2 grid = vec2(vUv.x * 12.0, vUv.y * 8.0 - uTime * 0.8);
        vec2 cell = floor(grid);
        vec2 f = fract(grid) - 0.5;
        float bubble = smoothstep(0.2, 0.07, length(f + (hash(cell) - 0.5) * 0.5)) * step(0.55, hash(cell + 3.1));
        float ends = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
        float a = (0.16 + swirl * 0.12 + bubble * 0.7) * ends;
        gl_FragColor = vec4(liquid * a * 1.2 + vec3(bubble * 0.35 * ends), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}
