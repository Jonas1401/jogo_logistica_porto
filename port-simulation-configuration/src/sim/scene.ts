// ============================================================
// RENDERIZADOR — cena 3/4 em wireframe holográfico azul
// ============================================================
import type { PortSim } from './port'
import { BED, C1, CAP, HEAD, L1, L2, Truck } from './truck'
import {
  COAMING_Y,
  CRANE,
  DECK_Y,
  DEG,
  FOCUS,
  GRAB_TINE,
  HOLDS,
  HOLD_FLOOR,
  HOPPER,
  SHIP,
  WATER_Y,
  angDiff,
  clamp,
  heapShape,
  holdHeap,
  lerp,
  smooth,
  type HoldDef,
} from './config'
import {
  LINE,
  LINE_HI,
  Wire,
  depthOf,
  fillPoly,
  prism,
  proj,
  railing,
  rectCorners,
  rectXY,
  rectZY,
  ring,
  unprojGround,
  type V3,
} from './gfx'

const SIDE = 'rgba(10,70,170,0.30)'
const TOPF = 'rgba(20,110,230,0.22)'
const BACKF = 'rgba(4,24,80,0.55)'

const lerp3 = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]
const up = (p: V3, h: number): V3 => [p[0], p[1] + h, p[2]]

interface View {
  x0: number
  y0: number
  x1: number
  y1: number
}

// ============================================================
// CAMADA ESTÁTICA EM CACHE (glow caro → desenha 1 vez)
// ============================================================
class Layer {
  canvas = document.createElement('canvas')
  private scale = 0

  constructor(
    private x0: number,
    private y0: number,
    private w: number,
    private h: number,
    private draw: (ctx: CanvasRenderingContext2D) => void
  ) {}

  ensure(scale: number) {
    if (Math.abs(scale - this.scale) < 0.002) return
    this.scale = scale
    this.canvas.width = Math.max(1, Math.ceil(this.w * scale))
    this.canvas.height = Math.max(1, Math.ceil(this.h * scale))
    const c = this.canvas.getContext('2d')!
    c.setTransform(scale, 0, 0, scale, -this.x0 * scale, -this.y0 * scale)
    this.draw(c)
  }

  blit(ctx: CanvasRenderingContext2D) {
    ctx.drawImage(this.canvas, this.x0, this.y0, this.w, this.h)
  }
}

// ============================================================
// NAVIO (camada estática)
// ============================================================
function hbDeck(x: number) {
  const hb = SHIP.hb
  if (x < -300) return hb * (0.88 + 0.12 * smooth(-380, -300, x))
  if (x <= 175) return hb
  const t = clamp((x - 175) / 205, 0, 1)
  return hb * Math.pow(1 - Math.pow(t, 2.3), 0.5)
}

function hbWater(x: number) {
  const hb = SHIP.hb * 0.84
  if (x < -300) return hb * (0.8 + 0.2 * smooth(-372, -300, x))
  if (x <= 150) return hb
  const t = clamp((x - 150) / 190, 0, 1)
  return hb * Math.pow(1 - Math.pow(t, 2.0), 0.55)
}

function drawHoldShell(ctx: CanvasRenderingContext2D, h: HoldDef) {
  const x0 = h.cx - h.hl
  const x1 = h.cx + h.hl
  const z0 = h.cz - h.hw
  const z1 = h.cz + h.hw
  const yT = COAMING_Y
  const yF = HOLD_FLOOR
  const yD = DECK_Y

  fillPoly(ctx, [[x0, yT, z0], [x1, yT, z0], [x1, yT, z1], [x0, yT, z1]], 'rgba(1,8,30,0.96)')
  fillPoly(ctx, [[x0, yT, z0], [x1, yT, z0], [x1, yF, z0], [x0, yF, z0]], 'rgba(6,34,104,0.95)')
  fillPoly(ctx, [[x0, yT, z0], [x0, yT, z1], [x0, yF, z1], [x0, yF, z0]], 'rgba(4,24,80,0.95)')
  fillPoly(ctx, [[x0, yF, z0], [x1, yF, z0], [x1, yF, z1], [x0, yF, z1]], 'rgba(2,12,40,0.97)')
  fillPoly(ctx, [[x0, yD, z1], [x1, yD, z1], [x1, yT, z1], [x0, yT, z1]], 'rgba(20,110,230,0.28)')
  fillPoly(ctx, [[x1, yD, z0], [x1, yD, z1], [x1, yT, z1], [x1, yT, z0]], 'rgba(20,110,230,0.22)')

  const w = new Wire()
  w.poly([[x0, yT, z0], [x1, yT, z0], [x1, yT, z1], [x0, yT, z1]], true)
  const i = 4
  w.poly(
    [[x0 + i, yT, z0 + i], [x1 - i, yT, z0 + i], [x1 - i, yT, z1 - i], [x0 + i, yT, z1 - i]],
    true
  )
  w.poly([[x0, yD, z0], [x1, yD, z0], [x1, yD, z1], [x0, yD, z1]], true)
  for (let x = x0; x <= x1 + 0.1; x += 16) w.seg([x, yD, z1], [x, yT, z1])
  for (let z = z0; z <= z1 + 0.1; z += 16) w.seg([x1, yD, z], [x1, yT, z])
  w.seg([x0, yT, z0], [x0, yF, z0])
  w.seg([x1, yT, z0], [x1, yF, z0])
  w.seg([x0, yT, z1], [x0, yF, z1])
  w.poly([[x0, yF, z0], [x1, yF, z0], [x1, yF, z1], [x0, yF, z1]], true)
  for (const f of [0.33, 0.66]) {
    const y = lerp(yT, yF, f)
    w.seg([x0, y, z0], [x1, y, z0])
    w.seg([x0, y, z0], [x0, y, z1])
  }
  for (let x = x0 + 28; x < x1; x += 28) w.seg([x, yT, z0], [x, yF, z0])
  w.stroke(ctx, LINE, 1.2, 4)

  // pilhas de tampas de escotilha
  const w2 = new Wire()
  for (const side of [-1, 1]) {
    const cx = side < 0 ? x0 - 14 : x1 + 14
    prism(ctx, w2, rectCorners(cx, h.cz, 10, h.hw * 0.9), yD, yD + 12, SIDE, TOPF)
    for (let k = 1; k < 4; k++) {
      const z = h.cz - h.hw * 0.9 + (h.hw * 1.8 * k) / 4
      w2.seg([cx - 10, yD + 12, z], [cx + 10, yD + 12, z])
    }
  }
  w2.stroke(ctx, LINE, 1.2, 3)
}

function drawSuperstructure(ctx: CanvasRenderingContext2D) {
  const Z = SHIP.zc
  const D = DECK_Y
  const w = new Wire()
  const decks = [
    { cx: -314, hl: 52, hw: 58, y0: D, y1: D + 28 },
    { cx: -314, hl: 44, hw: 52, y0: D + 28, y1: D + 54 },
    { cx: -313, hl: 37, hw: 46, y0: D + 54, y1: D + 78 },
    { cx: -312, hl: 36, hw: 62, y0: D + 78, y1: D + 102 },
  ]
  for (const d of decks)
    prism(ctx, w, rectCorners(d.cx, Z, d.hl, d.hw), d.y0, d.y1, SIDE, TOPF)
  prism(ctx, w, rectCorners(-312, Z, 20, 74), D + 82, D + 86, SIDE, TOPF)
  prism(ctx, w, rectCorners(-312, Z, 32, 52), D + 102, D + 108, SIDE, TOPF)
  prism(ctx, w, rectCorners(-318, Z, 20, 26), D + 108, D + 130, SIDE, TOPF)
  prism(ctx, w, rectCorners(-318, Z, 5, 5), D + 130, D + 172, SIDE, TOPF)
  // proa: casa do molinete e mastro de proa
  prism(ctx, w, rectCorners(300, Z, 14, 22), D, D + 16, SIDE, TOPF)
  for (const [bx, bz] of [[330, Z + 34], [330, Z - 34], [262, Z + 58], [262, Z - 58]])
    prism(ctx, w, rectCorners(bx, bz, 3.5, 3.5), D, D + 8, SIDE, TOPF)
  w.seg([362, D, Z], [362, D + 26, Z])
  w.stroke(ctx, LINE, 1.5, 6)

  // janelas
  const ww = new Wire()
  for (let di = 0; di < 3; di++) {
    const d = decks[di]
    const yw = d.y0 + 10
    for (let z = Z - d.hw + 9; z <= Z + d.hw - 12; z += 14)
      rectXY(ww, d.cx + d.hl, z, z + 7, yw, yw + 9)
    for (let x = d.cx - d.hl + 9; x <= d.cx + d.hl - 12; x += 14)
      rectZY(ww, Z + d.hw, x, x + 7, yw, yw + 9)
  }
  const b = decks[3]
  for (let z = Z - b.hw + 5; z <= Z + b.hw - 15; z += 12)
    rectXY(ww, b.cx + b.hl, z, z + 10, b.y0 + 8, b.y0 + 20)
  for (let x = b.cx - b.hl + 5; x <= b.cx + b.hl - 15; x += 12)
    rectZY(ww, Z + b.hw, x, x + 10, b.y0 + 8, b.y0 + 20)
  for (let z = Z - 20; z <= Z + 12; z += 11) rectXY(ww, -318 + 20, z, z + 8, D + 114, D + 124)
  ww.stroke(ctx, LINE_HI, 1, 3, 0.9)

  // guarda-corpos
  const wr = new Wire()
  railing(wr, rectCorners(-314, Z, 52, 58), D + 28, 7, 12)
  railing(wr, rectCorners(-314, Z, 44, 52), D + 54, 7, 12)
  railing(wr, rectCorners(-313, Z, 37, 46), D + 78, 7, 12)
  railing(wr, rectCorners(-312, Z, 20, 74), D + 86, 6, 12)
  railing(wr, rectCorners(-312, Z, 32, 52), D + 108, 7, 12)
  wr.stroke(ctx, LINE, 0.8, 2, 0.8)

  // mastro, antenas e radomes
  const wm = new Wire()
  wm.seg([-318, D + 172, Z], [-318, D + 240, Z])
  wm.seg([-318, D + 158, Z - 26], [-318, D + 158, Z + 26])
  wm.seg([-318, D + 190, Z - 16], [-318, D + 190, Z + 16])
  wm.seg([-318, D + 214, Z - 10], [-318, D + 214, Z + 10])
  wm.seg([-318, D + 176, Z - 18], [-318, D + 176, Z + 18])
  ring(wm, [-318, D + 240, Z], [1, 0, 0], [0, 0, 1], 3, 8)
  for (const sz of [-1, 1]) {
    wm.seg([-336, D + 108, Z + sz * 40], [-336, D + 138, Z + sz * 40])
    ring(wm, [-336, D + 138, Z + sz * 40], [1, 0, 0], [0, 0, 1], 2.5, 8)
    wm.seg([-290, D + 108, Z + sz * 46], [-290, D + 130, Z + sz * 46])
    ring(wm, [-300, D + 108, Z + sz * 24], [1, 0, 0], [0, 0, 1], 8, 12)
    ring(wm, [-300, D + 116, Z + sz * 24], [1, 0, 0], [0, 0, 1], 6, 12)
    ring(wm, [-300, D + 112, Z + sz * 24], [1, 0, 0], [0, 1, 0], 8, 12)
    ring(wm, [-300, D + 112, Z + sz * 24], [0, 0, 1], [0, 1, 0], 8, 12)
  }
  wm.stroke(ctx, LINE_HI, 1.1, 4)
}

function drawShipLayer(ctx: CanvasRenderingContext2D) {
  const zc = SHIP.zc
  const N = 80
  const D: V3[] = []
  const F: V3[] = []
  const Wp: V3[] = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const xd = lerp(SHIP.x0, SHIP.x1, u)
    const xw = lerp(SHIP.x0 + 8, 340, u)
    const hd = hbDeck(xd)
    D.push([xd, DECK_Y, zc + hd])
    F.push([xd, DECK_Y, zc - hd])
    Wp.push([xw, WATER_Y, zc + hbWater(xw)])
  }

  // convés
  fillPoly(ctx, [...D, ...[...F].reverse()], 'rgba(8,52,140,0.5)')

  // casco (lado de BE visível)
  let top = Infinity
  let bot = -Infinity
  for (const p of [...D, ...Wp]) {
    const q = proj(p[0], p[1], p[2])
    top = Math.min(top, q[1])
    bot = Math.max(bot, q[1])
  }
  const g = ctx.createLinearGradient(0, top, 0, bot)
  g.addColorStop(0, 'rgba(12,78,184,0.88)')
  g.addColorStop(0.5, 'rgba(4,36,114,0.92)')
  g.addColorStop(1, 'rgba(2,12,48,0.96)')
  fillPoly(ctx, [...D, ...[...Wp].reverse()], g)

  // painéis do casco
  const wh = new Wire()
  for (const f of [0.3, 0.55, 0.8]) wh.poly(D.map((d, i) => lerp3(d, Wp[i], f)))
  for (let i = 0; i <= N; i += 4) wh.seg(D[i], Wp[i])
  wh.stroke(ctx, LINE, 0.8, 0, 0.5)

  // grade do convés
  const wd = new Wire()
  for (let i = 0; i <= N; i += 5) wd.seg(D[i], F[i])
  for (const t of [-0.5, 0, 0.5])
    wd.poly(D.map((d) => [d[0], DECK_Y, zc + t * (d[2] - zc)] as V3))
  wd.stroke(ctx, LINE, 0.7, 0, 0.3)

  // porões
  for (const h of HOLDS) drawHoldShell(ctx, h)

  drawSuperstructure(ctx)

  // balaustrada do costado
  const wrl = new Wire()
  wrl.poly(D.map((p) => up(p, 9)))
  wrl.poly(D.map((p) => up(p, 4.5)))
  wrl.poly(F.map((p) => up(p, 9)))
  wrl.poly(F.map((p) => up(p, 4.5)))
  for (let i = 0; i <= N; i += 2) {
    wrl.seg(D[i], up(D[i], 9))
    wrl.seg(F[i], up(F[i], 9))
  }
  wrl.seg(up(D[0], 9), up(F[0], 9))
  wrl.stroke(ctx, LINE_HI, 0.9, 3, 0.85)

  // contorno principal + roda de proa
  const we = new Wire()
  we.poly(D)
  we.poly(F)
  we.seg(D[0], F[0])
  we.seg(D[0], Wp[0])
  we.seg(D[N], Wp[N])
  we.stroke(ctx, LINE_HI, 1.7, 7)

  // linha d'água brilhante
  const wl = new Wire()
  wl.poly(Wp)
  wl.stroke(ctx, '#4cc3ff', 2.6, 16, 1)
}

// ============================================================
// GUINDASTE — base, carro com rodas e torre treliçada
// ============================================================
function drawCraneBase(ctx: CanvasRenderingContext2D) {
  const CX = CRANE.x
  const CZ = CRANE.z
  const w = new Wire()
  prism(ctx, w, rectCorners(CX, CZ, 64, 28), 10, 26, SIDE, TOPF)
  prism(ctx, w, rectCorners(CX - 46, CZ + 8, 14, 13), 26, 50, 'rgba(30,130,240,0.32)', TOPF)
  prism(ctx, w, rectCorners(CX + 38, CZ, 20, 20), 26, 42, SIDE, TOPF)
  prism(ctx, w, rectCorners(CX, CZ, 19, 19), CRANE.towerTop, CRANE.houseY, SIDE, TOPF)
  w.stroke(ctx, LINE, 1.5, 6)

  // torre
  const bays = 4
  const y0 = 26
  const y1 = CRANE.towerTop
  const lv = (k: number) => ({ y: lerp(y0, y1, k / bays), h: lerp(24, 15, k / bays) })
  const c = (k: number, sx: number, sz: number): V3 => {
    const l = lv(k)
    return [CX + sx * l.h, l.y, CZ + sz * l.h]
  }
  fillPoly(ctx, [c(0, 1, -1), c(0, 1, 1), c(bays, 1, 1), c(bays, 1, -1)], 'rgba(10,70,170,0.14)')
  fillPoly(ctx, [c(0, -1, 1), c(0, 1, 1), c(bays, 1, 1), c(bays, -1, 1)], 'rgba(10,70,170,0.18)')
  const wt = new Wire()
  for (let k = 0; k <= bays; k++) wt.poly([c(k, 1, 1), c(k, 1, -1), c(k, -1, -1), c(k, -1, 1)], true)
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]])
    wt.poly(Array.from({ length: bays + 1 }, (_, k) => c(k, sx, sz)))
  const faces: [number, number, number, number][] = [
    [1, -1, 1, 1],
    [-1, -1, -1, 1],
    [-1, 1, 1, 1],
    [-1, -1, 1, -1],
  ]
  for (let k = 0; k < bays; k++) {
    for (const [ax, az, bx, bz] of faces) {
      wt.seg(c(k, ax, az), c(k + 1, bx, bz))
      wt.seg(c(k, bx, bz), c(k + 1, ax, az))
    }
  }
  const lm = lv(2)
  railing(wt, rectCorners(CX, CZ, lm.h + 6, lm.h + 6), lm.y, 7, 10)
  wt.poly(rectCorners(CX, CZ, lm.h + 6, lm.h + 6).map((p) => [p[0], lm.y, p[1]] as V3), true)
  wt.stroke(ctx, LINE, 1.1, 4)

  // rodas (duas bogies por lado)
  const wr = new Wire()
  const offs = [-52, -40, -28, -16, 16, 28, 40, 52]
  for (const sz of [-1, 1]) {
    const z = CZ + sz * 33
    for (const ox of offs) {
      ring(wr, [CX + ox, 7, z], [1, 0, 0], [0, 1, 0], 7, 10)
      ring(wr, [CX + ox, 7, z], [1, 0, 0], [0, 1, 0], 3, 6)
    }
    wr.seg([CX - 52, 7, z], [CX - 16, 7, z])
    wr.seg([CX + 16, 7, z], [CX + 52, 7, z])
  }
  for (const ox of offs) wr.seg([CX + ox, 7, CZ - 33], [CX + ox, 7, CZ + 33])
  wr.stroke(ctx, LINE, 1.1, 4)
}

// ============================================================
// FUNIL — estrutura elevada sobre pernas
// ============================================================
const HL = { x: HOPPER.hx - 5, z: HOPPER.hz - 5 }

function hopperBracing(w: Wire, zc: number) {
  const { x, collarY } = HOPPER
  const xl = x - HL.x
  const xr = x + HL.x
  const ys = [0, 40, 80, collarY]
  for (const y of ys.slice(1)) w.seg([xl, y, zc], [xr, y, zc])
  for (let k = 0; k < 3; k++) {
    w.seg([xl, ys[k] + 3, zc], [xr, ys[k + 1], zc])
    w.seg([xr, ys[k] + 3, zc], [xl, ys[k + 1], zc])
  }
}

function drawHopperLegs(ctx: CanvasRenderingContext2D, zc: number) {
  const { x, collarY } = HOPPER
  const w = new Wire()
  for (const sx of [-1, 1]) {
    const lx = x + sx * HL.x
    prism(ctx, w, rectCorners(lx, zc, 3.5, 3.5), 0, collarY, SIDE)
    prism(ctx, w, rectCorners(lx, zc, 8, 8), 0, 3, SIDE, TOPF)
  }
  hopperBracing(w, zc)
  w.stroke(ctx, LINE, 1.3, 5)
}

function drawHopperBack(ctx: CanvasRenderingContext2D) {
  drawHopperLegs(ctx, HOPPER.z - HL.z)
}

function drawHopperFront(ctx: CanvasRenderingContext2D) {
  const { x, z, hx, hz, rimY, collarY, coneY, spoutY } = HOPPER
  drawHopperLegs(ctx, z + HL.z)

  const w = new Wire()
  // travessas laterais (acima da altura dos caminhões)
  for (const sx of [-1, 1]) w.seg([x + sx * HL.x, 85, z - HL.z], [x + sx * HL.x, 85, z + HL.z])

  // colarinho
  prism(ctx, w, rectCorners(x, z, hx, hz), collarY, rimY, SIDE, undefined, BACKF)
  w.poly(rectCorners(x, z, hx - 7, hz - 7).map((p) => [p[0], rimY, p[1]] as V3), true)

  // tronco do funil
  const T = rectCorners(x, z, hx, hz)
  const B = rectCorners(x, z, 16, 16)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    fillPoly(
      ctx,
      [
        [T[i][0], collarY, T[i][1]],
        [T[j][0], collarY, T[j][1]],
        [B[j][0], coneY, B[j][1]],
        [B[i][0], coneY, B[i][1]],
      ],
      'rgba(10,70,170,0.24)'
    )
    w.seg([T[i][0], collarY, T[i][1]], [B[i][0], coneY, B[i][1]])
  }
  for (const f of [0, 0.33, 0.66, 1]) {
    const hxf = lerp(hx, 16, f)
    const hzf = lerp(hz, 16, f)
    w.poly(rectCorners(x, z, hxf, hzf).map((p) => [p[0], lerp(collarY, coneY, f), p[1]] as V3), true)
  }

  // bica
  const B2 = rectCorners(x, z, 10, 10)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    fillPoly(
      ctx,
      [
        [B[i][0], coneY, B[i][1]],
        [B[j][0], coneY, B[j][1]],
        [B2[j][0], spoutY, B2[j][1]],
        [B2[i][0], spoutY, B2[i][1]],
      ],
      'rgba(20,110,230,0.28)'
    )
    w.seg([B[i][0], coneY, B[i][1]], [B2[i][0], spoutY, B2[i][1]])
  }
  w.poly(B2.map((p) => [p[0], spoutY, p[1]] as V3), true)
  prism(ctx, w, rectCorners(x, z, 24, 12), 66, 74, SIDE, TOPF)

  // passarela + guarda-corpo
  w.poly(rectCorners(x, z, hx + 7, hz + 7).map((p) => [p[0], rimY, p[1]] as V3), true)
  railing(w, rectCorners(x, z, hx + 7, hz + 7), rimY, 14, 29)
  w.stroke(ctx, LINE, 1.5, 6)
}

// ============================================================
// RENDERIZADOR
// ============================================================
interface HeapOpts {
  cx: number
  cz: number
  hl: number
  hw: number
  heading: number
  baseY: number
  H: number
  rx: number
  rz: number
  nx: number
  nz: number
  nspeck: number
}

export class Renderer {
  private shipL = new Layer(-410, -400, 880, 490, drawShipLayer)
  private craneL = new Layer(-130, -190, 240, 270, drawCraneBase)
  private hopBackL = new Layer(-60, -120, 260, 280, drawHopperBack)
  private hopFrontL = new Layer(-60, -120, 260, 280, drawHopperFront)
  private specks = new Float32Array(2000)
  s = 1
  tx = 0
  ty = 0

  /** Cursor (px relativos ao canvas, em CSS) → ponto do pátio que o caminhão persegue. */
  screenToGround(localX: number, localY: number, dpr: number): { x: number; y: number } {
    const px = (localX * dpr - this.tx) / this.s
    const py = (localY * dpr - this.ty) / this.s
    const [X, Z] = unprojGround(px, py)
    return { x: X, y: Z }
  }

  constructor() {
    for (let i = 0; i < this.specks.length; i++) this.specks[i] = Math.random() * 2 - 1
  }

  render(sim: PortSim, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const F = FOCUS
    const s = Math.min(cw / (F.x1 - F.x0), ch / (F.y1 - F.y0))
    const tx = cw / 2 - (s * (F.x0 + F.x1)) / 2
    const ty = ch / 2 - (s * (F.y0 + F.y1)) / 2
    this.s = s
    this.tx = tx
    this.ty = ty
    const v: View = { x0: -tx / s, y0: -ty / s, x1: (cw - tx) / s, y1: (ch - ty) / s }

    this.shipL.ensure(s)
    this.craneL.ensure(s)
    this.hopBackL.ensure(s)
    this.hopFrontL.ensure(s)

    ctx.setTransform(s, 0, 0, s, tx, ty)
    this.drawBackground(ctx, sim, v)

    // navio (+ pilhas de carga) com balanço e deslocamento de atracação
    const off = sim.shipOffset
    const bob = Math.sin(sim.time * 0.03) * 1.6
    ctx.save()
    ctx.translate(off, off * 0.13 + bob)
    this.shipL.blit(ctx)
    this.drawPiles(ctx, sim)
    ctx.restore()

    this.craneL.blit(ctx)
    this.hopBackL.blit(ctx)

    const truckDepth = depthOf(sim.truck.x, 12, sim.truck.y)
    const hopDepth = depthOf(HOPPER.x, 40, HOPPER.z + 42)
    const drawRig = () => {
      this.drawTruck(ctx, sim.truck)
      this.drawPursuit(ctx, sim)
    }
    if (truckDepth < hopDepth) drawRig()

    this.hopFrontL.blit(ctx)
    this.drawHopperContent(ctx, sim)
    if (truckDepth >= hopDepth) drawRig()

    this.drawCraneUpper(ctx, sim)
    this.drawParticles(ctx, sim)
  }

  // ---------------------------------------------------------
  // fundo: céu, água, cais, estrada
  // ---------------------------------------------------------
  private drawBackground(ctx: CanvasRenderingContext2D, sim: PortSim, v: View) {
    const g = ctx.createLinearGradient(0, v.y0, 0, v.y1)
    g.addColorStop(0, '#010510')
    g.addColorStop(0.55, '#03101f')
    g.addColorStop(1, '#020a15')
    ctx.fillStyle = g
    ctx.fillRect(v.x0 - 5, v.y0 - 5, v.x1 - v.x0 + 10, v.y1 - v.y0 + 10)

    // água
    const xa = v.x0 - 500
    const xb = v.x1 + 700
    fillPoly(
      ctx,
      [[xa, WATER_Y, 0], [xb, WATER_Y, 0], [xb, WATER_Y, -1200], [xa, WATER_Y, -1200]],
      'rgba(4,40,100,0.20)'
    )
    const bands = [new Wire(), new Wire(), new Wire(), new Wire()]
    for (let k = 1; k <= 24; k++) {
      const z = -k * 22
      const band = bands[Math.floor((k - 1) / 6)]
      const pts: V3[] = []
      for (let x = v.x0 + 0.5 * z - 40; x <= v.x1 + 0.5 * z + 40; x += 16) {
        pts.push([x, WATER_Y + Math.sin(x * 0.04 + sim.time * 0.05 + k) * 1.6, z])
      }
      band.poly(pts)
    }
    const alphas = [0.4, 0.27, 0.17, 0.09]
    bands.forEach((b, i) => b.stroke(ctx, LINE, 0.9, 0, alphas[i]))
    const ws = new Wire()
    for (let x = Math.floor((v.x0 - 300) / 80) * 80; x <= v.x1; x += 80)
      ws.seg([x, WATER_Y, -6], [x, WATER_Y, -520])
    ws.stroke(ctx, LINE, 0.7, 0, 0.06)

    // cais
    fillPoly(
      ctx,
      [[v.x0 - 100, 0, 0], [v.x1 + 700, 0, 0], [v.x1 + 700, 0, 900], [v.x0 - 100, 0, 900]],
      'rgba(5,24,54,0.85)'
    )
    const wg = new Wire()
    for (let z = 40; z <= 480; z += 40)
      wg.seg([v.x0 + 0.5 * z - 60, 0, z], [v.x1 + 0.5 * z + 60, 0, z])
    for (let x = Math.floor((v.x0 - 60) / 80) * 80; x <= v.x1 + 300; x += 80)
      wg.seg([x, 0, 0], [x, 0, 480])
    wg.stroke(ctx, LINE, 0.7, 0, 0.09)

    const we = new Wire()
    we.seg([v.x0 - 60, 0, 0], [v.x1 + 60, 0, 0])
    we.stroke(ctx, LINE_HI, 2, 9)
    const wk = new Wire()
    wk.seg([v.x0 - 60, 0, 8], [v.x1 + 60, 0, 8])
    for (let x = Math.floor((v.x0 - 60) / 120) * 120; x <= v.x1 + 60; x += 120)
      ring(wk, [x, 0, 16], [1, 0, 0], [0, 0, 1], 4, 8)
    wk.stroke(ctx, LINE, 1, 2, 0.55)

    // trilhos do guindaste
    const wr = new Wire()
    for (const dz of [-30, 30]) {
      const z = CRANE.z + dz
      wr.seg([v.x0 + 0.5 * z - 60, 0, z], [v.x1 + 0.5 * z + 60, 0, z])
    }
    wr.stroke(ctx, LINE, 1.1, 3, 0.55)

    this.drawRoad(ctx)
  }

  private groundText(
    ctx: CanvasRenderingContext2D,
    text: string,
    X: number,
    Z: number,
    color = 'rgba(143,220,255,0.7)'
  ) {
    const q = proj(X, 0, Z)
    ctx.save()
    ctx.transform(1, 0.13, -0.5, 0.55, q[0], q[1])
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = color
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  private drawRoad(ctx: CanvasRenderingContext2D) {
    const x0 = -560
    const x1 = 740
    const z0 = 62
    const z1 = 400
    fillPoly(
      ctx,
      [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, 0, z1],
        [x0, 0, z1],
      ],
      'rgba(3,12,28,0.62)'
    )
    const w = new Wire()
    w.poly(
      [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, 0, z1],
        [x0, 0, z1],
      ],
      true
    )
    const z = HOPPER.z
    w.seg([x0, 0, z - 30], [x1, 0, z - 30])
    w.seg([x0, 0, z + 30], [x1, 0, z + 30])
    w.stroke(ctx, LINE, 1.1, 3, 0.55)

    const wc = new Wire()
    wc.seg([x0, 0, z], [x1, 0, z])
    ctx.setLineDash([14, 12])
    wc.stroke(ctx, LINE_HI, 1, 0, 0.35)
    ctx.setLineDash([])

    const { x } = HOPPER
    const wz = new Wire()
    wz.poly(
      [
        [x - 110, 0, z - 36],
        [x + 110, 0, z - 36],
        [x + 110, 0, z + 36],
        [x - 110, 0, z + 36],
      ],
      true
    )
    ctx.setLineDash([6, 5])
    wz.stroke(ctx, LINE_HI, 1.1, 3, 0.6)
    ctx.setLineDash([])
    this.groundText(ctx, 'ZONA DE CARGA — POSICIONE A CAÇAMBA', x - 150, z + 52)
    this.groundText(ctx, 'PÁTIO · O CURSOR CONDUZ O CAMINHÃO', -80, 360)
  }

  // ---------------------------------------------------------
  // monte de granel (malha de altura + brilho granular)
  // ---------------------------------------------------------
  private heap(ctx: CanvasRenderingContext2D, o: HeapOpts) {
    const { nx, nz } = o
    const c = Math.cos(o.heading)
    const s = Math.sin(o.heading)
    const W = nx + 1
    const N = W * (nz + 1)
    const ys = new Float32Array(N)
    const sx = new Float32Array(N)
    const sy = new Float32Array(N)
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const a = -o.hl + (2 * o.hl * i) / nx
        const b = -o.hw + (2 * o.hw * j) / nz
        const d = Math.hypot(a / o.rx, b / o.rz)
        const y = o.baseY + o.H * heapShape(d)
        const q = proj(o.cx + c * a - s * b, y, o.cz + s * a + c * b)
        const k = j * W + i
        ys[k] = y
        sx[k] = q[0]
        sy[k] = q[1]
      }
    }
    const grid = new Path2D()
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k00 = j * W + i
        const k10 = k00 + 1
        const k01 = k00 + W
        const k11 = k01 + 1
        const light = clamp(0.5 + (ys[k00] - ys[k10]) * 0.05 + (ys[k00] - ys[k01]) * 0.035, 0.1, 1)
        const hgt = clamp((ys[k00] + ys[k11]) / 2 - o.baseY, 0, 400) / Math.max(o.H, 1)
        const cc = 0.25 + 0.75 * light
        ctx.fillStyle = `rgba(${(8 + 36 * cc) | 0},${(60 + 130 * cc) | 0},${(150 + 105 * cc) | 0},${(0.5 + 0.25 * hgt).toFixed(2)})`
        ctx.beginPath()
        ctx.moveTo(sx[k00], sy[k00])
        ctx.lineTo(sx[k10], sy[k10])
        ctx.lineTo(sx[k11], sy[k11])
        ctx.lineTo(sx[k01], sy[k01])
        ctx.closePath()
        ctx.fill()
        grid.moveTo(sx[k01], sy[k01])
        grid.lineTo(sx[k00], sy[k00])
        grid.lineTo(sx[k10], sy[k10])
      }
    }
    ctx.save()
    ctx.strokeStyle = 'rgba(140,215,255,0.32)'
    ctx.lineWidth = 0.6
    ctx.stroke(grid)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = '#c9f2ff'
    ctx.globalAlpha = 0.85
    const sp = this.specks
    const cnt = Math.min(o.nspeck, sp.length / 2)
    for (let k = 0; k < cnt; k++) {
      const a = sp[2 * k] * o.hl
      const b = sp[2 * k + 1] * o.hw
      const hh = o.H * heapShape(Math.hypot(a / o.rx, b / o.rz))
      if (hh < 1) continue
      const q = proj(o.cx + c * a - s * b, o.baseY + hh, o.cz + s * a + c * b)
      ctx.fillRect(q[0], q[1], 1.2, 1.2)
    }
    ctx.restore()
  }

  /** Recorta tudo abaixo da aresta próxima de um retângulo (oclusão pela borda). */
  private clipAbove(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, z: number) {
    const A = proj(xa, y, z)
    const B = proj(xb, y, z)
    const e = 90
    ctx.beginPath()
    ctx.moveTo(A[0] - e, A[1] - e * 0.13)
    ctx.lineTo(B[0] + e, B[1] + e * 0.13)
    ctx.lineTo(B[0] + e, B[1] - 1200)
    ctx.lineTo(A[0] - e, A[1] - 1200)
    ctx.closePath()
    ctx.clip()
  }

  private drawPiles(ctx: CanvasRenderingContext2D, sim: PortSim) {
    for (let i = 0; i < HOLDS.length; i++) {
      const h = HOLDS[i]
      const { f, H, rx, rz } = holdHeap(h, sim.holds[i])
      if (f <= 0.004) continue
      ctx.save()
      this.clipAbove(ctx, h.cx - h.hl, h.cx + h.hl, COAMING_Y, h.cz + h.hw)
      this.heap(ctx, {
        cx: h.cx,
        cz: h.cz,
        hl: h.hl,
        hw: h.hw,
        heading: 0,
        baseY: HOLD_FLOOR,
        H,
        rx,
        rz,
        nx: 18,
        nz: 8,
        nspeck: i === 1 ? 900 : 500,
      })
      ctx.restore()
    }
  }

  private drawHopperContent(ctx: CanvasRenderingContext2D, sim: PortSim) {
    const { x, z, hx, hz, rimY, coneY, spoutY } = HOPPER
    const f = clamp(sim.hopperFill / HOPPER.cap, 0, 1)
    if (f > 0.01) {
      const yS = sim.hopperSurfaceY()
      const k = clamp((yS - coneY) / 34, 0, 1)
      const hxs = lerp(16, hx - 6, k)
      const hzs = lerp(16, hz - 6, k)
      ctx.save()
      this.clipAbove(ctx, x - hx + 6, x + hx - 6, rimY, z + hz - 6)
      this.heap(ctx, {
        cx: x,
        cz: z,
        hl: hxs,
        hw: hzs,
        heading: 0,
        baseY: yS,
        H: 4 + 16 * Math.sqrt(f),
        rx: hxs * 0.95,
        rz: hzs * 0.95,
        nx: 10,
        nz: 10,
        nspeck: 140,
      })
      ctx.restore()
    }

    // fluxo de carga + lâmpada da comporta
    if (sim.gateOpen) {
      const a = proj(x, spoutY, z)
      const b = proj(x, sim.streamY, z)
      ctx.save()
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(130,215,255,0.5)'
      ctx.lineWidth = 3.2
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.lineTo(b[0], b[1])
      ctx.stroke()
      ctx.restore()
    }
    const q = proj(x + 14, 70, z + 14)
    ctx.save()
    ctx.fillStyle = sim.gateOpen ? '#2dff9a' : '#ff4d5e'
    ctx.shadowColor = ctx.fillStyle
    ctx.shadowBlur = 8 * ctx.getTransform().a
    ctx.beginPath()
    ctx.arc(q[0], q[1], 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ---------------------------------------------------------
  // cavalo + carreta basculante articulada
  // cada módulo no próprio eixo: cavalo em θ1, carreta no pino-rei em θ2
  // ---------------------------------------------------------
  private drawTruck(ctx: CanvasRenderingContext2D, t: Truck) {
    const chd = Math.cos(t.heading)
    const shd = Math.sin(t.heading)
    const hh = t.hitch
    const th = t.trailerHeading
    const cth = Math.cos(th)
    const sth = Math.sin(th)
    const TP = (a: number, b: number): [number, number] => [
      hh.x + cth * a - sth * b,
      hh.y + sth * a + cth * b,
    ]
    const QP = (a: number, b: number): [number, number] => [
      t.x + chd * a - shd * b,
      t.y + shd * a + chd * b,
    ]
    const V = (p: [number, number], y: number): V3 => [p[0], y, p[1]]
    const B = (a: number, b: number, y: number): V3 => {
      const p = t.bedPoint(a, b, y)
      return [p.x, p.y, p.z]
    }
    const G = (b: number, y: number): V3 => {
      const p = t.gatePoint(b, y)
      return [p.x, p.y, p.z]
    }

    // roda: aro, banda, cubo e raios girando com a distância percorrida
    const wheel = (w: Wire, cx: number, cz: number, roll: number) => {
      const c = Math.cos(roll)
      const s = Math.sin(roll)
      const R = 9
      const ctr: V3 = [cx, R, cz]
      ring(w, ctr, [c, 0, s], [0, 1, 0], R, 12)
      ring(w, ctr, [c, 0, s], [0, 1, 0], 3.4, 7)
      for (let i = 0; i < 5; i++) {
        const a = t.rot + (i * Math.PI * 2) / 5
        const fwd = -Math.sin(a) * (R - 1.5)
        const up = -Math.cos(a) * (R - 1.5)
        w.seg(ctr, [cx + c * fwd, R + up, cz + s * fwd])
      }
    }

    const tractor = () => {
      const w = new Wire()
      prism(ctx, w, [QP(HEAD, 13), QP(HEAD, -13), QP(-20, -13), QP(-20, 13)], 8, 16, SIDE, TOPF)
      prism(
        ctx,
        w,
        [QP(HEAD - 2, 16), QP(HEAD - 2, -16), QP(32, -16), QP(32, 16)],
        16,
        50,
        'rgba(30,130,240,0.36)',
        'rgba(60,160,255,0.28)'
      )
      prism(ctx, w, [QP(46, 14), QP(46, -14), QP(32, -14), QP(32, 14)], 50, 58, SIDE, TOPF)
      w.poly([V(QP(HEAD - 2, -11), 30), V(QP(HEAD - 2, 11), 30), V(QP(HEAD - 2, 11), 44), V(QP(HEAD - 2, -11), 44)], true)
      for (const sb of [-16, 16])
        w.poly([V(QP(64, sb), 30), V(QP(42, sb), 30), V(QP(42, sb), 44), V(QP(64, sb), 44)], true)
      w.seg(V(QP(28, 17), 16), V(QP(28, 17), 64))
      // quinta-roda
      const plate = QP(C1, 0)
      ring(w, [plate[0], 16.5, plate[1]], [chd, 0, shd], [-shd, 0, chd], 11, 14)
      ring(w, [plate[0], 16.5, plate[1]], [chd, 0, shd], [-shd, 0, chd], 4, 8)
      for (const a of [0, -13]) for (const sb of [-20, 20]) {
        const c = QP(a, sb)
        wheel(w, c[0], c[1], t.heading)
      }
      const roll = t.heading + t.steer
      for (const sb of [-20, 20]) {
        const c = QP(L1, sb)
        wheel(w, c[0], c[1], roll)
      }
      // barra de direção
      w.seg(V(QP(L1, -16), 9), V(QP(L1, 16), 9))
      w.stroke(ctx, '#58c4ff', 1.4, 6)

      ctx.save()
      ctx.fillStyle = '#e4f7ff'
      ctx.shadowColor = '#9fe3ff'
      ctx.shadowBlur = 8 * ctx.getTransform().a
      for (const sb of [-11, 11]) {
        const q = proj(...V(QP(HEAD, sb), 22))
        ctx.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3)
      }
      ctx.restore()
    }

    const trailer = () => {
      const w = new Wire()
      // chassi (não bascula): pino-rei, truque tri-eixo
      const frame = [TP(8, 8), TP(8, -8), TP(-132, -8), TP(-132, 8)]
      fillPoly(ctx, frame.map((p) => V(p, 11)), 'rgba(2,14,46,0.92)')
      prism(ctx, w, frame, 9, 16, SIDE, TOPF)
      w.seg([hh.x, 14, hh.y], [hh.x, 19, hh.y])
      ring(w, [hh.x, 18, hh.y], [cth, 0, sth], [-sth, 0, cth], 5, 8)
      for (const a of [-L2 + 14, -L2, -L2 - 14]) {
        w.seg(V(TP(a, -8), 12), V(TP(a, 8), 12))
        for (const sb of [-21, 21]) {
          const c = TP(a, sb)
          wheel(w, c[0], c[1], th)
        }
      }

      // caçamba — gira no fundo da traseira
      const floor = [B(8, 16, 17), B(8, -16, 17), B(BED.hingeA, -16, 17), B(BED.hingeA, 16, 17)]
      fillPoly(ctx, floor, 'rgba(2,16,48,0.94)')
      fillPoly(ctx, [B(8, 16, 17), B(BED.hingeA, 16, 17), B(BED.hingeA, 16, 40), B(8, 16, 40)], 'rgba(12,78,190,0.34)')
      fillPoly(ctx, [B(8, -16, 17), B(8, -16, 40), B(BED.hingeA, -16, 40), B(BED.hingeA, -16, 17)], 'rgba(8,50,140,0.4)')
      fillPoly(ctx, [B(8, 16, 17), B(8, 16, 40), B(8, -16, 40), B(8, -16, 17)], 'rgba(16,90,200,0.32)')
      w.poly([B(8, 16, 17), B(8, -16, 17), B(BED.hingeA, -16, 17), B(BED.hingeA, 16, 17)], true)
      w.poly([B(8, 16, 40), B(8, -16, 40), B(BED.hingeA, -16, 40), B(BED.hingeA, 16, 40)], true)
      for (const sb of [-16, 16]) {
        w.seg(B(8, sb, 17), B(8, sb, 40))
        w.seg(B(8, sb, 40), B(BED.hingeA, sb, 40))
        w.seg(B(BED.hingeA, sb, 17), B(BED.hingeA, sb, 40))
        for (let a = -10; a > BED.hingeA; a -= 22) w.seg(B(a, sb, 17), B(a, sb, 40))
      }
      // tampa traseira articulada no topo
      fillPoly(ctx, [G(15, 38), G(-15, 38), G(-15, 18), G(15, 18)], 'rgba(20,110,230,0.38)')
      w.poly([G(15, 38), G(-15, 38), G(-15, 18), G(15, 18)], true)
      w.seg(G(0, 38), G(0, 18))
      // cilindro hidráulico (duas hastes)
      for (const sb of [-5, 5]) {
        const base = V(TP(-32, sb), 14)
        const top = B(-58, sb, 17)
        w.seg(base, top)
        const mid: V3 = [(base[0] + top[0]) / 2, (base[1] + top[1]) / 2, (base[2] + top[2]) / 2]
        ring(w, mid, [cth, 0, sth], [0, 1, 0], 2.4, 6)
      }
      // pino da articulação da caçamba
      w.seg(B(BED.hingeA, -18, BED.hingeY), B(BED.hingeA, 18, BED.hingeY))

      if (t.load > 0.04) {
        const f = clamp(t.load / CAP, 0, 1)
        const h = 4 + 16 * f
        const a0 = lerp(14, -34, t.bed)
        const a1 = -108
        const hw = 12
        fillPoly(
          ctx,
          [B(a0, hw, 18 + h), B(a0, -hw, 18 + h * 0.8), B(a1, -hw, 18 + h * 0.35), B(a1, hw, 18 + h * 0.5)],
          'rgba(120,205,255,0.62)'
        )
        fillPoly(
          ctx,
          [B(a0, hw, 18), B(a1, hw, 18), B(a1, hw, 18 + h * 0.5), B(a0, hw, 18 + h)],
          'rgba(40,140,230,0.4)'
        )
      }
      w.stroke(ctx, LINE, 1.25, 5)
    }

    const dT = depthOf(...V(QP(30, 0), 20))
    const dR = depthOf(...V(TP(-60, 0), 20))
    if (dT < dR) {
      tractor()
      trailer()
    } else {
      trailer()
      tractor()
    }

    // mangueiras ligando cavalo e carreta + setas de rumo + arco de φ
    const link = new Wire()
    for (const sb of [-7, 7]) {
      const a = V(QP(14, sb), 20)
      const b = V(TP(6, sb), 22)
      const mid: V3 = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 8, (a[2] + b[2]) / 2]
      for (let i = 0; i <= 10; i++) {
        const u = i / 10
        const k = 1 - u
        const p: V3 = [
          k * k * a[0] + 2 * k * u * mid[0] + u * u * b[0],
          k * k * a[1] + 2 * k * u * mid[1] + u * u * b[1],
          k * k * a[2] + 2 * k * u * mid[2] + u * u * b[2],
        ]
        if (i === 0) link.m(p)
        else link.l(p)
      }
    }
    const arrow = (x: number, z: number, ang: number, len: number) => {
      const tip: V3 = [x + Math.cos(ang) * len, 4, z + Math.sin(ang) * len]
      link.seg([x, 4, z], tip)
      link.seg(tip, [tip[0] + Math.cos(ang + 2.55) * 8, 4, tip[2] + Math.sin(ang + 2.55) * 8])
      link.seg(tip, [tip[0] + Math.cos(ang - 2.55) * 8, 4, tip[2] + Math.sin(ang - 2.55) * 8])
    }
    const nose = t.head
    arrow(nose.x, nose.y, t.heading, 26)
    const axle = t.trailerAxle
    arrow(axle.x, axle.y, th, 22)

    const span = angDiff(t.heading, th)
    const hot = Math.abs(t.phi) > 62 * DEG
    for (let i = 0; i <= 9; i++) {
      const a = th + span * (i / 9)
      const p: V3 = [hh.x + Math.cos(a) * 16, 22, hh.y + Math.sin(a) * 16]
      if (i === 0) link.m(p)
      else link.l(p)
    }
    link.stroke(ctx, hot ? '#ff6d88' : LINE_HI, 1.15, hot ? 8 : 3, 0.9)

    const hp = proj(hh.x, 30, hh.y)
    ctx.fillStyle = hot ? '#ff8aa0' : 'rgba(143,220,255,0.9)'
    ctx.font = 'bold 9px monospace'
    ctx.fillText(`φ ${Math.round((t.phi * 180) / Math.PI)}°`, hp[0] + 6, hp[1])
  }

  /** Linha do para-choque até o cursor — o cavalo persegue esse ponto. */
  private drawPursuit(ctx: CanvasRenderingContext2D, sim: PortSim) {
    const head = sim.truck.head
    const g = sim.target
    const w = new Wire()
    w.seg([head.x, 3, head.y], [g.x, 3, g.y])
    ctx.setLineDash([5, 6])
    w.stroke(ctx, '#7dffc3', 1, 0, 0.55)
    ctx.setLineDash([])
    const mark = new Wire()
    ring(mark, [g.x, 2, g.y], [1, 0, 0], [0, 0, 1], 7 + Math.sin(sim.time * 0.15) * 1.5, 12)
    ring(mark, [g.x, 2, g.y], [1, 0, 0], [0, 0, 1], 2.4, 8)
    mark.stroke(ctx, '#7dffc3', 1.2, 7, 0.95)
  }

  // ---------------------------------------------------------
  // guindaste: casa de máquinas giratória, lança treliçada, cabos, garra
  // ---------------------------------------------------------
  private drawCraneUpper(ctx: CanvasRenderingContext2D, sim: PortSim) {
    const c = sim.crane
    const th = c.theta
    const cs = Math.cos(th)
    const sn = Math.sin(th)
    const CX = CRANE.x
    const CZ = CRANE.z
    const P = (a: number, b: number): [number, number] => [CX + cs * a - sn * b, CZ + sn * a + cs * b]
    const box = (a0: number, a1: number, b0: number, b1: number) => {
      const m = P((a0 + a1) / 2, (b0 + b1) / 2)
      return rectCorners(m[0], m[1], (a1 - a0) / 2, (b1 - b0) / 2, th)
    }
    const V = (p: [number, number], y: number): V3 => [p[0], y, p[1]]

    // --- casa de máquinas, contrapeso e cabine ---
    const wh = new Wire()
    const yH = CRANE.houseY
    prism(ctx, wh, box(-34, 18, -19, 19), yH, yH + 22, SIDE, TOPF)
    prism(ctx, wh, box(-60, -34, -16, 16), yH, yH + 18, 'rgba(10,70,170,0.4)', TOPF)
    prism(ctx, wh, box(2, 24, 19, 37), yH + 4, yH + 28, 'rgba(30,130,240,0.36)', TOPF)
    wh.poly(
      [V(P(24, 22), yH + 12), V(P(24, 34), yH + 12), V(P(24, 34), yH + 24), V(P(24, 22), yH + 24)],
      true
    )
    // pórtico em A + estai da lança
    const ap = P(-30, 0)
    const apex: V3 = [ap[0], 222, ap[1]]
    for (const sb of [-14, 14]) wh.seg(V(P(-12, sb), yH + 22), apex)
    wh.stroke(ctx, LINE, 1.4, 6)

    // --- lança ---
    const cosE = clamp((c.reach - CRANE.foot) / CRANE.boom, 0.2, 0.99)
    const E = Math.acos(cosE)
    const sinE = Math.sin(E)
    const dirF: V3 = [cs * cosE, sinE, sn * cosE]
    const upP: V3 = [-cs * sinE, cosE, -sn * sinE]
    const nV: V3 = [-sn, 0, cs]
    const foot: V3 = [CX + cs * CRANE.foot, CRANE.footY, CZ + sn * CRANE.foot]
    const pos = (s: number, u: number, w: number): V3 => [
      foot[0] + dirF[0] * s + upP[0] * u + nV[0] * w,
      foot[1] + dirF[1] * s + upP[1] * u + nV[1] * w,
      foot[2] + dirF[2] * s + upP[2] * u + nV[2] * w,
    ]
    const K = 16
    const L = CRANE.boom
    const corner = (k: number, su: number, sv: number): V3 =>
      pos((L * k) / K, su * lerp(10, 4.5, k / K), sv * lerp(9, 3.5, k / K))

    for (const sv of [-1, 1])
      fillPoly(
        ctx,
        [corner(0, 1, sv), corner(K, 1, sv), corner(K, -1, sv), corner(0, -1, sv)],
        'rgba(30,140,255,0.16)'
      )
    const wb = new Wire()
    const wc = new Wire()
    for (let k = 0; k <= K; k++)
      wb.poly([corner(k, 1, 1), corner(k, 1, -1), corner(k, -1, -1), corner(k, -1, 1)], true)
    for (let k = 0; k < K; k++) {
      const alt = k % 2 ? 1 : -1
      wb.seg(corner(k, alt, 1), corner(k + 1, -alt, 1))
      wb.seg(corner(k, -alt, -1), corner(k + 1, alt, -1))
      wb.seg(corner(k, 1, alt), corner(k + 1, 1, -alt))
      wb.seg(corner(k, -1, -alt), corner(k + 1, -1, alt))
    }
    for (const [su, sv] of [[1, 1], [1, -1], [-1, -1], [-1, 1]])
      wc.seg(corner(0, su, sv), corner(K, su, sv))
    wb.stroke(ctx, LINE, 1.0, 4)
    wc.stroke(ctx, '#5cc8ff', 2, 7)

    // ponta da lança, roldanas, estai
    const tip = pos(L, 0, 0)
    const wt = new Wire()
    ring(wt, tip, dirF, upP, 6, 10)
    ring(wt, pos(L - 10, 0, 0), dirF, upP, 5, 10)
    wt.stroke(ctx, LINE_HI, 1.2, 5)
    const ws = new Wire()
    ws.seg(apex, tip)
    ws.seg(apex, pos(L * 0.55, 0, 0))
    ws.stroke(ctx, LINE, 0.8, 2, 0.6)

    // --- cabos e garra ---
    const gx = c.gx
    const gz = c.gz
    const gy = c.gy
    const wr = new Wire()
    for (const sg of [-1, 1]) {
      const a = pos(L, 0, sg * 3)
      const b: V3 = [gx + nV[0] * sg * 3, gy + 12, gz + nV[2] * sg * 3]
      wr.seg(a, b)
      wr.seg(pos(L, 1, sg * 3.6), [b[0] + nV[0] * sg * 0.8, b[1], b[2] + nV[2] * sg * 0.8])
    }
    wr.stroke(ctx, LINE_HI, 0.9, 3, 0.9)

    const wg = new Wire()
    prism(ctx, wg, rectCorners(gx, gz, 8, 8), gy - 14, gy + 2, SIDE, TOPF)
    prism(ctx, wg, rectCorners(gx, gz, 4, 4), gy + 2, gy + 12, SIDE, TOPF)

    const beta = lerp(-14.5, 58, c.open) * DEG
    const rt = 9 + GRAB_TINE * Math.sin(beta)
    const dy = -GRAB_TINE * Math.cos(beta)
    const y0 = gy - 14
    const tips: V3[] = []
    const order = [0, 1, 2, 3].sort((a, b) => {
      const pa = (45 + 90 * a) * DEG
      const pb = (45 + 90 * b) * DEG
      return Math.cos(pa) * 0.5 + Math.sin(pa) - (Math.cos(pb) * 0.5 + Math.sin(pb))
    })
    const tines: V3[][] = []
    for (const i of order) {
      const phi = (45 + 90 * i) * DEG
      const ux = Math.cos(phi)
      const uz = Math.sin(phi)
      const tx = -uz
      const tz = ux
      const mr = 9 + (rt - 9) * 0.5
      const poly: V3[] = [
        [gx + ux * 9 + tx * 9, y0, gz + uz * 9 + tz * 9],
        [gx + ux * mr + tx * 10, y0 + dy * 0.5, gz + uz * mr + tz * 10],
        [gx + ux * rt + tx * 3, y0 + dy, gz + uz * rt + tz * 3],
        [gx + ux * rt - tx * 3, y0 + dy, gz + uz * rt - tz * 3],
        [gx + ux * mr - tx * 10, y0 + dy * 0.5, gz + uz * mr - tz * 10],
        [gx + ux * 9 - tx * 9, y0, gz + uz * 9 - tz * 9],
      ]
      tines.push(poly)
      tips.push([gx + ux * rt, y0 + dy, gz + uz * rt])
    }
    if (c.load > 1) fillPoly(ctx, tips, 'rgba(120,212,255,0.5)')
    for (const p of tines) {
      fillPoly(ctx, p, 'rgba(30,140,255,0.38)')
      wg.poly(p, true)
      wg.seg(lerp3(p[0], p[5], 0.5), lerp3(p[2], p[3], 0.5))
    }
    wg.stroke(ctx, LINE_HI, 1.3, 6)
  }

  private drawParticles(ctx: CanvasRenderingContext2D, sim: PortSim) {
    ctx.save()
    ctx.fillStyle = '#a8e6ff'
    ctx.globalAlpha = 0.9
    for (const p of sim.particles) {
      const q = proj(p.x, p.y, p.z)
      ctx.fillRect(q[0], q[1], p.r, p.r * 1.3)
    }
    ctx.restore()
  }
}
