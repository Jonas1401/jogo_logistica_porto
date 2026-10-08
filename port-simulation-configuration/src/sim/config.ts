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
export const TRK = { L1: 52, C1: 6, L2: 100, CENTER: 58, CAP: 46 }

// ============================================================
// ETAPA 1 — OPERAÇÃO NO PORTO (carregamento do caminhão)
// As coordenadas (x, y) abaixo seguem o mesmo padrão do caminhão:
// x = eixo X do mundo · y = eixo Z do mundo (pátio)
// ============================================================

/** Tara (peso vazio) do cavalo + carreta basculante 5 eixos (t). */
export const TARA = 15
/** Limite legal de carga por viagem (t). */
export const LIMIT = 41.5
/** Capacidade física da caçamba (t) — acima do limite, para o excesso existir. */
export const BED_MAX = 46
/** Vazão do funil (t por quadro). */
export const LOAD_RATE = 0.056
/** Vazão da máquina de retirada de excesso (t por quadro). */
export const UNLOAD_RATE = 0.032
/** Quadros que o sistema leva para cortar o fluxo após passar do limite. */
export const OVER_GRACE = 42
/** Espaçamento entre caminhões na fila (comprimento do veículo + folga). */
export const QUEUE_GAP = 230

/** Rota de entrada: portão → balança de entrada → fila → funil (sentido −X). */
export const ROUTE_IN: [number, number][] = [
  [1180, 330],
  [940, 330],
  [660, 330],
  [492, 328],
  [440, 322],
  [390, 308],
  [340, 288],
  [292, 258],
  [248, 222],
  [210, 186],
  [178, 158],
  [150, 143],
  [78, 140],
]

/** Rota de saída: funil → retirada de excesso → balança de saída → portão. */
export const ROUTE_OUT: [number, number][] = [
  [78, 140],
  [-40, 140],
  [-160, 140],
  [-250, 140],
  [-340, 140],
  [-500, 140],
  [-760, 140],
]

/** Pontos fixos do pátio. */
export const SPOT = {
  /** Portão de entrada (fora da tela). */
  spawn: { x: 1180, y: 330 },
  /** Área de retirada de excesso (posição do cavalo). */
  excess: { x: -160, y: 140 },
  /** Balança de saída (posição do cavalo). */
  scaleOut: { x: -300, y: 140 },
}

/** Máquina de retirada de excesso: posição de repouso e de trabalho. */
export const MACHINE_PARK = { x: -230, y: 300 }
export const MACHINE_WORK = { x: 30, y: 140 }

// ---------------- Foco da câmera (coordenadas projetadas) ----------------
export const FOCUS = { x0: -440, y0: -500, x1: 500, y1: 230 }
