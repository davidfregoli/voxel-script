import { decodeVoxBuffer } from './vox-loader.js'
import { buildVoxelMesh } from './mesher.js'
import { createParticleSystem } from './particles.js'
import { VoxelRenderer, MOODS } from './renderer.js'

const $ = (id) => document.getElementById(id)

const canvas = $('canvas')
const loadingEl = $('loading')
const errorEl = $('error-banner')
const titleEl = $('diorama-title')
const subtitleEl = $('diorama-subtitle')
const descEl = $('diorama-desc')
const accentDot = $('accent-dot')
const dockEl = $('dock')
const inspectorEl = $('inspector')
const sliceSlider = $('slice-z')
const sliceVal = $('slice-z-val')
const sunSlider = $('sun-rot')
const sunVal = $('sun-rot-val')
const modalEl = $('cpu-modal')

let renderer
let manifest = null
let activeId = null
const voxCache = new Map()

function showError(msg) {
  errorEl.textContent = msg
  errorEl.classList.remove('hidden')
}

function applyMoodUi(moodName) {
  const mood = MOODS[moodName]
  if (!mood) return
  renderer.setMood(moodName)
  document.documentElement.style.setProperty('--bg-top', mood.bgTop)
  document.documentElement.style.setProperty('--bg-bottom', mood.bgBottom)
  document.querySelectorAll('[data-mood-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.moodBtn === moodName)
  })
}

async function loadDiorama(id, { updateHash = true } = {}) {
  const entry = manifest.dioramas.find((d) => d.id === id) ?? manifest.dioramas[0]
  if (!entry) return
  activeId = entry.id

  // Update URL hash cleanly
  if (updateHash && window.location.hash !== `#${entry.id}`) {
    history.replaceState(null, '', `#${entry.id}`)
  }

  // Update placard & dock selection immediately
  document.documentElement.style.setProperty('--accent', entry.accent || '#50c1be')
  accentDot.style.background = entry.accent || '#50c1be'
  titleEl.textContent = entry.title
  subtitleEl.textContent = entry.subtitle
  descEl.textContent = entry.description
  document.title = `${entry.title} — Voxel Dioramas`

  document.querySelectorAll('.dock-card').forEach((card) => {
    const isSelected = card.dataset.id === entry.id
    card.classList.toggle('active', isSelected)
    card.setAttribute('aria-selected', String(isSelected))
  })

  applyMoodUi(entry.defaultMood || 'day')

  let cached = voxCache.get(entry.id)
  if (!cached) {
    loadingEl.classList.add('visible')
    try {
      const res = await fetch(`vox/${entry.id}.vox`)
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${entry.id}.vox`)
      const buf = await res.arrayBuffer()
      const decoded = decodeVoxBuffer(buf)
      const mesh = buildVoxelMesh(decoded.model, decoded.palette)
      cached = { decoded, mesh }
      voxCache.set(entry.id, cached)
    } catch (err) {
      showError(`Could not load ${entry.id}.vox: ${err.message}`)
      loadingEl.classList.remove('visible')
      return
    }
    loadingEl.classList.remove('visible')
  }

  const { decoded, mesh } = cached
  const particles = createParticleSystem(entry.particles, mesh.bounds)
  renderer.setMesh(mesh, particles, entry.camera)
  renderer.sunAzOffset = 0
  sunSlider.value = '0'
  sunVal.textContent = '0°'

  // Update inspector fields from decoded .vox telemetry
  $('insp-filename').textContent = `${entry.id}.vox`
  sliceSlider.max = String(decoded.stats.sz)
  sliceSlider.value = String(decoded.stats.sz)
  sliceVal.textContent = `${decoded.stats.sz} / ${decoded.stats.sz}`

  $('stat-grid').textContent = `${decoded.stats.sx}×${decoded.stats.sy}×${decoded.stats.sz}`
  $('stat-voxels').textContent = decoded.stats.voxelCount.toLocaleString()
  $('stat-faces').textContent = mesh.faceCount.toLocaleString()
  $('stat-lights').textContent = `${mesh.lights.length} (${decoded.stats.glowCount})`
  $('stat-colors').textContent = String(decoded.stats.uniqueColors)
  $('stat-bytes').textContent = `${(decoded.stats.bytes / 1024).toFixed(1)} KB`

  // Render embedded RGBA palette swatches
  const strip = $('swatch-strip')
  strip.innerHTML = ''
  for (const sw of decoded.swatches.slice(0, 44)) {
    const el = document.createElement('span')
    el.className = sw.glow ? 'swatch glow' : 'swatch'
    el.style.background = sw.hex
    el.style.color = sw.hex
    el.title = `Index ${sw.index}${sw.glow ? ' (glow)' : ''} · ${sw.hex} · ${sw.count} voxels`
    strip.appendChild(el)
  }

  // CPU reference preview & download link
  $('insp-sheet-thumb').src = `views/${entry.id}-sheet.png`
  $('modal-img').src = `views/${entry.id}-sheet.png`
  $('modal-title').textContent = `${entry.title} — CPU Reference`
  $('btn-download-vox').href = `vox/${entry.id}.vox`
  $('btn-download-vox').download = `${entry.id}.vox`
}

function buildDock() {
  dockEl.innerHTML = ''
  for (const d of manifest.dioramas) {
    const btn = document.createElement('button')
    btn.className = 'dock-card'
    btn.dataset.id = d.id
    btn.setAttribute('role', 'tab')
    btn.style.setProperty('--card-accent', d.accent)
    btn.innerHTML = `
      <img src="views/${d.id}-thumb.png" alt="${d.title}">
      <span class="dock-card-title">${d.title.split(' ').slice(0, 2).join(' ')}</span>
      <span class="dock-card-sub">${d.subtitle}</span>
    `
    btn.addEventListener('click', () => loadDiorama(d.id))
    dockEl.appendChild(btn)
  }
}

function bindPointerControls() {
  const pointers = new Map()
  let mode = null // 'orbit' | 'pan' | 'pinch'
  let lastX = 0, lastY = 0, lastPinch = 0

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit'
      lastX = e.clientX
      lastY = e.clientY
      // Pause auto-spin while user grabs the diorama
      if (renderer.cam.autoRotate) {
        renderer.cam.autoRotate = false
        $('btn-spin').classList.remove('active')
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      mode = 'pinch'
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y)
      lastX = (a.x + b.x) * 0.5
      lastY = (a.y + b.y) * 0.5
    }
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (mode === 'orbit' && pointers.size === 1) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      renderer.cam.targetAz -= dx * 0.45
      renderer.cam.targetEl = Math.max(-10, Math.min(82, renderer.cam.targetEl + dy * 0.35))
    } else if (mode === 'pan' && pointers.size === 1) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const scale = 0.14 / renderer.cam.zoom
      const azRad = (renderer.cam.az * Math.PI) / 180
      const rx = Math.cos(azRad), ry = Math.sin(azRad)
      renderer.cam.targetPanX = Math.max(-36, Math.min(36, renderer.cam.targetPanX - dx * rx * scale))
      renderer.cam.targetPanY = Math.max(-36, Math.min(36, renderer.cam.targetPanY - dx * ry * scale))
      renderer.cam.targetPanZ = Math.max(0, Math.min(58, renderer.cam.targetPanZ + dy * scale))
    } else if (mode === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (lastPinch > 0) {
        const factor = dist / lastPinch
        renderer.cam.targetZoom = Math.max(0.55, Math.min(2.8, renderer.cam.targetZoom * factor))
      }
      lastPinch = dist
    }
  })

  const endPointer = (e) => {
    pointers.delete(e.pointerId)
    if (pointers.size === 0) mode = null
    else if (pointers.size === 1) {
      const [only] = [...pointers.values()]
      mode = 'orbit'
      lastX = only.x
      lastY = only.y
    }
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = Math.exp(-e.deltaY * 0.0012)
    renderer.cam.targetZoom = Math.max(0.55, Math.min(2.8, renderer.cam.targetZoom * delta))
  }, { passive: false })
}

function bindUiControls() {
  // Mood buttons
  document.querySelectorAll('[data-mood-btn]').forEach((btn) => {
    btn.addEventListener('click', () => applyMoodUi(btn.dataset.moodBtn))
  })

  // Auto-spin toggle
  $('btn-spin').addEventListener('click', () => {
    renderer.cam.autoRotate = !renderer.cam.autoRotate
    $('btn-spin').classList.toggle('active', renderer.cam.autoRotate)
  })

  // Orthographic / Perspective toggle
  $('btn-proj').addEventListener('click', () => {
    renderer.cam.ortho = !renderer.cam.ortho
    $('btn-proj').textContent = renderer.cam.ortho ? 'Iso' : 'Persp'
    $('btn-proj').classList.toggle('active', renderer.cam.ortho)
  })

  // Ambient particles toggle
  $('btn-fx').addEventListener('click', () => {
    renderer.showParticles = !renderer.showParticles
    $('btn-fx').classList.toggle('active', renderer.showParticles)
  })

  // Inspector drawer toggle
  const toggleInspect = (force) => {
    const open = force ?? inspectorEl.classList.contains('hidden')
    inspectorEl.classList.toggle('hidden', !open)
    $('btn-inspect').classList.toggle('active', open)
  }
  $('btn-inspect').addEventListener('click', () => toggleInspect())
  $('btn-close-inspect').addEventListener('click', () => toggleInspect(false))

  // 4-angle isometric snap buttons (matching voxel-script/view.mjs exact angles)
  const ISO_EL = Math.atan(1 / Math.sqrt(2)) * (180 / Math.PI)
  document.querySelectorAll('[data-snap]').forEach((btn) => {
    btn.addEventListener('click', () => {
      renderer.cam.autoRotate = false
      $('btn-spin').classList.remove('active')
      renderer.cam.ortho = true
      $('btn-proj').textContent = 'Iso'
      $('btn-proj').classList.add('active')
      renderer.cam.targetAz = Number(btn.dataset.snap)
      renderer.cam.targetEl = ISO_EL
      renderer.cam.targetZoom = 1.0
      renderer.cam.targetPanX = 0
      renderer.cam.targetPanY = 0
      if (renderer.mesh) renderer.cam.targetPanZ = renderer.mesh.bounds.sz * 0.28
    })
  })

  // Z-layer slice scrubber
  sliceSlider.addEventListener('input', () => {
    const z = Number(sliceSlider.value)
    renderer.maxZ = z
    sliceVal.textContent = `${z} / ${sliceSlider.max}`
  })

  // Sun azimuth slider
  sunSlider.addEventListener('input', () => {
    const deg = Number(sunSlider.value)
    renderer.sunAzOffset = deg
    sunVal.textContent = `${deg > 0 ? '+' : ''}${deg}°`
  })

  // Reset view
  $('btn-reset-cam').addEventListener('click', () => {
    const entry = manifest.dioramas.find((d) => d.id === activeId)
    renderer.cam.ortho = false
    $('btn-proj').textContent = 'Persp'
    $('btn-proj').classList.remove('active')
    renderer.cam.targetAz = entry?.camera?.az ?? 40
    renderer.cam.targetEl = entry?.camera?.el ?? 32
    renderer.cam.targetZoom = entry?.camera?.zoom ?? 1.0
    renderer.cam.targetPanX = 0
    renderer.cam.targetPanY = 0
    if (renderer.mesh) {
      renderer.cam.targetPanZ = renderer.mesh.bounds.sz * 0.34
      renderer.maxZ = renderer.mesh.bounds.sz
      sliceSlider.value = String(renderer.mesh.bounds.sz)
      sliceVal.textContent = `${renderer.mesh.bounds.sz} / ${renderer.mesh.bounds.sz}`
    }
    renderer.sunAzOffset = 0
    sunSlider.value = '0'
    sunVal.textContent = '0°'
  })

  // CPU sheet modal
  $('btn-cpu-sheet').addEventListener('click', () => modalEl.classList.remove('hidden'))
  $('btn-close-modal').addEventListener('click', () => modalEl.classList.add('hidden'))
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) modalEl.classList.add('hidden')
  })

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    if (e.key === 'Escape') {
      modalEl.classList.add('hidden')
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      $('btn-spin').click()
    } else if (e.key.toLowerCase() === 'o') {
      $('btn-proj').click()
    } else if (e.key.toLowerCase() === 'p') {
      $('btn-fx').click()
    } else if (e.key.toLowerCase() === 'i') {
      toggleInspect()
    } else if (e.key.toLowerCase() === 'r') {
      $('btn-reset-cam').click()
    } else if (e.key.toLowerCase() === 'm') {
      const order = ['day', 'golden', 'dusk', 'night']
      const next = order[(order.indexOf(renderer.moodName) + 1) % order.length]
      applyMoodUi(next)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const idx = manifest.dioramas.findIndex((d) => d.id === activeId)
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const next = manifest.dioramas[(idx + delta + manifest.dioramas.length) % manifest.dioramas.length]
      loadDiorama(next.id)
    } else if (e.key >= '1' && e.key <= '9') {
      const item = manifest.dioramas[Number(e.key) - 1]
      if (item) loadDiorama(item.id)
    }
  })
}

async function init() {
  try {
    renderer = new VoxelRenderer(canvas)
  } catch (err) {
    showError(err.message)
    return
  }

  try {
    const res = await fetch('manifest.json')
    if (!res.ok) throw new Error(`HTTP ${res.status} loading manifest.json`)
    manifest = await res.json()
  } catch (err) {
    showError(`Failed to load diorama manifest: ${err.message}`)
    return
  }

  buildDock()
  bindPointerControls()
  bindUiControls()

  const hashId = window.location.hash.replace(/^#/, '')
  const initial = manifest.dioramas.find((d) => d.id === hashId)?.id ?? manifest.dioramas[0]?.id
  await loadDiorama(initial, { updateHash: false })

  // Render loop
  let last = performance.now()
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    renderer.step(dt, now / 1000)
    renderer.render(now / 1000)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

init()
