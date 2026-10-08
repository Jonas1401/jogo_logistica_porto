// ============================================================
// SIMULAÇÃO — NAVIO + GUINDASTE + FUNIL
// O caminhão é conduzido pelo cursor (ver truck.ts)
// ============================================================
import {
  BED_MAX,
  BITE,
  CRANE,
  HOLDS,
  HOPPER,
  ROUTE_IN,
  SHIP_CARGO,
  clamp,
  holdSurfaceY,
  lerp,
  tri,
  GRAB_TINE,
} from './config'
import { Truck, type Vec } from './truck'
import { Stage1, type GameState } from './mission'

export type { Vec }
export { Truck }

// ============================================================
// EIXO COM PERFIL TRAPEZOIDAL
// ============================================================
export class Axis {
  vel = 0
  constructor(
    public pos: number,
    public vmax: number,
    public acc: number
  ) {}

  move(target: number, dt: number, wrap = false): boolean {
    const d = wrap ? angWrap(target, this.pos) : target - this.pos
    if (Math.abs(d) < 1e-4) {
      this.vel = 0
      return true
    }
    const vDes = Math.sign(d) * Math.min(this.vmax, Math.sqrt(2 * this.acc * Math.abs(d)))
    this.vel += clamp(vDes - this.vel, -this.acc * dt, this.acc * dt)
    const step = this.vel * dt
    if (Math.abs(step) >= Math.abs(d)) {
      this.pos = wrap ? this.pos + d : target
      this.vel = 0
      return true
    }
    this.pos += step
    return false
  }
}

function angWrap(a: number, b: number) {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

// ============================================================
// PARTÍCULAS DE CARGA
// ============================================================
export interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  floor: number
  r: number
  /** Vida restante em quadros (usada pela retirada de excesso). */
  life?: number
}

// ============================================================
// GUINDASTE
// ============================================================
export enum GrabPhase {
  WAIT,
  TO_SHIP,
  LOWER,
  CLOSE,
  RAISE,
  TO_HOPPER,
  LOWER_H,
  OPEN,
  RAISE_H,
}

const PHASE_LABEL = [
  'Aguardando',
  'Giro → navio',
  'Descendo no porão',
  'Fechando garras',
  'Içando carga',
  'Giro → funil',
  'Descendo ao funil',
  'Descarregando',
  'Retornando',
]

export class CraneSim {
  slew = new Axis(Math.atan2(HOPPER.z - CRANE.z, HOPPER.x - CRANE.x), 0.026, 0.0009)
  luff = new Axis(Math.hypot(HOPPER.x - CRANE.x, HOPPER.z - CRANE.z), 2.6, 0.07)
  hoist = new Axis(CRANE.carryY, 8, 0.35)
  open = 1
  phase = GrabPhase.WAIT
  tx = HOPPER.x
  tz = HOPPER.z
  hold = 1
  carryInit = 0
  swayX = 0
  swayZ = 0
  private px = 0
  private pz = 0
  private first = true

  get theta() {
    return this.slew.pos
  }
  get reach() {
    return this.luff.pos
  }
  get tipX() {
    return CRANE.x + Math.cos(this.slew.pos) * this.luff.pos
  }
  get tipZ() {
    return CRANE.z + Math.sin(this.slew.pos) * this.luff.pos
  }
  get gx() {
    return this.tipX + this.swayX
  }
  get gz() {
    return this.tipZ + this.swayZ
  }
  get gy() {
    return this.hoist.pos
  }
  get load() {
    return this.carryInit * (1 - this.open)
  }
  label() {
    return PHASE_LABEL[this.phase]
  }

  setTarget(x: number, z: number) {
    const dx = x - CRANE.x
    const dz = z - CRANE.z
    const d = Math.hypot(dx, dz) || 1
    const r = clamp(d, CRANE.rMin, CRANE.rMax)
    this.tx = CRANE.x + (dx / d) * r
    this.tz = CRANE.z + (dz / d) * r
  }

  slewTo(dt: number): boolean {
    const dx = this.tx - CRANE.x
    const dz = this.tz - CRANE.z
    const a = this.slew.move(Math.atan2(dz, dx), dt, true)
    const b = this.luff.move(Math.hypot(dx, dz), dt)
    return a && b
  }

  updateSway(dt: number) {
    const x = this.tipX
    const z = this.tipZ
    if (this.first) {
      this.px = x
      this.pz = z
      this.first = false
    }
    const vx = (x - this.px) / Math.max(dt, 1e-3)
    const vz = (z - this.pz) / Math.max(dt, 1e-3)
    this.px = x
    this.pz = z
    const k = 1 - Math.exp(-0.06 * dt)
    this.swayX += (clamp(-vx * 3.2, -11, 11) - this.swayX) * k
    this.swayZ += (clamp(-vz * 3.2, -11, 11) - this.swayZ) * k
  }
}

// ============================================================
// ESTATÍSTICAS
// ============================================================
export interface PortStats {
  trucksLoaded: number
  tonsDelivered: number
  hopperFill: number
  hopperCap: number
  shipCargo: number
  shipCargoMax: number
  holds: number[]
  shipsServed: number
  shipName: string
  shipPhase: string
  cranePhase: string
  grabs: number
  current: { id: number; state: string; load: number; phi: number; bed: number; speed: number }
  events: string[]
}

// ============================================================
// SIMULAÇÃO
// ============================================================
type ShipPhase = 'docked' | 'leaving' | 'arriving'

export class PortSim {
  /** Caminhão do jogador (5 eixos). */
  truck = new Truck(ROUTE_IN[0][0], ROUTE_IN[0][1], Math.PI)
  /** Etapa 1 — operação no porto (conduz todos os veículos). */
  game!: Stage1
  crane = new CraneSim()
  particles: Particle[] = []
  holds: number[] = HOLDS.map((h) => h.init)
  hopperFill = 40
  shipPhase: ShipPhase = 'docked'
  shipAxis = new Axis(0, 6.5, 0.03)
  shipNo = 1
  shipsServed = 0
  trucksLoaded = 0
  tonsDelivered = 0
  grabs = 0
  time = 0
  events: string[] = []
  gateOpen = false
  streamY = 28
  underHopper = false
  dumpHeld = false
  dumpLock = false
  private wasFull = false
  private dumpedThisRaise = 0

  constructor() {
    this.game = new Stage1(this)
    this.log('Terminal liberado — Etapa 1: carregamento no porto')
  }

  get shipOffset() {
    return this.shipAxis.pos
  }
  get shipCargo() {
    return this.holds[0] + this.holds[1]
  }
  get shipName() {
    return `MV ATLÂNTICO ${this.shipNo}`
  }

  /** Todos os veículos do pátio (para desenho com ordenação por profundidade). */
  get trucks(): Truck[] {
    return [...this.game.npcTrucks, this.truck]
  }
  /** Câmera (controlada pela missão). */
  get cam() {
    return this.game.cam
  }
  get scaleInPos() {
    return this.game.scaleInPos
  }
  get scaleInSlab() {
    return this.game.scaleInSlab
  }
  get scaleOutPos() {
    return this.game.scaleOutPos
  }
  get scaleOutSlab() {
    return this.game.scaleOutSlab
  }

  log(msg: string) {
    const t = Math.floor(this.time / 60)
    const mm = String(Math.floor(t / 60)).padStart(2, '0')
    const ss = String(t % 60).padStart(2, '0')
    this.events.unshift(`[${mm}:${ss}] ${msg}`)
    if (this.events.length > 7) this.events.pop()
  }

  setDumpHeld(v: boolean) {
    this.dumpHeld = v
  }
  toggleDump() {
    this.dumpLock = !this.dumpLock
  }

  update(dt: number) {
    this.time += dt
    this.truck.dumping = this.dumpHeld || this.dumpLock
    // a missão decide quem despeja e quem retira
    this.gateOpen = false
    this.underHopper = false
    this.game.update(dt)
    this.updateDump(dt)
    this.updateCrane(dt)
    this.updateShip(dt)
    this.updateParticles(dt)
  }

  // ---------------- funil → caçamba ----------------
  /**
   * Despeja produto do funil na caçamba (chamado pela Etapa 1).
   * Devolve a quantidade transferida, em toneladas.
   */
  pour(truck: Truck, rate: number, dt: number): number {
    if (this.hopperFill <= 0.01 || truck.load >= BED_MAX) return 0
    const flow = Math.min(rate * dt, this.hopperFill, BED_MAX - truck.load)
    truck.load = Math.min(BED_MAX, truck.load + flow)
    this.hopperFill -= flow
    this.gateOpen = true
    this.underHopper = true
    this.streamY = 22 + (4 + 16 * (truck.load / BED_MAX))
    for (let k = 0; k < 2; k++) {
      this.particles.push({
        x: HOPPER.x + tri() * 4,
        y: HOPPER.spoutY,
        z: HOPPER.z + tri() * 4,
        vx: tri() * 0.15,
        vy: -(0.8 + Math.random()),
        vz: tri() * 0.15,
        floor: this.streamY + Math.random() * 2,
        r: 1.3 + Math.random() * 1.4,
      })
    }
    if (truck === this.truck && truck.load >= BED_MAX - 1e-3 && !this.wasFull) {
      this.wasFull = true
      this.log(`Caçamba na capacidade máxima (${BED_MAX} t)`)
    } else if (truck.load < BED_MAX * 0.5) {
      this.wasFull = false
    }
    return flow
  }

  // ---------------- retirada de excesso ----------------
  /** Partículas da sucção: caçamba → bocal da máquina. */
  suck(truck: Truck, amount: number, dt: number): void {
    const n = this.game.machinePose.nozzle
    const q = clamp(Math.round((amount / Math.max(dt, 1e-3)) * 60), 1, 4)
    for (let k = 0; k < q; k++) {
      const a = truck.bedPoint(-30 - Math.random() * 78, (Math.random() - 0.5) * 22, 20 + Math.random() * 12)
      this.particles.push({
        x: a.x,
        y: a.y,
        z: a.z,
        vx: (n.x - a.x) * 0.05 + tri() * 0.25,
        vy: 1.5 + Math.random() * 0.8,
        vz: (n.z - a.z) * 0.05 + tri() * 0.25,
        floor: -99999,
        r: 1.1 + Math.random() * 1.1,
        life: 22 + Math.random() * 10,
      })
    }
  }

  // ---------------- basculante ----------------
  private updateDump(dt: number) {
    const t = this.truck
    if (t.bed > 0.18 && t.load > 0.02) {
      const dumped = Math.min(t.load, 0.14 * dt * t.bed)
      t.load -= dumped
      this.tonsDelivered += dumped
      this.dumpedThisRaise += dumped
      const gate = t.gatePoint(0, 22)
      const back = t.trailerHeading
      for (let k = 0; k < 3; k++) {
        this.particles.push({
          x: gate.x + tri() * 5,
          y: gate.y,
          z: gate.z + tri() * 5,
          vx: -Math.cos(back) * (0.7 + Math.random() * 0.8) + tri() * 0.25,
          vy: 0.15 + Math.random() * 0.35,
          vz: -Math.sin(back) * (0.7 + Math.random() * 0.8) + tri() * 0.25,
          floor: 1.2,
          r: 1.3 + Math.random() * 1.5,
        })
      }
    }
    if (t.bed < 0.05 && this.dumpedThisRaise > 8) {
      this.trucksLoaded++
      this.log(`Basculou ${this.dumpedThisRaise.toFixed(0)} t`)
      this.dumpedThisRaise = 0
    }
  }

  hopperSurfaceY() {
    return lerp(86, 123, clamp(this.hopperFill / HOPPER.cap, 0, 1))
  }

  private chooseHold() {
    const [a, b] = this.holds
    if (a > b + 1) return 0
    if (b > a + 1) return 1
    return Math.random() < 0.5 ? 0 : 1
  }

  private updateCrane(dt: number) {
    const c = this.crane
    c.updateSway(dt)

    switch (c.phase) {
      case GrabPhase.WAIT:
        c.open = Math.min(1, c.open + 0.05 * dt)
        c.hoist.move(CRANE.carryY, dt)
        if (this.shipPhase === 'docked' && this.shipCargo > 0.5 && this.hopperFill < HOPPER.cap - BITE) {
          c.hold = this.chooseHold()
          const h = HOLDS[c.hold]
          c.setTarget(h.cx + tri() * h.hl * 0.6, h.cz + tri() * h.hw * 0.5)
          c.phase = GrabPhase.TO_SHIP
        }
        break

      case GrabPhase.TO_SHIP:
        c.hoist.move(CRANE.carryY, dt)
        if (c.slewTo(dt)) c.phase = GrabPhase.LOWER
        break

      case GrabPhase.LOWER: {
        const h = HOLDS[c.hold]
        const surf = holdSurfaceY(h, this.holds[c.hold], c.tx, c.tz)
        const target = surf + 14 + GRAB_TINE * Math.cos(58 * (Math.PI / 180))
        if (c.hoist.move(target, dt)) {
          c.carryInit = Math.min(BITE, this.holds[c.hold])
          c.phase = GrabPhase.CLOSE
        }
        break
      }

      case GrabPhase.CLOSE: {
        const before = c.open
        c.open = Math.max(0, c.open - 0.032 * dt)
        this.holds[c.hold] = Math.max(0, this.holds[c.hold] - (before - c.open) * c.carryInit)
        if (c.open <= 0) c.phase = GrabPhase.RAISE
        break
      }

      case GrabPhase.RAISE:
        if (c.hoist.move(CRANE.carryY, dt)) {
          c.setTarget(HOPPER.x, HOPPER.z)
          c.phase = GrabPhase.TO_HOPPER
        }
        break

      case GrabPhase.TO_HOPPER:
        if (c.slewTo(dt)) c.phase = GrabPhase.LOWER_H
        break

      case GrabPhase.LOWER_H:
        if (c.hoist.move(HOPPER.rimY + 52, dt)) c.phase = GrabPhase.OPEN
        break

      case GrabPhase.OPEN: {
        const before = c.open
        c.open = Math.min(1, c.open + 0.04 * dt)
        const released = (c.open - before) * c.carryInit
        this.hopperFill = Math.min(HOPPER.cap, this.hopperFill + released)
        if (c.open > 0.12) {
          for (let k = 0; k < 4; k++) {
            this.particles.push({
              x: c.gx + tri() * 22 * c.open,
              y: c.gy - 30,
              z: c.gz + tri() * 22 * c.open,
              vx: tri() * 0.5,
              vy: -Math.random() * 1.2,
              vz: tri() * 0.5,
              floor: this.hopperSurfaceY() + Math.random() * 6,
              r: 1.3 + Math.random() * 1.6,
            })
          }
        }
        if (c.open >= 1) {
          c.carryInit = 0
          this.grabs++
          c.phase = GrabPhase.RAISE_H
        }
        break
      }

      case GrabPhase.RAISE_H:
        if (c.hoist.move(CRANE.carryY, dt)) c.phase = GrabPhase.WAIT
        break
    }
  }

  private updateShip(dt: number) {
    const a = this.shipAxis
    switch (this.shipPhase) {
      case 'docked':
        if (this.shipCargo <= 0.5 && this.crane.phase === GrabPhase.WAIT) {
          this.shipPhase = 'leaving'
          this.log(`${this.shipName} descarregado — desatracando`)
        }
        break
      case 'leaving':
        a.move(1600, dt)
        if (a.pos > 1300) {
          this.shipsServed++
          this.shipNo++
          this.holds = HOLDS.map((h) => h.init)
          a.pos = -1500
          a.vel = 0
          this.shipPhase = 'arriving'
          this.log(`${this.shipName} chegando ao berço`)
        }
        break
      case 'arriving':
        if (a.move(0, dt)) {
          this.shipPhase = 'docked'
          this.log(`${this.shipName} atracado — operação iniciada`)
        }
        break
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.vy -= 0.22 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.life !== undefined) p.life -= dt
    }
    this.particles = this.particles.filter(
      (p) => p.y > p.floor && (p.life === undefined || p.life > 0)
    )
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400)
  }

  /** Estado da Etapa 1 para a interface do jogo. */
  gameState(): GameState {
    return this.game.gameState()
  }

  stats(): PortStats {
    const t = this.truck
    const state = this.game.msgFor()
    const phase =
      this.shipPhase === 'docked' ? 'Atracado' : this.shipPhase === 'leaving' ? 'Desatracando' : 'Atracando'
    return {
      trucksLoaded: this.trucksLoaded,
      tonsDelivered: Math.round(this.tonsDelivered),
      hopperFill: this.hopperFill,
      hopperCap: HOPPER.cap,
      shipCargo: this.shipCargo,
      shipCargoMax: SHIP_CARGO,
      holds: [...this.holds],
      shipsServed: this.shipsServed,
      shipName: this.shipName,
      shipPhase: phase,
      cranePhase: this.crane.label(),
      grabs: this.grabs,
      current: {
        id: t.id,
        state,
        load: t.load,
        phi: (t.phi * 180) / Math.PI,
        bed: t.bed,
        speed: t.speed,
      },
      events: [...this.events],
    }
  }
}
