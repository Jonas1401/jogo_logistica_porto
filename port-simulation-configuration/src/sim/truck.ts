// ============================================================
// CAMINHÃO — cavalo mecânico + carreta basculante articulada
// θ1 = rumo do cavalo · θ2 = rumo da carreta · φ = θ1 − θ2
// A carreta não gira junto: é puxada pelo pino-rei.
// ============================================================
import { DEG, angDiff, clamp, smooth } from './config'

export interface Vec {
  x: number
  y: number
}

// ─────────────────────────────── geometria (do sistema pedido)
export const L1 = 52 // entre-eixos do cavalo
export const C1 = 6 // quinta-roda: pouco à frente do eixo traseiro
export const L2 = 100 // pino-rei → centro do truque da carreta
export const HEAD = 74 // eixo traseiro → para-choque
export const DELTA_MAX = 0.85 // esterço máximo (~49°)
const PHI_SOFT = 62 * DEG // a partir daqui o esterço é contido
const PHI_MAX = 88 * DEG // aqui o esterço vai a zero: anti-jackknife

export const CAP = 32

// caçamba: articulação no fundo da traseira
export const BED = { hingeA: -124, hingeY: 16, max: 50 * DEG, gate: 75 * DEG }

export class Truck {
  x: number
  y: number
  heading = 0 // θ1
  phi = 0 // φ — a carreta NÃO gira junto: é puxada
  steer = 0 // esterço atual (suavizado)
  speed = 0
  load = 0
  bed = 0 // 0 fechada · 1 basculada
  rot = 0 // giro das rodas
  dumping = false
  id = 1

  constructor(x: number, y: number, heading = 0) {
    this.x = x
    this.y = y
    this.heading = heading
  }

  // quinta-roda: o ponto físico onde cavalo e carreta se encontram
  get hitch(): Vec {
    return {
      x: this.x + Math.cos(this.heading) * C1,
      y: this.y + Math.sin(this.heading) * C1,
    }
  }

  get trailerHeading() {
    return this.heading - this.phi
  }

  // eixo da carreta, sempre a L2 do engate, na direção de θ2
  get trailerAxle(): Vec {
    const h = this.hitch
    const a = this.trailerHeading
    return { x: h.x - Math.cos(a) * L2, y: h.y - Math.sin(a) * L2 }
  }

  get head(): Vec {
    return {
      x: this.x + Math.cos(this.heading) * HEAD,
      y: this.y + Math.sin(this.heading) * HEAD,
    }
  }

  trailerPoint(back: number): Vec {
    const h = this.hitch
    const a = this.trailerHeading
    return { x: h.x - Math.cos(a) * back, y: h.y - Math.sin(a) * back }
  }

  /** Centro da caçamba — é aqui que o funil precisa despejar. */
  get bedCenter(): Vec {
    return this.trailerPoint(58)
  }

  /** Ponto da caçamba (a ao longo da carreta, b lateral, y altura) já basculado. */
  bedPoint(a: number, b: number, y: number): { x: number; y: number; z: number } {
    const ang = this.bed * BED.max
    const da = a - BED.hingeA
    const dy = y - BED.hingeY
    const a2 = BED.hingeA + da * Math.cos(ang) - dy * Math.sin(ang)
    const y2 = BED.hingeY + da * Math.sin(ang) + dy * Math.cos(ang)
    const th = this.trailerHeading
    const h = this.hitch
    return {
      x: h.x + Math.cos(th) * a2 - Math.sin(th) * b,
      y: y2,
      z: h.y + Math.sin(th) * a2 + Math.cos(th) * b,
    }
  }

  /** Tampa traseira, articulada no topo e abrindo conforme a caçamba sobe. */
  gatePoint(b: number, y: number): { x: number; y: number; z: number } {
    const gate = this.bed * BED.gate
    const dy = y - 38
    const a = BED.hingeA + dy * Math.sin(gate)
    const yy = 38 + dy * Math.cos(gate)
    return this.bedPoint(a, b, yy)
  }

  update(target: Vec, dt: number) {
    const head = this.head
    const dx = target.x - head.x
    const dy = target.y - head.y
    const dist = Math.hypot(dx, dy)
    const err = angDiff(Math.atan2(dy, dx), this.heading)

    // 1) o CAVALO esterça primeiro, proporcional ao erro de rumo
    let cmd = clamp(err * 1.35, -DELTA_MAX, DELTA_MAX)

    // anti-jackknife: quanto mais fechada a articulação,
    // menos o cavalo pode fechar ainda mais
    if (cmd * this.phi > 0) {
      cmd *= 1 - smooth(PHI_SOFT, PHI_MAX, Math.abs(this.phi))
    }

    // volante com inércia: atraso + limite de velocidade de giro
    const maxRate = 0.07 * dt
    this.steer += clamp((cmd - this.steer) * (1 - Math.exp(-0.18 * dt)), -maxRate, maxRate)

    // 2) velocidade: acelera longe, freia perto e em curva fechada
    const arrive = clamp((dist - 12) / 60, 0, 1)
    const far = clamp((dist - 120) / 360, 0, 1)
    let targetV = (1.3 + far * 3.8) * arrive
    targetV *= 1 - 0.4 * Math.abs(this.steer) / DELTA_MAX
    if (dist > 42) targetV = Math.max(targetV, 1.4) // sem ré
    this.speed += (targetV - this.speed) * (1 - Math.exp(-0.06 * dt))

    // 3) integra — cavalo (modelo de bicicleta) + carreta (engate)
    const steps = Math.max(1, Math.ceil(dt))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const v = this.speed
      const omega = (v * Math.tan(this.steer)) / L1 // giro do cavalo

      this.x += Math.cos(this.heading) * v * h
      this.y += Math.sin(this.heading) * v * h
      this.heading += omega * h

      // a velocidade do engate, projetada na perpendicular da carreta,
      // é o que a faz girar — por isso ela curva DEPOIS e POR DENTRO
      const dphi =
        omega - (v * Math.sin(this.phi) + C1 * omega * Math.cos(this.phi)) / L2
      this.phi = clamp(this.phi + dphi * h, -91 * DEG, 91 * DEG)
    }

    // rodas: aro gira com a distância percorrida (rot += velocidade / raio)
    this.rot += (this.speed * dt) / 12

    // cilindro da caçamba
    const bedTarget = this.dumping ? 1 : 0
    this.bed += (bedTarget - this.bed) * (1 - Math.exp(-0.06 * dt))
  }
}
