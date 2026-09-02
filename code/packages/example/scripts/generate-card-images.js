// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

const { createCanvas } = require('canvas')
const fs = require('node:fs')
const path = require('node:path')

const W = 600
const H = 900

function createBaseCanvas() {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  return { canvas, ctx }
}

function applySheen(ctx) {
  const sheen = ctx.createRadialGradient(W * 0.32, H * 0.24, 0, W * 0.32, H * 0.24, W * 0.85)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.4)')
  sheen.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)')
  sheen.addColorStop(1, 'rgba(0, 0, 0, 0.18)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, W, H)
}

// ----------------------------------------------------
// HOME CARDS (Draped cloth aesthetic in 4 colorways)
// ----------------------------------------------------

function drawDrapedCloth(ctx, [c0, c1, c2], folds) {
  // Ground gradient
  const ground = ctx.createLinearGradient(W * 0.1, 0, W * 0.75, H)
  ground.addColorStop(0, c0)
  ground.addColorStop(0.45, c1)
  ground.addColorStop(1, c2)
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, W, H)

  // Folds
  folds.forEach((f) => {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(f.p0.x, f.p0.y)
    ctx.bezierCurveTo(f.c1.x, f.c1.y, f.c2.x, f.c2.y, f.p1.x, f.p1.y)
    ctx.lineTo(f.p2.x, f.p2.y)
    ctx.bezierCurveTo(f.c3.x, f.c3.y, f.c4.x, f.c4.y, f.p3.x, f.p3.y)
    ctx.closePath()

    const grad = ctx.createLinearGradient(f.p0.x, f.p0.y, f.p2.x, f.p2.y)
    grad.addColorStop(0, 'rgba(255, 255, 255, ' + f.highlight + ')')
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0)')
    grad.addColorStop(0.7, 'rgba(0, 0, 0, ' + f.shadow1 + ')')
    grad.addColorStop(1, 'rgba(0, 0, 0, ' + f.shadow2 + ')')

    ctx.fillStyle = grad
    ctx.globalAlpha = f.alpha
    ctx.fill()
    ctx.restore()

    // Crease highlight line
    if (f.line) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(f.line.p0.x, f.line.p0.y)
      ctx.bezierCurveTo(f.line.c1.x, f.line.c1.y, f.line.c2.x, f.line.c2.y, f.line.p1.x, f.line.p1.y)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }
  })

  applySheen(ctx)
}

// ----------------------------------------------------
// BUILD CARDS (Concept-based abstract artworks)
// ----------------------------------------------------

function generateNodesArtwork() {
  const { canvas, ctx } = createBaseCanvas()

  // Moss / Sage grey palette
  const ground = ctx.createLinearGradient(W * 0.1, 0, W * 0.75, H)
  ground.addColorStop(0, '#f0f3ef')
  ground.addColorStop(0.45, '#cbded0')
  ground.addColorStop(1, '#8ea394')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, W, H)

  // Background subtle canvas grid / dots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  for (let x = 40; x < W; x += 50) {
    for (let y = 40; y < H; y += 50) {
      ctx.beginPath()
      ctx.arc(x, y, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Interconnection links
  const links = [
    [160, 200, 360, 140],
    [160, 200, 140, 440],
    [160, 200, 380, 400],
    [360, 140, 480, 280],
    [380, 400, 480, 280],
    [380, 400, 220, 620],
    [140, 440, 220, 620],
    [220, 620, 420, 700],
    [380, 400, 420, 700],
    [220, 620, 310, 830],
    [420, 700, 310, 830],
  ]

  ctx.save()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
  links.forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  })
  ctx.restore()

  // Floating nodes (cards & circles)
  const nodes = [
    { x: 160, y: 200, r: 48, type: 'card', w: 100, h: 70 },
    { x: 360, y: 140, r: 40, type: 'circle' },
    { x: 480, y: 280, r: 44, type: 'card', w: 80, h: 80 },
    { x: 140, y: 440, r: 36, type: 'circle' },
    { x: 380, y: 400, r: 64, type: 'card', w: 130, h: 90 },
    { x: 220, y: 620, r: 50, type: 'card', w: 110, h: 75 },
    { x: 420, y: 700, r: 42, type: 'circle' },
    { x: 310, y: 830, r: 32, type: 'circle' },
  ]

  nodes.forEach((n) => {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 12

    const orbGrad = ctx.createRadialGradient(n.x - n.r * 0.3, n.y - n.r * 0.3, 0, n.x, n.y, n.r * 1.3)
    orbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
    orbGrad.addColorStop(0.4, 'rgba(240, 248, 242, 0.6)')
    orbGrad.addColorStop(1, 'rgba(120, 145, 125, 0.4)')

    if (n.type === 'card') {
      const rx = n.x - n.w / 2
      const ry = n.y - n.h / 2
      ctx.beginPath()
      ctx.roundRect(rx, ry, n.w, n.h, 16)
      ctx.fillStyle = orbGrad
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Mini node element indicator inside
      ctx.fillStyle = 'rgba(120, 145, 125, 0.5)'
      ctx.beginPath()
      ctx.roundRect(rx + 12, ry + 12, n.w - 24, 10, 4)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      ctx.fillStyle = orbGrad
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.restore()
  })

  applySheen(ctx)
  return canvas.toBuffer('image/png')
}

function generatePluginsArtwork() {
  const { canvas, ctx } = createBaseCanvas()

  // Indigo / Slate palette
  const ground = ctx.createLinearGradient(W * 0.1, 0, W * 0.75, H)
  ground.addColorStop(0, '#eef0f8')
  ground.addColorStop(0.45, '#c5cee2')
  ground.addColorStop(1, '#8590b5')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, W, H)

  // Interlocking modular prisms
  const blocks = [
    { x: 180, y: 170, w: 260, h: 180, rot: -0.08, color: '#ffffff' },
    { x: 370, y: 270, w: 240, h: 170, rot: 0.06, color: '#dbe2f3' },
    { x: 210, y: 430, w: 270, h: 190, rot: 0.07, color: '#eef1f8' },
    { x: 390, y: 530, w: 250, h: 180, rot: -0.06, color: '#c9d3ea' },
    { x: 200, y: 690, w: 260, h: 180, rot: -0.04, color: '#ffffff' },
    { x: 370, y: 780, w: 240, h: 170, rot: 0.08, color: '#dbe2f3' },
  ]

  blocks.forEach((b) => {
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.rot)

    ctx.shadowColor = 'rgba(0, 0, 0, 0.16)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 14

    const bGrad = ctx.createLinearGradient(-b.w / 2, -b.h / 2, b.w / 2, b.h / 2)
    bGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
    bGrad.addColorStop(0.5, 'rgba(225, 233, 248, 0.45)')
    bGrad.addColorStop(1, 'rgba(125, 137, 172, 0.35)')

    ctx.beginPath()
    ctx.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 24)
    ctx.fillStyle = bGrad
    ctx.fill()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Module connector notch / puzzle tab
    ctx.beginPath()
    ctx.arc(0, -b.h / 2, 22, 0, Math.PI, false)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.fill()

    ctx.restore()
  })

  applySheen(ctx)
  return canvas.toBuffer('image/png')
}

function generateActionsArtwork() {
  const { canvas, ctx } = createBaseCanvas()

  // Terracotta / Amber palette
  const ground = ctx.createLinearGradient(W * 0.1, 0, W * 0.75, H)
  ground.addColorStop(0, '#fbf2ee')
  ground.addColorStop(0.45, '#e4c4b5')
  ground.addColorStop(1, '#ba7c61')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, W, H)

  // Dynamic sweeping arcs and energy rays
  const centerX = 300
  const centerY = 500

  // Background glow
  const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 380)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.7)')
  glow.addColorStop(0.4, 'rgba(255, 235, 225, 0.25)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(centerX, centerY, 380, 0, Math.PI * 2)
  ctx.fill()

  // Kinetic energy streams
  const rays = [
    [-Math.PI * 0.85, 450, 80],
    [-Math.PI * 0.65, 520, 100],
    [-Math.PI * 0.45, 480, 90],
    [-Math.PI * 0.25, 540, 110],
    [-Math.PI * 0.05, 460, 70],
    [Math.PI * 0.2, 500, 85],
    [Math.PI * 0.45, 470, 75],
    [Math.PI * 0.75, 530, 95],
  ]

  rays.forEach(([ang, len, spread]) => {
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(ang)

    const rayGrad = ctx.createLinearGradient(0, 0, len, 0)
    rayGrad.addColorStop(0, 'rgba(255, 255, 255, 0.75)')
    rayGrad.addColorStop(0.5, 'rgba(255, 240, 230, 0.25)')
    rayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.2)')

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(len, -spread / 2)
    ctx.bezierCurveTo(len + 20, 0, len + 20, 0, len, spread / 2)
    ctx.closePath()
    ctx.fillStyle = rayGrad
    ctx.fill()
    ctx.restore()
  })

  // Concentric kinetic pulses
  ;[80, 160, 260, 360].forEach((r) => {
    ctx.save()
    ctx.beginPath()
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([8, 16])
    ctx.stroke()
    ctx.restore()
  })

  // Core action epicenter
  const core = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 48)
  core.addColorStop(0, '#ffffff')
  core.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)')
  core.addColorStop(1, 'rgba(255, 230, 215, 0.4)')
  ctx.beginPath()
  ctx.arc(centerX, centerY, 48, 0, Math.PI * 2)
  ctx.fillStyle = core
  ctx.fill()

  applySheen(ctx)
  return canvas.toBuffer('image/png')
}

function generateStoresArtwork() {
  const { canvas, ctx } = createBaseCanvas()

  // Steel / Teal palette
  const ground = ctx.createLinearGradient(W * 0.1, 0, W * 0.75, H)
  ground.addColorStop(0, '#eaf2f4')
  ground.addColorStop(0.45, '#c2d7dd')
  ground.addColorStop(1, '#7ea4ad')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, W, H)

  // Stacked architectural data stratum planes
  const layers = [
    { y: 140, h: 100 },
    { y: 280, h: 100 },
    { y: 420, h: 100 },
    { y: 560, h: 100 },
    { y: 700, h: 100 },
  ]

  layers.forEach((l, idx) => {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.14)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 10

    const layerGrad = ctx.createLinearGradient(70, l.y, 530, l.y + l.h)
    layerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
    layerGrad.addColorStop(0.5, 'rgba(230, 244, 247, 0.45)')
    layerGrad.addColorStop(1, 'rgba(110, 150, 160, 0.35)')

    ctx.beginPath()
    ctx.roundRect(70, l.y, 460, l.h, 20)
    ctx.fillStyle = layerGrad
    ctx.fill()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Data stratum grooves
    ctx.beginPath()
    ctx.moveTo(110, l.y + l.h / 2)
    ctx.lineTo(440, l.y + l.h / 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Active synchronization indicator orbs
    ctx.beginPath()
    ctx.arc(480, l.y + l.h / 2, 8, 0, Math.PI * 2)
    ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(200, 240, 245, 0.8)'
    ctx.fill()
    ctx.restore()
  })

  // Vertical synchronization connection bus
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(150, 100)
  ctx.lineTo(150, 830)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 12])
  ctx.stroke()
  ctx.restore()

  applySheen(ctx)
  return canvas.toBuffer('image/png')
}

// ----------------------------------------------------
// GENERATE HOME CLOTH PNGS
// ----------------------------------------------------

function generateHomeCloth(name, colorways, foldDefs) {
  const { canvas, ctx } = createBaseCanvas()
  drawDrapedCloth(ctx, colorways, foldDefs)
  return canvas.toBuffer('image/png')
}

const foldsQS = [
  {
    p0: { x: -24, y: -12 },
    c1: { x: 7, y: 252 },
    c2: { x: 30, y: 540 },
    p1: { x: 36, y: 912 },
    p2: { x: 109, y: 912 },
    c3: { x: 103, y: 540 },
    c4: { x: 109, y: 252 },
    p3: { x: 90, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.3,
    line: { p0: { x: -7, y: -12 }, c1: { x: 7, y: 270 }, c2: { x: 31, y: 558 }, p1: { x: 42, y: 912 } },
  },
  {
    p0: { x: 78, y: -12 },
    c1: { x: 68, y: 252 },
    c2: { x: 188, y: 540 },
    p1: { x: 163, y: 912 },
    p2: { x: 232, y: 912 },
    c3: { x: 256, y: 540 },
    c4: { x: 131, y: 252 },
    p3: { x: 148, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.8,
  },
  {
    p0: { x: 166, y: -12 },
    c1: { x: 201, y: 252 },
    c2: { x: 280, y: 540 },
    p1: { x: 278, y: 912 },
    p2: { x: 344, y: 912 },
    c3: { x: 347, y: 540 },
    c4: { x: 277, y: 252 },
    p3: { x: 250, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.6,
    line: { p0: { x: 179, y: -12 }, c1: { x: 201, y: 270 }, c2: { x: 280, y: 558 }, p1: { x: 282, y: 912 } },
  },
  {
    p0: { x: 247, y: -12 },
    c1: { x: 288, y: 252 },
    c2: { x: 389, y: 540 },
    p1: { x: 384, y: 912 },
    p2: { x: 468, y: 912 },
    c3: { x: 473, y: 540 },
    c4: { x: 380, y: 252 },
    p3: { x: 350, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.7,
  },
  {
    p0: { x: 322, y: -12 },
    c1: { x: 342, y: 252 },
    c2: { x: 507, y: 540 },
    p1: { x: 485, y: 912 },
    p2: { x: 542, y: 912 },
    c3: { x: 564, y: 540 },
    c4: { x: 414, y: 252 },
    p3: { x: 402, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.7,
    line: { p0: { x: 334, y: -12 }, c1: { x: 342, y: 270 }, c2: { x: 503, y: 558 }, p1: { x: 489, y: 912 } },
  },
  {
    p0: { x: 408, y: -12 },
    c1: { x: 517, y: 252 },
    c2: { x: 570, y: 540 },
    p1: { x: 596, y: 912 },
    p2: { x: 650, y: 912 },
    c3: { x: 624, y: 540 },
    c4: { x: 568, y: 252 },
    p3: { x: 464, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.5,
  },
  {
    p0: { x: 496, y: -12 },
    c1: { x: 536, y: 252 },
    c2: { x: 731, y: 540 },
    p1: { x: 710, y: 912 },
    p2: { x: 749, y: 912 },
    c3: { x: 770, y: 540 },
    c4: { x: 582, y: 252 },
    p3: { x: 547, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.7,
    line: { p0: { x: 504, y: -12 }, c1: { x: 536, y: 270 }, c2: { x: 728, y: 558 }, p1: { x: 713, y: 912 } },
  },
]

const foldsSDK = [
  {
    p0: { x: -17, y: -12 },
    c1: { x: -26, y: 252 },
    c2: { x: -64, y: 540 },
    p1: { x: -61, y: 912 },
    p2: { x: -18, y: 912 },
    c3: { x: -22, y: 540 },
    c4: { x: 19, y: 252 },
    p3: { x: 33, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.7,
    line: { p0: { x: -9, y: -12 }, c1: { x: -26, y: 270 }, c2: { x: -64, y: 558 }, p1: { x: -58, y: 912 } },
  },
  {
    p0: { x: 54, y: -12 },
    c1: { x: 53, y: 252 },
    c2: { x: -15, y: 540 },
    p1: { x: -4, y: 912 },
    p2: { x: 38, y: 912 },
    c3: { x: 26, y: 540 },
    c4: { x: 92, y: 252 },
    p3: { x: 98, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.8,
  },
  {
    p0: { x: 103, y: -12 },
    c1: { x: 41, y: 252 },
    c2: { x: 55, y: 540 },
    p1: { x: 33, y: 912 },
    p2: { x: 77, y: 912 },
    c3: { x: 100, y: 540 },
    c4: { x: 92, y: 252 },
    p3: { x: 160, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.4,
    line: { p0: { x: 112, y: -12 }, c1: { x: 41, y: 270 }, c2: { x: 52, y: 558 }, p1: { x: 36, y: 912 } },
  },
  {
    p0: { x: 163, y: -12 },
    c1: { x: 148, y: 252 },
    c2: { x: 71, y: 540 },
    p1: { x: 80, y: 912 },
    p2: { x: 119, y: 912 },
    c3: { x: 110, y: 540 },
    c4: { x: 187, y: 252 },
    p3: { x: 206, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.3,
  },
  {
    p0: { x: 227, y: -12 },
    c1: { x: 221, y: 252 },
    c2: { x: 113, y: 540 },
    p1: { x: 130, y: 912 },
    p2: { x: 172, y: 912 },
    c3: { x: 155, y: 540 },
    c4: { x: 272, y: 252 },
    p3: { x: 283, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.7,
    line: { p0: { x: 235, y: -12 }, c1: { x: 221, y: 270 }, c2: { x: 116, y: 558 }, p1: { x: 133, y: 912 } },
  },
  {
    p0: { x: 287, y: -12 },
    c1: { x: 226, y: 252 },
    c2: { x: 190, y: 540 },
    p1: { x: 177, y: 912 },
    p2: { x: 247, y: 912 },
    c3: { x: 260, y: 540 },
    c4: { x: 290, y: 252 },
    p3: { x: 358, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.5,
  },
  {
    p0: { x: 354, y: -12 },
    c1: { x: 314, y: 252 },
    c2: { x: 230, y: 540 },
    p1: { x: 231, y: 912 },
    p2: { x: 288, y: 912 },
    c3: { x: 286, y: 540 },
    c4: { x: 369, y: 252 },
    p3: { x: 416, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.4,
    line: { p0: { x: 364, y: -12 }, c1: { x: 314, y: 270 }, c2: { x: 230, y: 558 }, p1: { x: 234, y: 912 } },
  },
  {
    p0: { x: 414, y: -12 },
    c1: { x: 329, y: 252 },
    c2: { x: 301, y: 540 },
    p1: { x: 278, y: 912 },
    p2: { x: 316, y: 912 },
    c3: { x: 339, y: 540 },
    c4: { x: 371, y: 252 },
    p3: { x: 461, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.8,
  },
  {
    p0: { x: 460, y: -12 },
    c1: { x: 405, y: 252 },
    c2: { x: 313, y: 540 },
    p1: { x: 311, y: 912 },
    p2: { x: 360, y: 912 },
    c3: { x: 362, y: 540 },
    c4: { x: 458, y: 252 },
    p3: { x: 520, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.8,
    line: { p0: { x: 469, y: -12 }, c1: { x: 405, y: 270 }, c2: { x: 312, y: 558 }, p1: { x: 314, y: 912 } },
  },
]

const foldsReact = [
  {
    p0: { x: -33, y: -12 },
    c1: { x: 32, y: 252 },
    c2: { x: 30, y: 540 },
    p1: { x: 51, y: 912 },
    p2: { x: 204, y: 912 },
    c3: { x: 183, y: 540 },
    c4: { x: 183, y: 252 },
    p3: { x: 135, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.7,
    line: { p0: { x: -8, y: -12 }, c1: { x: 32, y: 270 }, c2: { x: 33, y: 558 }, p1: { x: 60, y: 912 } },
  },
  {
    p0: { x: 88, y: -12 },
    c1: { x: 108, y: 252 },
    c2: { x: 238, y: 540 },
    p1: { x: 222, y: 912 },
    p2: { x: 274, y: 912 },
    c3: { x: 290, y: 540 },
    c4: { x: 164, y: 252 },
    p3: { x: 150, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.8,
  },
  {
    p0: { x: 212, y: -12 },
    c1: { x: 292, y: 252 },
    c2: { x: 388, y: 540 },
    p1: { x: 397, y: 912 },
    p2: { x: 482, y: 912 },
    c3: { x: 473, y: 540 },
    c4: { x: 425, y: 252 },
    p3: { x: 360, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.5,
    line: { p0: { x: 235, y: -12 }, c1: { x: 292, y: 270 }, c2: { x: 390, y: 558 }, p1: { x: 405, y: 912 } },
  },
  {
    p0: { x: 340, y: -12 },
    c1: { x: 462, y: 252 },
    c2: { x: 552, y: 540 },
    p1: { x: 576, y: 912 },
    p2: { x: 694, y: 912 },
    c3: { x: 670, y: 540 },
    c4: { x: 612, y: 252 },
    p3: { x: 507, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.3,
  },
  {
    p0: { x: 469, y: -12 },
    c1: { x: 603, y: 252 },
    c2: { x: 734, y: 540 },
    p1: { x: 754, y: 912 },
    p2: { x: 870, y: 912 },
    c3: { x: 850, y: 540 },
    c4: { x: 717, y: 252 },
    p3: { x: 596, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.7,
    line: { p0: { x: 488, y: -12 }, c1: { x: 603, y: 270 }, c2: { x: 737, y: 558 }, p1: { x: 761, y: 912 } },
  },
]

const foldsStores = [
  {
    p0: { x: -20, y: -12 },
    c1: { x: -71, y: 252 },
    c2: { x: -77, y: 540 },
    p1: { x: -92, y: 912 },
    p2: { x: -35, y: 912 },
    c3: { x: -20, y: 540 },
    c4: { x: 1, y: 252 },
    p3: { x: 60, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.7,
    line: { p0: { x: -8, y: -12 }, c1: { x: -71, y: 270 }, c2: { x: -80, y: 558 }, p1: { x: -88, y: 912 } },
  },
  {
    p0: { x: 65, y: -12 },
    c1: { x: 48, y: 252 },
    c2: { x: -44, y: 540 },
    p1: { x: -34, y: 912 },
    p2: { x: 41, y: 912 },
    c3: { x: 30, y: 540 },
    c4: { x: 129, y: 252 },
    p3: { x: 155, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.8,
  },
  {
    p0: { x: 136, y: -12 },
    c1: { x: 70, y: 252 },
    c2: { x: 24, y: 540 },
    p1: { x: 10, y: 912 },
    p2: { x: 57, y: 912 },
    c3: { x: 70, y: 540 },
    c4: { x: 112, y: 252 },
    p3: { x: 184, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.5,
    line: { p0: { x: 144, y: -12 }, c1: { x: 70, y: 270 }, c2: { x: 22, y: 558 }, p1: { x: 13, y: 912 } },
  },
  {
    p0: { x: 199, y: -12 },
    c1: { x: 119, y: 252 },
    c2: { x: 62, y: 540 },
    p1: { x: 46, y: 912 },
    p2: { x: 134, y: 912 },
    c3: { x: 150, y: 540 },
    c4: { x: 198, y: 252 },
    p3: { x: 287, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.8,
  },
  {
    p0: { x: 280, y: -12 },
    c1: { x: 257, y: 252 },
    c2: { x: 76, y: 540 },
    p1: { x: 100, y: 912 },
    p2: { x: 175, y: 912 },
    c3: { x: 151, y: 540 },
    c4: { x: 337, y: 252 },
    p3: { x: 368, y: -12 },
    highlight: 0.38,
    shadow1: 0.25,
    shadow2: 0.43,
    alpha: 0.8,
    line: { p0: { x: 294, y: -12 }, c1: { x: 257, y: 270 }, c2: { x: 80, y: 558 }, p1: { x: 105, y: 912 } },
  },
  {
    p0: { x: 356, y: -12 },
    c1: { x: 317, y: 252 },
    c2: { x: 129, y: 540 },
    p1: { x: 149, y: 912 },
    p2: { x: 205, y: 912 },
    c3: { x: 185, y: 540 },
    c4: { x: 372, y: 252 },
    p3: { x: 417, y: -12 },
    highlight: 0.26,
    shadow1: 0.32,
    shadow2: 0.52,
    alpha: 0.6,
  },
  {
    p0: { x: 424, y: -12 },
    c1: { x: 316, y: 252 },
    c2: { x: 206, y: 540 },
    p1: { x: 190, y: 912 },
    p2: { x: 237, y: 912 },
    c3: { x: 253, y: 540 },
    c4: { x: 360, y: 252 },
    p3: { x: 473, y: -12 },
    highlight: 0.5,
    shadow1: 0.18,
    shadow2: 0.34,
    alpha: 0.5,
    line: { p0: { x: 431, y: -12 }, c1: { x: 316, y: 270 }, c2: { x: 203, y: 558 }, p1: { x: 192, y: 912 } },
  },
]

// Write build images
const rootImagesDir = '/Users/jesusmpc/inditex/docouture/code/packages/example/src/modules/ROOT/images'
const buildImagesDir = '/Users/jesusmpc/inditex/docouture/code/packages/example/src/modules/main/images/build'

fs.mkdirSync(buildImagesDir, { recursive: true })

fs.writeFileSync(path.join(buildImagesDir, 'abstract-nodes.png'), generateNodesArtwork())
fs.writeFileSync(path.join(buildImagesDir, 'abstract-plugins.png'), generatePluginsArtwork())
fs.writeFileSync(path.join(buildImagesDir, 'abstract-actions.png'), generateActionsArtwork())
fs.writeFileSync(path.join(buildImagesDir, 'abstract-stores.png'), generateStoresArtwork())

// Write home PNG images
fs.writeFileSync(
  path.join(rootImagesDir, 'cloth-quickstart.png'),
  generateHomeCloth('quickstart', ['#f4f1ee', '#d9d2ca', '#a89e93'], foldsQS)
)
fs.writeFileSync(
  path.join(rootImagesDir, 'cloth-sdk.png'),
  generateHomeCloth('sdk', ['#eff1f3', '#c9d0d7', '#959fa9'], foldsSDK)
)
fs.writeFileSync(
  path.join(rootImagesDir, 'cloth-react.png'),
  generateHomeCloth('react', ['#f6f2ea', '#ded3bf', '#b3a58c'], foldsReact)
)
fs.writeFileSync(
  path.join(rootImagesDir, 'cloth-stores.png'),
  generateHomeCloth('stores', ['#eeeff1', '#c5c9cf', '#8f959e'], foldsStores)
)

console.log('Generated all 8 PNG images successfully!')
