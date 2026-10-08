// ============================================================
// ETAPA 1 — OPERAÇÃO NO PORTO
// Entrada → balança de entrada → fila → funil → (excesso → retirada)
// → balança de saída → resumo.
// Toda a movimentação é automática: o jogador só decide sobre o peso.
// ============================================================
import type { PortSim } from './port'
import { Route, type P2 } from './route'
import { Truck } from './truck'
import {
  BED_MAX,
  HOPPER,
  LIMIT,
  LOAD_RATE,
  MACHINE_PARK,
  MACHINE_WORK,
  OVER_GRACE,
  QUEUE_GAP,
  ROUTE_IN,
  ROUTE_OUT,
  SPOT,
  TARA,
  UNLOAD_RATE,
  angDiff,
  clamp,
  lerp,
  smooth,
} from './config'
import { proj } from './gfx'

export type Phase =
  | 'IDLE'
  | 'ENTERING'
  | 'WEIGH_IN'
  | 'QUEUE'
  | 'TO_HOPPER'
  | 'LOADING'
  | 'DECIDE'
  | 'OVERWEIGHT'
  | 'TO_EXCESS'
  | 'REMOVING'
  | 'CORRECTED'
  | 'TO_EXIT'
  | 'WEIGH_OUT'
  | 'SUMMARY'
  | 'NEXT'
  | 'RETURN'
  | 'REQUEUE'

export interface Weighing {
  value: number
  status: 'idle' | 'weighing' | 'done'
  t: number
}

export interface RunResult {
  truck: string
  finalWeight: number
  cargo: number
  removed: number
  time: number
  status: string
  approved: boolean
}

export interface GameState {
  phase: Phase
  msg: string
  hint: string
  tara: number
  load: number
  total: number
  limit: number
  bedMax: number
  over: number
  removed: number
  removedMax: number
  time: number
  queuePos: number
  queueLen: number
  weighIn: Weighing
  weighOut: Weighing
  result: RunResult | null
  progress: number
  overweight: boolean
  removalPaused: boolean
  flash: number
  machineU: number
  boomU: number
  running: boolean
}

interface Bot {
  truck: Truck
  mode: 'queue' | 'load' | 'leave'
  isPlayer: boolean
  /** Peso de carga desejado ao sair do funil. */
  target: number
  /** Quadros parado sem receber produto (anti-travamento). */
  t: number
}

/** Distância da parada em que o caminhão passa a fazer o ajuste fino. */
const SETTLE = 26
/** Erro (em unidades do pátio) considerado "encaixado". */
const EPS = 1.7

const DOWNSTREAM: Phase[] = [
  'TO_EXCESS',
  'REMOVING',
  'CORRECTED',
  'TO_EXIT',
  'WEIGH_OUT',
  'SUMMARY',
  'NEXT',
]

export class Stage1 {
  phase: Phase = 'IDLE'
  /** Quadros decorridos na fase atual. */
  pt = 0

  tara = TARA
  removed = 0
  startTime = 0
  endTime = 0
  excessAtStart = 0

  readonly routeIn = new Route(ROUTE_IN)
  readonly routeOut = new Route(ROUTE_OUT)
  readonly hopperArc = this.routeIn.len
  readonly scaleInArc = this.routeIn.len - 2 * QUEUE_GAP
  readonly excessArc = this.routeOut.arcOf(SPOT.excess)
  readonly scaleOutArc = this.routeOut.arcOf(SPOT.scaleOut)

  bots: Bot[] = []
  line: Bot[] = []
  playerBot: Bot | null = null
  /** Caminhões que completaram o carregamento e deixaram o pátio. */
  departures = 0
  private spawnT = 90

  weighIn: Weighing = { value: 0, status: 'idle', t: 0 }
  weighOut: Weighing = { value: 0, status: 'idle', t: 0 }
  result: RunResult | null = null

  overT = 0
  /** Reação do sistema ao excesso (quadros) — varia a cada carga. */
  overGrace = OVER_GRACE
  removalPaused = false
  resumeLoad = 0
  running = false

  machineU = 0
  machineGoal = 0
  boomU = 0
  flash = 0

  cam = { fx: 30, fy: -135, zoom: 1 }
  private camT = { fx: 30, fy: -135, zoom: 1 }
  private driveRemain = 0

  constructor(private sim: PortSim) {
    // dois caminhões já em operação: dá vida ao porto desde o primeiro quadro
    this.spawnAt(0, true)
    this.spawnAt(1, false)
  }

  // ---------------------------------------------------------
  // posições derivadas
  // ---------------------------------------------------------
  /** Arco da vaga `i` da fila (0 = sob o funil). */
  slotArc(i: number): number {
    return this.hopperArc - Math.min(i, 4) * QUEUE_GAP
  }

  get scaleInPos(): P2 {
    return this.routeIn.at(this.scaleInArc)
  }
  get scaleOutPos(): P2 {
    return this.routeOut.at(this.scaleOutArc)
  }
  /** Centro da plataforma da balança de entrada (sob o caminhão). */
  get scaleInSlab(): P2 {
    const p = this.scaleInPos
    return { x: p.x - 26, y: p.y }
  }
  get scaleOutSlab(): P2 {
    return { x: SPOT.scaleOut.x - 26, y: SPOT.scaleOut.y }
  }

  get npcTrucks(): Truck[] {
    return this.bots.filter((b) => !b.isPlayer).map((b) => b.truck)
  }

  get playerIndex(): number {
    return this.playerBot ? this.line.indexOf(this.playerBot) : -1
  }
  get queuePos(): number {
    const i = this.playerIndex
    return i < 0 ? 0 : i + 1
  }
  get playerDownstream(): boolean {
    return DOWNSTREAM.includes(this.phase)
  }
  get elapsed(): number {
    return Math.max(0, (this.endTime - this.startTime) / 60)
  }

  // ---------------------------------------------------------
  // pose da máquina de retirada de excesso
  // ---------------------------------------------------------
  get machinePose() {
    const u = smooth(0, 1, this.machineU)
    const x = lerp(MACHINE_PARK.x, MACHINE_WORK.x, u)
    const z = lerp(MACHINE_PARK.y, MACHINE_WORK.y, u)
    // bocal recolhido sobre a máquina
    const stow = { x: x - 30, y: 72, z: z }
    // bocal no topo traseiro da caçamba
    const tgt = this.nozzleTarget(this.sim.truck)
    const b = smooth(0, 1, this.boomU)
    const nozzle = {
      x: lerp(stow.x, tgt.x, b),
      y: lerp(stow.y, tgt.y, b),
      z: lerp(stow.z, tgt.z, b),
    }
    const base = { x: x - 26, y: 60, z: z }
    const elbow = {
      x: (base.x + nozzle.x) / 2,
      y: Math.max(base.y, nozzle.y) + 30 - 18 * b,
      z: (base.z + nozzle.z) / 2,
    }
    return { x, z, base, elbow, nozzle, u, boom: b, heading: Math.PI }
  }

  nozzleTarget(t: Truck) {
    const p = t.bedPoint(-86, 0, 42)
    return { x: p.x, y: p.y, z: p.z }
  }

  // ---------------------------------------------------------
  // ações do jogador
  // ---------------------------------------------------------
  start(): void {
    if (this.phase !== 'IDLE' && this.phase !== 'NEXT' && this.phase !== 'SUMMARY') return
    this.resetRun()
    this.setPhase('ENTERING')
  }

  stopLoading(): void {
    if (this.phase !== 'LOADING') return
    this.finishLoading()
  }

  leaveWithLoad(): void {
    if (this.phase !== 'DECIDE') return
    this.dropFromQueue()
    this.machineGoal = 0
    this.setPhase('TO_EXIT')
    this.sim.log(`Carga liberada com ${this.sim.truck.load.toFixed(1)} t`)
  }

  completeLoad(): void {
    if (this.phase !== 'DECIDE') return
    this.resumeLoad = this.sim.truck.load
    this.dropFromQueue()
    this.setPhase('RETURN')
    this.sim.log('Voltando para a fila para completar a carga')
  }

  stopRemoval(): void {
    if (this.phase !== 'REMOVING') return
    this.removalPaused = true
    if (this.sim.truck.load > LIMIT) {
      this.sim.log(`Retirada pausada — faltam ${(this.sim.truck.load - LIMIT).toFixed(1)} t`)
    }
  }

  resumeRemoval(): void {
    if (this.phase !== 'REMOVING') return
    this.removalPaused = false
  }

  continueAfterRemoval(): void {
    if (this.phase !== 'CORRECTED') return
    this.machineGoal = 0
    this.setPhase('TO_EXIT')
  }

  continueToHighway(): void {
    if (this.phase !== 'SUMMARY') return
    this.setPhase('NEXT')
  }

  // ---------------------------------------------------------
  // ciclo
  // ---------------------------------------------------------
  update(dt: number): void {
    this.pt += dt
    if (this.running) this.endTime = this.sim.time
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt)
    this.updateBots(dt)
    this.updatePlayer(dt)
    this.updateMachine(dt)
    this.updateCamera(dt)
  }

  private setPhase(p: Phase): void {
    this.phase = p
    this.pt = 0
    if (p === 'WEIGH_IN') this.weighIn = { value: 0, status: 'weighing', t: 0 }
    if (p === 'WEIGH_OUT') this.weighOut = { value: 0, status: 'weighing', t: 0 }
    if (p === 'REMOVING') this.removalPaused = false
    if (p === 'ENTERING') this.running = true
  }

  private resetRun(): void {
    const t = this.sim.truck
    this.dropFromQueue()
    t.place(ROUTE_IN[0][0], ROUTE_IN[0][1], Math.PI)
    t.load = 0
    t.bed = 0
    t.dumping = false
    this.removed = 0
    this.overT = 0
    this.overGrace = 34 + Math.random() * 46
    this.removalPaused = false
    this.resumeLoad = 0
    this.result = null
    this.excessAtStart = 0
    this.machineGoal = 0
    this.boomU = 0
    this.tara = Math.round((TARA + (Math.random() - 0.5) * 0.8) * 10) / 10
    this.weighIn = { value: 0, status: 'idle', t: 0 }
    this.weighOut = { value: 0, status: 'idle', t: 0 }
    this.startTime = this.sim.time
    this.endTime = this.sim.time
    this.running = true
    this.sim.log('Nova carga — caminhão 5 eixos a caminho do porto')
  }

  // ---------------------------------------------------------
  // caminhões da fila (IA)
  // ---------------------------------------------------------
  private spawnAt(slot: number, served: boolean): void {
    const truck = new Truck(0, 0, Math.PI)
    const arc = this.slotArc(slot)
    const p = this.routeIn.at(arc)
    truck.place(p.x, p.y, this.routeIn.dirAt(arc))
    truck.id = 100 + Math.floor(Math.random() * 900)
    // caminhão já em operação: quase pronto, libera a vaga rapidamente
    if (served) truck.load = 27 + Math.random() * 9
    const bot: Bot = {
      truck,
      mode: served ? 'load' : 'queue',
      isPlayer: false,
      target: served ? Math.min(BED_MAX - 3, truck.load + 6 + Math.random() * 10) : 0,
      t: 0,
    }
    this.bots.push(bot)
    this.line.push(bot)
  }

  private canSpawn(): boolean {
    const n = this.line.length
    if (!this.playerBot) return n < 2
    return n < 4
  }

  private updateBots(dt: number): void {
    this.spawnT -= dt
    if (this.spawnT <= 0 && this.canSpawn()) {
      this.spawnAt(this.line.length, this.line.length === 0)
      this.spawnT = 90 + Math.random() * 150
    }

    for (let i = this.line.length - 1; i >= 0; i--) {
      const b = this.line[i]
      if (b.isPlayer) continue
      const arc = this.slotArc(i)

      if (b.mode === 'queue') {
        const remain = this.drive(b.truck, this.routeIn, arc, dt, 1.3)
        if (i === 0 && remain <= SETTLE) {
          const err = this.settle(b.truck, this.routeIn, arc, dt)
          if (err < EPS) {
            b.mode = 'load'
            b.target = Math.min(BED_MAX - 3, b.truck.load + 14 + Math.random() * 10)
            b.t = 0
          }
        }
      } else if (b.mode === 'load') {
        this.settle(b.truck, this.routeIn, arc, dt)
        const need = b.target - b.truck.load
        const dry = this.sim.hopperFill <= 0.6
        if (need > 0.2 && !dry) {
          // carregamento acelerado: a fila não pode prender o jogador
          const got = this.sim.pour(b.truck, 0.22, dt)
          b.t = got > 0.001 ? 0 : b.t + dt
        } else {
          b.t += dt
        }
        // sai quando completa — ou quando o funil não dá conta (sem travar a fila)
        if ((need <= 0.2 || b.t > 150) && !this.playerDownstream) {
          b.mode = 'leave'
          b.truck.holdHere = false
          this.line.splice(i, 1)
          this.departures++
        }
      }
    }

    // caminhões saindo do pátio
    for (let k = this.bots.length - 1; k >= 0; k--) {
      const b = this.bots[k]
      if (b.mode !== 'leave') continue
      const remain = this.drive(b.truck, this.routeOut, this.routeOut.len, dt, 1.1)
      if (remain < 40) this.bots.splice(k, 1)
    }
  }

  private joinQueue(): void {
    if (this.playerBot) return
    const bot: Bot = { truck: this.sim.truck, mode: 'queue', isPlayer: true, target: 0, t: 0 }
    this.playerBot = bot
    this.bots.push(bot)
    this.line.push(bot)
    this.setPhase('QUEUE')
  }

  private dropFromQueue(): void {
    const b = this.playerBot
    if (!b) return
    const i = this.line.indexOf(b)
    if (i >= 0) this.line.splice(i, 1)
    const k = this.bots.indexOf(b)
    if (k >= 0) this.bots.splice(k, 1)
    this.playerBot = null
  }

  // ---------------------------------------------------------
  // caminhão do jogador
  // ---------------------------------------------------------
  private updatePlayer(dt: number): void {
    const t = this.sim.truck

    switch (this.phase) {
      case 'IDLE':
      case 'NEXT':
      case 'SUMMARY':
        t.speed *= Math.max(0, 1 - 0.25 * dt)
        t.holdHere = true
        break

      case 'ENTERING': {
        const remain = this.drive(t, this.routeIn, this.scaleInArc, dt, 1.2)
        if (remain <= SETTLE) {
          const err = this.settle(t, this.routeIn, this.scaleInArc, dt)
          if (err < EPS + 0.4) {
            this.setPhase('WEIGH_IN')
            this.sim.log('Caminhão na balança de entrada')
          }
        }
        break
      }

      case 'WEIGH_IN': {
        this.weighIn.t += dt
        if (this.weighIn.status === 'weighing') {
          const k = clamp(this.weighIn.t / 62, 0, 1)
          this.weighIn.value = this.tara * smooth(0, 1, k) + (1 - k) * (Math.random() - 0.5) * 2.2
          if (k >= 1) {
            this.weighIn.status = 'done'
            this.weighIn.value = this.tara
            this.sim.log(`Pesagem de entrada: tara ${this.tara.toFixed(1)} t`)
          }
        }
        this.settle(t, this.routeIn, this.scaleInArc, dt)
        if (this.pt > 125) this.joinQueue()
        break
      }

      case 'QUEUE':
      case 'TO_HOPPER': {
        const i = this.playerIndex
        const arc = this.slotArc(Math.max(i, 0))
        const remain = this.drive(t, this.routeIn, arc, dt, 1)
        if (i <= 0 && this.phase === 'QUEUE') this.setPhase('TO_HOPPER')
        if (remain <= SETTLE) {
          const err = this.settle(t, this.routeIn, arc, dt)
          if (err < EPS && this.phase === 'TO_HOPPER') {
            this.setPhase('LOADING')
            this.sim.log('Caçamba sob o funil — carregamento liberado')
          }
        }
        break
      }

      case 'LOADING': {
        this.settle(t, this.routeIn, this.hopperArc, dt)
        // reserva operacional do terminal: o funil nunca deixa o jogador na mão
        if (this.sim.hopperFill < 20) {
          this.sim.hopperFill = Math.min(60, this.sim.hopperFill + 0.18 * dt)
        }
        this.sim.pour(t, LOAD_RATE, dt)
        if (t.load > LIMIT) {
          this.overT += dt
          if (this.overT > this.overGrace || t.load >= BED_MAX - 0.01) this.finishLoading()
        } else {
          this.overT = 0
        }
        break
      }

      case 'DECIDE':
      case 'OVERWEIGHT':
        this.settle(t, this.routeIn, this.hopperArc, dt)
        if (this.phase === 'OVERWEIGHT' && this.pt > 125) {
          this.machineGoal = 1
          this.setPhase('TO_EXCESS')
        }
        break

      case 'TO_EXCESS': {
        const remain = this.drive(t, this.routeOut, this.excessArc, dt, 1)
        if (remain <= SETTLE) {
          const err = this.settle(t, this.routeOut, this.excessArc, dt)
          if (err < EPS + 0.4 && this.machineU > 0.92 && this.boomU > 0.9) {
            this.setPhase('REMOVING')
            this.sim.log('Máquina acoplada — retirada liberada')
          }
        }
        break
      }

      case 'REMOVING': {
        this.settle(t, this.routeOut, this.excessArc, dt)
        if (!this.removalPaused && t.load > 0.02) {
          const f = Math.min(UNLOAD_RATE * dt, t.load)
          t.load = Math.max(0, t.load - f)
          this.removed += f
          this.sim.suck(t, f, dt)
        }
        if (t.load <= LIMIT + 1e-6) {
          t.load = Math.min(t.load, LIMIT)
          this.setPhase('CORRECTED')
          this.sim.log(`Peso corrigido: ${t.load.toFixed(1)} t`)
        }
        break
      }

      case 'CORRECTED':
        this.settle(t, this.routeOut, this.excessArc, dt)
        break

      case 'TO_EXIT': {
        const remain = this.drive(t, this.routeOut, this.scaleOutArc, dt, 1)
        if (remain <= SETTLE) {
          const err = this.settle(t, this.routeOut, this.scaleOutArc, dt)
          if (err < EPS + 0.4) {
            this.setPhase('WEIGH_OUT')
            this.sim.log('Caminhão na balança de saída')
          }
        }
        break
      }

      case 'WEIGH_OUT': {
        this.weighOut.t += dt
        const total = this.tara + t.load
        if (this.weighOut.status === 'weighing') {
          const k = clamp(this.weighOut.t / 72, 0, 1)
          this.weighOut.value = total * smooth(0, 1, k) + (1 - k) * (Math.random() - 0.5) * 3
          if (k >= 1) {
            this.weighOut.status = 'done'
            this.weighOut.value = total
            this.finishRun()
          }
        }
        this.settle(t, this.routeOut, this.scaleOutArc, dt)
        if (this.pt > 150 && this.result) {
          this.endTime = this.sim.time
          this.running = false
          this.setPhase('SUMMARY')
        }
        break
      }

      case 'RETURN': {
        const remain = this.drive(t, this.routeOut, this.routeOut.len, dt, 2)
        if (remain < 40) {
          t.place(ROUTE_IN[0][0], ROUTE_IN[0][1], Math.PI)
          t.load = this.resumeLoad
          this.setPhase('REQUEUE')
        }
        break
      }

      case 'REQUEUE': {
        const remain = this.drive(t, this.routeIn, this.scaleInArc, dt, 1.8)
        if (remain <= SETTLE) {
          const err = this.settle(t, this.routeIn, this.scaleInArc, dt)
          if (err < EPS + 0.6) this.joinQueue()
        }
        break
      }
    }
  }

  private beginOverweight(): void {
    this.excessAtStart = this.sim.truck.load
  }

  private finishLoading(): void {
    const t = this.sim.truck
    if (t.load > LIMIT) {
      this.beginOverweight()
      this.flash = 34
      this.setPhase('OVERWEIGHT')
      this.sim.log(`Excesso: ${(t.load - LIMIT).toFixed(1)} t acima do limite`)
    } else {
      this.setPhase('DECIDE')
      this.sim.log(`Carregamento parado em ${t.load.toFixed(1)} t`)
    }
  }

  private finishRun(): void {
    const t = this.sim.truck
    this.result = {
      truck: '5 EIXOS',
      finalWeight: this.tara + t.load,
      cargo: t.load,
      removed: this.removed,
      time: this.elapsed,
      status: 'APROVADO',
      approved: true,
    }
    this.sim.log(`Operação concluída — ${t.load.toFixed(1)} t embarcados`)
  }

  // ---------------------------------------------------------
  // direção automática
  // ---------------------------------------------------------
  /** Perseguição pura ao longo da rota. Devolve a distância até a parada. */
  private drive(truck: Truck, route: Route, stopArc: number, dt: number, speed: number): number {
    const pr = route.project(truck.x, truck.y)
    const remain = stopArc - pr.s
    this.driveRemain = Math.max(0, remain)
    if (remain <= SETTLE) return remain
    // o para-choque está HEAD (74) à frente do eixo projetado: soma-se essa
    // distância para que a desaceleração de chegada use o trecho real restante
    const look = Math.min(remain, 165) + 76
    truck.holdHere = remain < 230
    truck.speedScale = speed
    truck.update(this.lookPoint(route, pr.s + look), dt)
    return remain
  }

  /**
   * Ponto-alvo à frente na rota. Quando passa do fim da polilinha, extrapola na
   * direção final — sem isso o caminhão freava antes de chegar ao funil.
   */
  private lookPoint(route: Route, s: number): P2 {
    if (s <= route.len) return route.at(s)
    const p = route.at(route.len)
    const d = route.dirAt(route.len)
    const e = s - route.len
    return { x: p.x + Math.cos(d) * e, y: p.y + Math.sin(d) * e }
  }

  /** Ajuste fino: encaixa o cavalo no ponto exato da rota. */
  private settle(truck: Truck, route: Route, arc: number, dt: number): number {
    const p = route.at(arc)
    const heading = route.dirAt(arc)
    const k = 1 - Math.exp(-0.07 * dt)
    const ex = p.x - truck.x
    const ey = p.y - truck.y
    truck.x += ex * k
    truck.y += ey * k
    truck.heading += angDiff(heading, truck.heading) * k
    truck.phi += -truck.phi * k
    truck.steer += -truck.steer * k
    truck.speed *= 1 - k
    const fwd = (ex * Math.cos(truck.heading) + ey * Math.sin(truck.heading)) * k
    truck.rot += fwd / 12
    return Math.hypot(ex, ey)
  }

  // ---------------------------------------------------------
  // máquina de retirada
  // ---------------------------------------------------------
  private updateMachine(dt: number): void {
    const rate = 0.012 * dt
    this.machineU += clamp(this.machineGoal - this.machineU, -rate, rate)
    const t = this.sim.truck
    const near = Math.hypot(t.x - SPOT.excess.x, t.y - SPOT.excess.y) < 95
    const want =
      this.machineU > 0.85 &&
      near &&
      (this.phase === 'TO_EXCESS' || this.phase === 'REMOVING' || this.phase === 'CORRECTED')
    this.boomU += clamp((want ? 1 : 0) - this.boomU, -0.035 * dt, 0.035 * dt)
  }

  // ---------------------------------------------------------
  // câmera
  // ---------------------------------------------------------
  private updateCamera(dt: number): void {
    this.camTarget()
    const k = 1 - Math.exp(-0.05 * dt)
    this.cam.fx += (this.camT.fx - this.cam.fx) * k
    this.cam.fy += (this.camT.fy - this.cam.fy) * k
    this.cam.zoom += (this.camT.zoom - this.cam.zoom) * k
  }

  private focusAt(x: number, y: number, z: number, zoom: number): void {
    const p = proj(x, y, z)
    this.camT.fx = p[0]
    this.camT.fy = p[1]
    this.camT.zoom = zoom
  }

  private camTarget(): void {
    const t = this.sim.truck
    switch (this.phase) {
      case 'IDLE':
      case 'NEXT':
        this.camT.fx = 30
        this.camT.fy = -135
        this.camT.zoom = 1
        break
      case 'ENTERING':
      case 'RETURN':
      case 'REQUEUE':
        this.focusAt(t.x, 28, t.y, 1.02)
        break
      case 'WEIGH_IN': {
        const p = this.scaleInSlab
        this.focusAt(p.x, 26, p.y, 1.2)
        break
      }
      case 'QUEUE':
        this.focusAt(t.x, 26, t.y, 1.06)
        break
      case 'TO_HOPPER':
      case 'LOADING':
      case 'DECIDE':
      case 'OVERWEIGHT':
        this.focusAt(HOPPER.x - 8, 60, HOPPER.z + 8, 1.26)
        break
      case 'TO_EXCESS':
      case 'REMOVING':
      case 'CORRECTED':
        this.focusAt(t.bedCenter.x + 30, 34, t.bedCenter.y + 26, 1.22)
        break
      case 'TO_EXIT':
      case 'WEIGH_OUT': {
        const p = this.scaleOutSlab
        this.focusAt(p.x, 26, p.y, 1.18)
        break
      }
      case 'SUMMARY':
        this.focusAt(t.x, 30, t.y, 1.1)
        break
    }
  }

  // ---------------------------------------------------------
  // leitura para a interface
  // ---------------------------------------------------------
  msgFor(): string {
    switch (this.phase) {
      case 'IDLE':
        return 'TERMINAL DE GRANÉIS · ETAPA 1'
      case 'ENTERING':
        return 'ENTRANDO NO PORTO'
      case 'WEIGH_IN':
        return 'BALANÇA DE ENTRADA'
      case 'QUEUE':
        return `${this.queuePos}º NA FILA`
      case 'TO_HOPPER':
        return 'POSICIONANDO SOB O FUNIL'
      case 'LOADING':
        return 'CARREGANDO'
      case 'DECIDE':
        return 'CARREGAMENTO PARADO'
      case 'OVERWEIGHT':
        return 'EXCESSO DE PESO'
      case 'TO_EXCESS':
        return 'SEGUINDO PARA A RETIRADA'
      case 'REMOVING':
        return 'RETIRANDO EXCESSO'
      case 'CORRECTED':
        return 'PESO CORRIGIDO'
      case 'TO_EXIT':
        return 'SEGUINDO PARA A BALANÇA DE SAÍDA'
      case 'WEIGH_OUT':
        return 'BALANÇA DE SAÍDA'
      case 'SUMMARY':
        return 'OPERAÇÃO CONCLUÍDA'
      case 'NEXT':
        return 'PRÓXIMA ETAPA'
      case 'RETURN':
        return 'VOLTANDO PARA A FILA'
      case 'REQUEUE':
        return 'RETORNANDO AO PORTO'
    }
  }

  private hintFor(): string {
    switch (this.phase) {
      case 'IDLE':
        return 'Toque em INICIAR NOVA CARGA'
      case 'ENTERING':
        return 'Movimentação automática'
      case 'WEIGH_IN':
        return 'Estabilizando a pesagem...'
      case 'QUEUE':
        return 'Aguarde sua vez no funil'
      case 'TO_HOPPER':
        return 'Aproximando a caçamba da bica'
      case 'LOADING':
        return 'Pare antes de 41,5 t'
      case 'DECIDE':
        return 'Escolha como seguir'
      case 'OVERWEIGHT':
        return 'O carregamento foi interrompido'
      case 'TO_EXCESS':
        return 'Máquina a caminho'
      case 'REMOVING':
        return 'A retirada para automaticamente no limite'
      case 'CORRECTED':
        return 'Carga liberada'
      case 'TO_EXIT':
        return 'Movimentação automática'
      case 'WEIGH_OUT':
        return 'Registrando pesagem final...'
      case 'SUMMARY':
        return 'Confira o resumo da operação'
      case 'NEXT':
        return 'Rodovia na Etapa 2'
      case 'RETURN':
        return 'Dando a volta para completar a carga'
      case 'REQUEUE':
        return 'Entrando novamente no pátio'
    }
  }

  private progressFor(): number {
    switch (this.phase) {
      case 'WEIGH_IN':
        return clamp(this.weighIn.t / 62, 0, 1)
      case 'WEIGH_OUT':
        return clamp(this.weighOut.t / 72, 0, 1)
      case 'QUEUE':
      case 'TO_HOPPER':
      case 'ENTERING':
      case 'REQUEUE':
        return clamp(1 - this.driveRemain / 300, 0, 1)
      case 'TO_EXCESS':
      case 'TO_EXIT':
        return clamp(1 - this.driveRemain / 240, 0, 1)
      case 'RETURN':
        return clamp(1 - this.driveRemain / 820, 0, 1)
      case 'LOADING':
        return clamp(this.sim.truck.load / LIMIT, 0, 1.2)
      case 'REMOVING':
        return clamp(this.removed / Math.max(1, this.excessAtStart - LIMIT), 0, 1)
      default:
        return 0
    }
  }

  gameState(): GameState {
    const t = this.sim.truck
    return {
      phase: this.phase,
      msg: this.msgFor(),
      hint: this.hintFor(),
      tara: this.tara,
      load: t.load,
      total: this.tara + t.load,
      limit: LIMIT,
      bedMax: BED_MAX,
      over: Math.max(0, t.load - LIMIT),
      removed: this.removed,
      removedMax: Math.max(2, this.excessAtStart - LIMIT + 1),
      time: this.elapsed,
      queuePos: this.queuePos,
      queueLen: this.line.length,
      weighIn: { ...this.weighIn },
      weighOut: { ...this.weighOut },
      result: this.result ? { ...this.result } : null,
      progress: this.progressFor(),
      overweight: t.load > LIMIT,
      removalPaused: this.removalPaused,
      flash: this.flash,
      machineU: this.machineU,
      boomU: this.boomU,
      running: this.running,
    }
  }
}
