// Living ambient voxel particles matched to each diorama's story.
// Each particle renders as a tiny glowing or sunlit 3D voxel sprite in world space (Z up).

export function createParticleSystem(preset, bounds) {
  const { sx, sy, sz } = bounds
  const particles = []
  const rand = (a, b) => a + Math.random() * (b - a)

  const add = (p) => particles.push(p)

  if (preset === 'snow-steam') {
    // Gentle falling snowflakes
    for (let i = 0; i < 60; i++) {
      add({
        kind: 'snow',
        x: rand(-sx * 0.52, sx * 0.52),
        y: rand(-sy * 0.52, sy * 0.52),
        z: rand(10, sz + 14),
        vx: rand(-1.2, 1.2),
        vy: rand(-1.0, 1.0),
        vz: rand(-4.8, -2.6),
        phase: rand(0, Math.PI * 2),
        size: rand(0.55, 0.95),
        color: [0.96, 0.98, 1.0],
        alpha: rand(0.65, 0.92),
        zMin: 9,
        zMax: sz + 14,
      })
    }
    // Rising warm hot-spring steam wisps above the turquoise pool
    for (let i = 0; i < 24; i++) {
      add({
        kind: 'steam',
        x: rand(-14, 12),
        y: rand(-14, 6),
        z: rand(10, 28),
        vx: rand(-0.6, 0.6),
        vy: rand(-0.6, 0.6),
        vz: rand(2.2, 4.2),
        phase: rand(0, Math.PI * 2),
        size: rand(1.3, 2.2),
        color: [0.92, 0.97, 1.0],
        alpha: rand(0.22, 0.40),
        zMin: 10,
        zMax: 30,
      })
    }
  } else if (preset === 'sakura') {
    // Drifting pink cherry blossom petals tumbling lazily across the garden
    for (let i = 0; i < 56; i++) {
      add({
        kind: 'petal',
        x: rand(-sx * 0.5, sx * 0.45),
        y: rand(-sy * 0.45, sy * 0.5),
        z: rand(11, sz + 6),
        vx: rand(1.4, 3.0),
        vy: rand(-2.2, -0.8),
        vz: rand(-3.0, -1.6),
        phase: rand(0, Math.PI * 2),
        size: rand(0.65, 1.05),
        color: i % 3 === 0 ? [1.0, 0.88, 0.93] : [0.97, 0.66, 0.77],
        alpha: rand(0.75, 0.96),
        zMin: 9.5,
        zMax: sz + 6,
      })
    }
  } else if (preset === 'fireflies') {
    // Warm magical glowing fireflies bobbing lazily around the toadstool cottage
    for (let i = 0; i < 34; i++) {
      const ang = rand(0, Math.PI * 2)
      const rad = rand(12, 28)
      add({
        kind: 'firefly',
        bx: Math.cos(ang) * rad,
        by: Math.sin(ang) * rad,
        bz: rand(13, 30),
        x: 0, y: 0, z: 16,
        phase: rand(0, Math.PI * 2),
        speed: rand(0.7, 1.5),
        size: rand(0.65, 1.05),
        color: i % 2 === 0 ? [0.76, 1.0, 0.35] : [1.0, 0.85, 0.34],
        alpha: 0.95,
      })
    }
    // Gentle chimney smoke puffs above bakery chimney
    for (let i = 0; i < 12; i++) {
      add({
        kind: 'smoke',
        x: 13.5 + rand(-1.5, 1.5),
        y: 9.5 + rand(-1.5, 1.5),
        z: rand(53, 68),
        vx: rand(0.5, 1.2),
        vy: rand(0.3, 0.9),
        vz: rand(2.4, 3.6),
        phase: rand(0, Math.PI * 2),
        size: rand(1.4, 2.3),
        color: [0.95, 0.94, 0.92],
        alpha: 0.36,
        zMin: 53,
        zMax: 69,
      })
    }
  } else if (preset === 'steam-rain') {
    // Midnight cozy drizzle droplets + rising ramen broth steam
    for (let i = 0; i < 42; i++) {
      add({
        kind: 'rain',
        x: rand(-sx * 0.48, sx * 0.48),
        y: rand(-sy * 0.48, sy * 0.48),
        z: rand(10, sz + 14),
        vx: -1.4,
        vy: -0.6,
        vz: rand(-18, -12),
        phase: rand(0, Math.PI * 2),
        size: rand(0.45, 0.65),
        color: [0.68, 0.84, 0.98],
        alpha: rand(0.28, 0.48),
        zMin: 9.5,
        zMax: sz + 14,
      })
    }
    for (let i = 0; i < 16; i++) {
      add({
        kind: 'steam',
        x: rand(-9, -1),
        y: rand(4, 11),
        z: rand(23, 36),
        vx: rand(-0.4, 0.4),
        vy: rand(-0.5, 0.3),
        vz: rand(2.2, 3.8),
        phase: rand(0, Math.PI * 2),
        size: rand(1.1, 1.8),
        color: [1.0, 0.96, 0.88],
        alpha: 0.34,
        zMin: 23,
        zMax: 36,
      })
    }
  } else if (preset === 'reef-bubbles') {
    for (let i = 0; i < 32; i++) {
      const bx = rand(-32, 34), by = rand(-15, 22)
      add({
        kind: 'bubble', bx, by, x: bx, y: by, z: rand(14, 77),
        vx: 0, vy: 0, vz: rand(2, 4), phase: rand(0, Math.PI * 2),
        size: rand(0.45, 0.95), color: [0.55, 0.90, 0.92],
        alpha: 0.42, zMin: 14, zMax: 77,
      })
    }
  } else if (preset === 'sea-breeze') {
    // Sea mist sparkles + keeper cottage chimney wisps
    for (let i = 0; i < 32; i++) {
      add({
        kind: 'mist',
        x: rand(-sx * 0.46, sx * 0.46),
        y: rand(-sy * 0.46, sy * 0.15),
        z: rand(10, 26),
        vx: rand(1.4, 2.8),
        vy: rand(0.4, 1.2),
        vz: rand(0.5, 1.4),
        phase: rand(0, Math.PI * 2),
        size: rand(0.55, 0.9),
        color: [0.88, 0.97, 1.0],
        alpha: rand(0.32, 0.55),
        zMin: 10,
        zMax: 28,
      })
    }
    for (let i = 0; i < 10; i++) {
      add({
        kind: 'smoke',
        x: -4 + rand(-1, 1),
        y: 14 + rand(-1, 1),
        z: rand(35, 48),
        vx: rand(0.8, 1.5),
        vy: rand(0.2, 0.6),
        vz: rand(2.0, 3.2),
        phase: rand(0, Math.PI * 2),
        size: rand(1.2, 1.8),
        color: [0.95, 0.96, 0.98],
        alpha: 0.34,
        zMin: 35,
        zMax: 49,
      })
    }
  } else if (preset === 'high-breeze') {
    // Thin wisps of cloud rising past a tall scene, all the way up its height
    for (let i = 0; i < 36; i++) {
      add({
        kind: 'mist',
        x: rand(-sx * 0.46, sx * 0.46),
        y: rand(-sy * 0.46, sy * 0.46),
        z: rand(14, sz),
        vx: rand(1.2, 2.4),
        vy: rand(0.2, 0.9),
        vz: rand(0.6, 1.5),
        phase: rand(0, Math.PI * 2),
        size: rand(0.6, 1.0),
        color: [1.0, 0.97, 0.93],
        alpha: rand(0.28, 0.5),
        zMin: 14,
        zMax: sz,
      })
    }
  } else if (preset === 'desert-dust') {
    // Warm dust lifting off the mesas on a cross-breeze, and smoke from the locomotive's stack
    // Each mote rises through a short band of its own, so it fades out before the breeze carries it off the scene
    for (let i = 0; i < 34; i++) {
      const zMin = rand(9, 34), zMax = zMin + rand(6, 10)
      add({
        kind: 'dust',
        x: rand(-sx * 0.48, sx * 0.48),
        y: rand(-sy * 0.48, sy * 0.48),
        z: rand(zMin, zMax),
        vx: rand(1.6, 3.2),
        vy: rand(-0.5, 0.7),
        vz: rand(0.8, 1.6),
        phase: rand(0, Math.PI * 2),
        size: rand(0.5, 0.9),
        color: [1.0, 0.86, 0.66],
        alpha: rand(0.3, 0.52),
        zMin,
        zMax,
      })
    }
    for (let i = 0; i < 10; i++) {
      add({
        kind: 'smoke',
        bx: 5.5,
        by: -0.5,
        x: 5.5 + rand(-1, 1),
        y: -0.5 + rand(-1, 1),
        z: rand(42, 56),
        vx: rand(-2.2, -1.2),
        vy: rand(-0.3, 0.3),
        vz: rand(2.0, 3.2),
        phase: rand(0, Math.PI * 2),
        size: rand(1.2, 1.9),
        color: [0.97, 0.95, 0.92],
        alpha: 0.36,
        zMin: 42,
        zMax: 57,
      })
    }
  } else if (preset === 'bubbles') {
    // Rising translucent underwater bubbles & glowing sea-plankton motes
    for (let i = 0; i < 48; i++) {
      add({
        kind: 'bubble',
        x: rand(-sx * 0.45, sx * 0.45),
        y: rand(-sy * 0.45, sy * 0.45),
        z: rand(12, sz + 4),
        vx: rand(-0.4, 0.4),
        vy: rand(-0.4, 0.4),
        vz: rand(2.6, 5.2),
        phase: rand(0, Math.PI * 2),
        size: rand(0.55, 1.25),
        color: i % 4 === 0 ? [0.42, 0.95, 1.0] : [0.82, 0.96, 1.0],
        alpha: rand(0.38, 0.72),
        zMin: 12,
        zMax: sz + 4,
      })
    }
  } else if (preset === 'stardust') {
    // Twinkling cosmic stardust motes orbiting the floating sky island
    for (let i = 0; i < 48; i++) {
      const ang = rand(0, Math.PI * 2)
      const rad = rand(14, 34)
      add({
        kind: 'star',
        ang,
        rad,
        bz: rand(8, sz + 4),
        x: 0, y: 0, z: 20,
        phase: rand(0, Math.PI * 2),
        speed: rand(0.18, 0.48),
        size: rand(0.55, 1.0),
        color: i % 3 === 0 ? [0.42, 0.95, 1.0] : (i % 3 === 1 ? [1.0, 0.85, 0.42] : [0.92, 0.72, 1.0]),
        alpha: 0.92,
      })
    }
  }

  return {
    preset,
    particles,
    update(dt, time) {
      for (const p of particles) {
        if (p.kind === 'firefly') {
          const t = time * p.speed + p.phase
          p.x = p.bx + Math.sin(t) * 3.2
          p.y = p.by + Math.cos(t * 0.8) * 3.2
          p.z = p.bz + Math.sin(t * 1.4) * 2.2
          p.liveAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 2.6 + p.phase * 2))
        } else if (p.kind === 'star') {
          const a = p.ang + time * p.speed * 0.25
          p.x = Math.cos(a) * p.rad
          p.y = Math.sin(a) * p.rad
          p.z = p.bz + Math.sin(time * 0.9 + p.phase) * 2.0
          p.liveAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * 2.2 + p.phase * 3))
        } else {
          p.x += (p.vx + Math.sin(time * 1.3 + p.phase) * 0.65) * dt
          p.y += (p.vy + Math.cos(time * 1.1 + p.phase) * 0.55) * dt
          p.z += p.vz * dt

          const span = Math.max(1, p.zMax - p.zMin)
          const prog = (p.z - p.zMin) / span
          if (p.vz > 0) {
            if (p.z > p.zMax) {
              p.z = p.zMin
              if (p.kind === 'bubble') {
                p.x = p.bx
                p.y = p.by
              } else if (p.kind === 'smoke') {
                p.x = (p.bx ?? (preset === 'fireflies' ? 13.5 : -4)) + (Math.random() - 0.5) * 2.2
                p.y = (p.by ?? (preset === 'fireflies' ? 9.5 : 14)) + (Math.random() - 0.5) * 2.2
              } else if (p.kind === 'dust') {
                p.x = rand(-sx * 0.48, sx * 0.3)
                p.y = rand(-sy * 0.48, sy * 0.48)
              } else if (p.kind === 'steam') {
                p.x = (preset === 'snow-steam' ? rand(-14, 12) : rand(-9, -1))
                p.y = (preset === 'snow-steam' ? rand(-14, 6) : rand(4, 11))
              } else if (p.kind === 'mist') {
                p.x = rand(-sx * 0.45, sx * 0.3)
                p.y = rand(-sy * 0.45, sy * 0.15)
              } else if (p.kind === 'bubble') {
                p.x = rand(-sx * 0.45, sx * 0.45)
                p.y = rand(-sy * 0.45, sy * 0.45)
              }
            }
            p.liveAlpha = p.alpha * Math.sin(Math.max(0, Math.min(1, prog)) * Math.PI)
          } else {
            if (p.z < p.zMin) {
              p.z = p.zMax
              p.x = rand(-sx * 0.5, sx * 0.5)
              p.y = rand(-sy * 0.5, sy * 0.5)
            }
            p.liveAlpha = p.alpha * Math.min(1, prog * 3.5) * Math.min(1, (1 - prog) * 3.5)
          }
        }
      }
    },
  }
}
