<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import MoveBox from '@/components/MoveBox/MoveBox.vue'
import { useCesiumStore } from '@/stores/cesium'

const cesiumStore = useCesiumStore()
const containerRef = ref<HTMLElement | null>(null)
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let surfaceMaterial: THREE.ShaderMaterial
let clock: THREE.Clock
let animationId: number

const NOISE_GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for(int i = 0; i < 4; i++) {
      value += amplitude * snoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
`

function initThree() {
  const container = containerRef.value
  if (!container) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87ceeb)
  scene.fog = new THREE.Fog(0x87ceeb, 50, 200)

  const width = container.clientWidth
  const height = container.clientHeight
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.position.set(40, 25, 40)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.target.set(0, -5, 0)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(50, 50, 50)
  scene.add(directionalLight)

  // Seabed
  const seabedGeometry = new THREE.PlaneGeometry(50, 30, 100, 60)
  const seabedMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      ${NOISE_GLSL}
      varying vec3 vPosition;
      varying float vHeight;
      void main() {
        vec3 pos = position;
        float noise = fbm(vec3(pos.x * 0.1, pos.y * 0.1, 0.0));
        float height = noise * 5.0;
        pos.z = height - 10.0;
        vPosition = pos;
        vHeight = height;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      varying float vHeight;
      void main() {
        vec3 deepColor = vec3(0.3, 0.2, 0.1);
        vec3 midColor = vec3(0.6, 0.4, 0.2);
        vec3 shallowColor = vec3(0.8, 0.7, 0.4);
        float t = (vHeight + 2.5) / 5.0;
        t = clamp(t, 0.0, 1.0);
        vec3 color;
        if(t < 0.5) color = mix(deepColor, midColor, t * 2.0);
        else color = mix(midColor, shallowColor, (t - 0.5) * 2.0);
        color += vec3(0.05) * sin(vPosition.x * 2.0) * cos(vPosition.y * 2.0);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
  const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial)
  seabed.rotation.x = -Math.PI / 2
  scene.add(seabed)

  // Seabed base volume
  const seabedBaseGeometry = new THREE.BoxGeometry(50, 8, 30, 50, 10, 30)
  const seabedBaseMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      void main() {
        vPosition = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      void main() {
        float depth = vWorldPosition.y;
        vec3 deepColor = vec3(0.3, 0.2, 0.1);
        vec3 midColor = vec3(0.6, 0.4, 0.2);
        vec3 shallowColor = vec3(0.8, 0.7, 0.4);
        float t = (depth + 18.0) / 8.0;
        t = clamp(t, 0.0, 1.0);
        vec3 color;
        if(t < 0.5) color = mix(deepColor, midColor, t * 2.0);
        else color = mix(midColor, shallowColor, (t - 0.5) * 2.0);
        float stripes = sin(vWorldPosition.y * 3.0) * 0.03;
        float noise = sin(vWorldPosition.x * 0.5) * cos(vWorldPosition.z * 0.5) * 0.02;
        color += vec3(stripes + noise);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
  const seabedBase = new THREE.Mesh(seabedBaseGeometry, seabedBaseMaterial)
  seabedBase.position.y = -14.0
  scene.add(seabedBase)
  const seabedBaseEdges = new THREE.EdgesGeometry(seabedBaseGeometry)
  const seabedBaseEdgesLine = new THREE.LineSegments(
    seabedBaseEdges,
    new THREE.LineBasicMaterial({ color: 0x8b4513, transparent: true, opacity: 0.4 })
  )
  seabedBaseEdgesLine.position.copy(seabedBase.position)
  scene.add(seabedBaseEdgesLine)

  // Water volume
  const waterGeometry = new THREE.BoxGeometry(50, 15, 30, 50, 20, 30)
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWaterTop: { value: 5.0 },
      uWaterBottom: { value: -10.0 },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      void main() {
        vPosition = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      varying vec3 vWorldPosition;
      uniform float uWaterTop;
      uniform float uWaterBottom;
      void main() {
        float depth = vWorldPosition.y;
        float normalizedDepth = (depth - uWaterBottom) / (uWaterTop - uWaterBottom);
        normalizedDepth = clamp(normalizedDepth, 0.0, 1.0);
        vec3 shallowColor = vec3(0.4, 0.7, 0.9);
        vec3 deepColor = vec3(0.0, 0.2, 0.4);
        vec3 color = mix(deepColor, shallowColor, normalizedDepth);
        float alpha = mix(0.85, 0.3, normalizedDepth);
        float detail = sin(vWorldPosition.x * 0.5) * cos(vWorldPosition.z * 0.5) * 0.05;
        color += vec3(detail);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  })
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.position.y = -2.5
  scene.add(water)

  // Ocean surface (with waves)
  const surfaceGeometry = new THREE.PlaneGeometry(50, 30, 100, 60)
  surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      ${NOISE_GLSL}
      uniform float uTime;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      vec3 gerstnerWave(vec3 pos, float wavelength, float steepness, vec2 direction, float speed) {
        float k = 2.0 * 3.14159 / wavelength;
        float c = sqrt(9.8 / k);
        vec2 d = normalize(direction);
        float f = k * (dot(d, pos.xy) - c * speed * uTime);
        float a = steepness / k;
        return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
      }
      void main() {
        vec3 pos = position;
        vec3 wave1 = gerstnerWave(pos, 8.0, 0.3, vec2(1.0, 0.0), 1.0);
        vec3 wave2 = gerstnerWave(pos, 5.0, 0.2, vec2(0.7, 0.7), 1.2);
        vec3 wave3 = gerstnerWave(pos, 3.0, 0.15, vec2(0.0, 1.0), 1.5);
        float noise = fbm(vec3(pos.x * 0.1, pos.y * 0.1, uTime * 0.2)) * 0.3;
        pos += wave1 + wave2 + wave3;
        pos.z += noise;
        pos.z += 5.0;
        vPosition = pos;
        vWaveHeight = pos.z;
        float delta = 0.1;
        vec3 posX = position + vec3(delta, 0.0, 0.0);
        vec3 posY = position + vec3(0.0, delta, 0.0);
        vec3 waveX1 = gerstnerWave(posX, 8.0, 0.3, vec2(1.0, 0.0), 1.0);
        vec3 waveX2 = gerstnerWave(posX, 5.0, 0.2, vec2(0.7, 0.7), 1.2);
        vec3 waveX3 = gerstnerWave(posX, 3.0, 0.15, vec2(0.0, 1.0), 1.5);
        posX += waveX1 + waveX2 + waveX3;
        vec3 waveY1 = gerstnerWave(posY, 8.0, 0.3, vec2(1.0, 0.0), 1.0);
        vec3 waveY2 = gerstnerWave(posY, 5.0, 0.2, vec2(0.7, 0.7), 1.2);
        vec3 waveY3 = gerstnerWave(posY, 3.0, 0.15, vec2(0.0, 1.0), 1.5);
        posY += waveY1 + waveY2 + waveY3;
        vec3 tangentX = posX - pos;
        vec3 tangentY = posY - pos;
        vNormal = normalize(cross(tangentY, tangentX));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      void main() {
        vec3 baseColor = vec3(0.3, 0.6, 0.8);
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float diffuse = max(dot(vNormal, lightDir), 0.0);
        vec3 viewDir = normalize(cameraPosition - vPosition);
        vec3 reflectDir = reflect(-lightDir, vNormal);
        float specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        vec3 color = baseColor * (0.6 + 0.4 * diffuse) + vec3(1.0) * specular * 0.5;
        color += vec3(0.1) * sin(vWaveHeight * 2.0);
        gl_FragColor = vec4(color, 0.7);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial)
  surface.rotation.x = -Math.PI / 2
  scene.add(surface)

  const edgesGeometry = new THREE.EdgesGeometry(waterGeometry)
  const edges = new THREE.LineSegments(
    edgesGeometry,
    new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 })
  )
  edges.position.copy(water.position)
  scene.add(edges)

  const axesHelper = new THREE.AxesHelper(30)
  scene.add(axesHelper)

  clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)
    const elapsedTime = clock.getElapsedTime()
    surfaceMaterial.uniforms.uTime.value = elapsedTime
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
}

function onResize() {
  const container = containerRef.value
  if (!container || !camera || !renderer) return
  const width = container.clientWidth
  const height = container.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

function dispose() {
  if (animationId != null) cancelAnimationFrame(animationId)
  if (containerRef.value && renderer?.domElement) {
    try {
      containerRef.value.removeChild(renderer.domElement)
    } catch (_) {}
  }
  renderer?.dispose()
  controls?.dispose()
}

onMounted(() => {
  initThree()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  dispose()
})
</script>

<template>
  <MoveBox
    class="ocean-profile-box"
    width="75%"
    height="80%"
    :initial-left="200"
    :initial-top="80"
    title="海洋剖面"
  >
    <div class="ocean-profile-box__close" title="关闭" @click="cesiumStore.closeOceanProfile" />
    <div class="ocean-profile-content">
      <div class="tree-terrain-wrap">
        <div class="tree-terrain-info">
          <strong>海洋几何体剖面</strong><br />
          鼠标拖拽：旋转视角 · 滚轮：缩放 · 右键拖拽：平移
        </div>
        <div ref="containerRef" class="tree-terrain-canvas" />
      </div>
    </div>
  </MoveBox>
</template>

<style scoped>
.ocean-profile-box .ocean-profile-content {
  height: 100%;
  overflow: hidden;
  padding: 0;
}
.ocean-profile-box :deep(.move-box__body) {
  padding: 0;
}

.ocean-profile-box .ocean-profile-box__close {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  font-size: 18px;
  line-height: 1;
}
.ocean-profile-box .ocean-profile-box__close:hover {
  color: #303133;
}
.ocean-profile-box .ocean-profile-box__close::after {
  content: '×';
}

.tree-terrain-wrap {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  background: linear-gradient(to bottom, #87ceeb 0%, #4682b4 100%);
}
.tree-terrain-info {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1;
  color: white;
  background: rgba(0, 0, 0, 0.5);
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
}
.tree-terrain-canvas {
  width: 100%;
  height: 100%;
  min-height: 400px;
}
</style>
