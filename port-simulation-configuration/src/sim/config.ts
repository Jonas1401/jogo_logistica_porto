// ============================================================
// CONFIGURAÇÃO DO MUNDO 3D
// Eixos: X = ao longo do cais (comprimento do navio, proa em +X)
//        Y = altura
//        Z = em direção ao observador (terra). Água em Z < 0.
// Os caminhões simulam no plano (X, Z): Truck.x -> X, Truck.y -> Z
// ============================================================

export const DEG = Math.PI / 180

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
export const tri = () => Math.random() + Math.random() - 1

// ---------------- Níveis ----------------
export const WATER_Y = -35
export const DECK_Y = 45
export const COAMING_Y = DECK_Y + 14
export const HOLD_FLOOR = DECK_Y - 40

// ---------------- Navio ----------------
export const SHIP = { x0: -380, x1: 380, hb: 70, zc: -79 }

export interface HoldDef {
  cx: number
  cz: number
  hl: number
  hw: number
  cap: number
  init: number
}

export const HOLDS: HoldDef[] = [
  { cx: -150, cz: SHIP.zc, hl: 78, hw: 50, cap: 800, init: 600 },
  { cx: 130, cz: SHIP.zc, hl: 112, hw: 50, cap: 1200, init: 1200 },
]

export const SHIP_CARGO = HOLDS.reduce((s, h) => s + h.init, 0)

// forma do monte (cone achatado) — usada pela simulação e pelo desenho
export const HEAP_PEAK = 110
export const heapShape = (d: number) => Math.pow(Math.max(0, 1 - d), 1.1)

export function holdHeap(h: HoldDef, cargo: number) {
  const f = clamp(cargo / h.cap, 0, 1)
  const sc = 0.35 + 0.65 * Math.sqrt(f)
  return { f, H: HEAP_PEAK * Math.pow(f, 0.7), rx: h.hl * 1.15 * sc, rz: h.hw * 1.5 * sc }
}

export function holdSurfaceY(h: HoldDef, cargo: number, x: number, z: number) {
  const { f, H, rx, rz } = holdHeap(h, cargo)
  if (f <= 0.002) return HOLD_FLOOR
  const dx = (x - h.cx) / rx
  const dz = (z - h.cz) / rz
  return HOLD_FLOOR + H * heapShape(Math.sqrt(dx * dx + dz * dz))
}

// ---------------- Guindaste portuário ----------------
export const CRANE = {
  x: 10,
  z: 40,
  foot: 18, // pino da lança à frente do eixo
  footY: 168,
  boom: 300,
  rMin: 100,
  rMax: 258,
  carryY: 235,
  towerTop: 148,
  houseY: 154,
}
export const BITE = 28 // t por caçamba
export const GRAB_TINE = 40

// ---------------- Funil ----------------
export const HOPPER = {
  x: 130,
  z: 140,
  hx: 58,
  hz: 52,
  rimY: 125,
  collarY: 112,
  coneY: 78,
  spoutY: 62,
  cap: 60,
}

// ---------------- Caminhão ----------------
export const TRK = { L1: 52, C1: 6, L2: 100, CENTER: 58, CAP: 32 }

// ---------------- Foco da câmera (coordenadas projetadas) ----------------
export const FOCUS = { x0: -440, y0: -500, x1: 500, y1: 230 }
