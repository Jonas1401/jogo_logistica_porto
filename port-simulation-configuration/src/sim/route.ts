// ============================================================
// ROTA — polilinha no pátio (x = X do mundo, y = Z do mundo)
// Usada pela Etapa 1 para conduzir os caminhões automaticamente
// (perseguição pura com ponto-alvo à frente do veículo).
// ============================================================
import { clamp } from './config'

export interface P2 {
  x: number
  y: number
}

export class Route {
  readonly cum: number[] = []
  readonly len: number

  constructor(public readonly pts: [number, number][]) {
    this.cum.push(0)
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0]
      const dy = pts[i][1] - pts[i - 1][1]
      this.cum.push(this.cum[i - 1] + Math.hypot(dx, dy))
    }
    this.len = this.cum[this.cum.length - 1]
  }

  private segIndex(d: number): number {
    let i = 1
    while (i < this.cum.length - 1 && this.cum[i] < d) i++
    return i
  }

  /** Ponto da polilinha mais próximo de (x, y). */
  project(x: number, y: number): { s: number; x: number; y: number } {
    let bs = 0
    let bx = this.pts[0][0]
    let by = this.pts[0][1]
    let bd = Infinity
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1]
      const [bx2, by2] = this.pts[i]
      const dx = bx2 - ax
      const dy = by2 - ay
      const l2 = dx * dx + dy * dy || 1
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1)
      const px = ax + dx * t
      const py = ay + dy * t
      const d = (x - px) * (x - px) + (y - py) * (y - py)
      if (d < bd) {
        bd = d
        bs = this.cum[i - 1] + Math.hypot(dx, dy) * t
        bx = px
        by = py
      }
    }
    return { s: bs, x: bx, y: by }
  }

  /** Ponto da rota a uma distância `s` do início. */
  at(s: number): P2 {
    const d = clamp(s, 0, this.len)
    const i = this.segIndex(d)
    const [ax, ay] = this.pts[i - 1]
    const [bx, by] = this.pts[i]
    const seg = this.cum[i] - this.cum[i - 1] || 1
    const t = clamp((d - this.cum[i - 1]) / seg, 0, 1)
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t }
  }

  /** Rumo (radianos) da rota em `s`. */
  dirAt(s: number): number {
    const d = clamp(s, 0, this.len)
    const i = this.segIndex(d)
    const [ax, ay] = this.pts[i - 1]
    const [bx, by] = this.pts[i]
    return Math.atan2(by - ay, bx - ax)
  }

  /** Distância percorrida até o ponto mais próximo de `p`. */
  arcOf(p: P2): number {
    return this.project(p.x, p.y).s
  }
}
