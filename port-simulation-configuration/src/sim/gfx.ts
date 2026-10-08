// ============================================================
// PRIMITIVAS GRÁFICAS — projeção oblíqua 3/4 + wireframe neon
// ============================================================

export type V3 = [number, number, number]

const KXY = 0.13
const KZX = -0.5
const KZY = 0.55

// vetor em direção à câmera (para teste de visibilidade de faces)
export const VIEW: V3 = [0.5, 0.615, 1]

export function proj(X: number, Y: number, Z: number): [number, number] {
  return [X + Z * KZX, X * KXY + Z * KZY - Y]
}

// inversa no chão (Y = 0): o cursor vira o alvo do caminhão
const DET = KZY - KZX * KXY
export function unprojGround(px: number, py: number): [number, number] {
  return [(KZY * px - KZX * py) / DET, (-KXY * px + py) / DET]
}

export const depthOf = (X: number, Y: number, Z: number) => X * 0.5 + Z + Y * 0.6

export const LINE = '#2aa4ff'
export const LINE_HI = '#8fdcff'
export const GLOW = '#0a7bff'

export class Wire {
  path = new Path2D()

  m(p: V3) {
    const q = proj(p[0], p[1], p[2])
    this.path.moveTo(q[0], q[1])
  }
  l(p: V3) {
    const q = proj(p[0], p[1], p[2])
    this.path.lineTo(q[0], q[1])
  }
  seg(a: V3, b: V3) {
    this.m(a)
    this.l(b)
  }
  poly(pts: V3[], close = false) {
    for (let i = 0; i < pts.length; i++) (i ? this.l(pts[i]) : this.m(pts[i]))
    if (close) this.path.closePath()
  }

  stroke(
    ctx: CanvasRenderingContext2D,
    color = LINE,
    width = 1.4,
    glow = 0,
    alpha = 1,
    glowColor = GLOW
  ) {
    const k = ctx.getTransform().a
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (glow > 0) {
      ctx.shadowColor = glowColor
      ctx.shadowBlur = glow * k
    }
    ctx.stroke(this.path)
    ctx.restore()
    this.path = new Path2D()
  }
}

export function fillPoly(
  ctx: CanvasRenderingContext2D,
  pts: V3[],
  style: string | CanvasGradient
) {
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const q = proj(pts[i][0], pts[i][1], pts[i][2])
    if (i) ctx.lineTo(q[0], q[1])
    else ctx.moveTo(q[0], q[1])
  }
  ctx.closePath()
  ctx.fillStyle = style
  ctx.fill()
}

/** Retângulo (no plano XZ) com rotação em torno do centro. */
export function rectCorners(
  cx: number,
  cz: number,
  hl: number,
  hw: number,
  heading = 0
): [number, number][] {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  const P = (a: number, b: number): [number, number] => [cx + c * a - s * b, cz + s * a + c * b]
  return [P(hl, hw), P(hl, -hw), P(-hl, -hw), P(-hl, hw)]
}

/** Prisma vertical com faces visíveis preenchidas e arestas acumuladas no Wire. */
export function prism(
  ctx: CanvasRenderingContext2D,
  w: Wire,
  base: [number, number][],
  y0: number,
  y1: number,
  side?: string,
  top?: string,
  back?: string
) {
  const n = base.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = base[i]
    const b = base[(i + 1) % n]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const sg = area >= 0 ? 1 : -1
  for (let i = 0; i < n; i++) {
    const a = base[i]
    const b = base[(i + 1) % n]
    const nx = (b[1] - a[1]) * sg
    const nz = -(b[0] - a[0]) * sg
    const vis = nx * VIEW[0] + nz * VIEW[2]
    const style = vis > 0 ? side : back
    if (style) {
      fillPoly(
        ctx,
        [
          [a[0], y0, a[1]],
          [b[0], y0, b[1]],
          [b[0], y1, b[1]],
          [a[0], y1, a[1]],
        ],
        style
      )
    }
  }
  if (top) fillPoly(ctx, base.map((p) => [p[0], y1, p[1]] as V3), top)
  for (let i = 0; i < n; i++) {
    const a = base[i]
    const b = base[(i + 1) % n]
    w.seg([a[0], y0, a[1]], [b[0], y0, b[1]])
    w.seg([a[0], y1, a[1]], [b[0], y1, b[1]])
    w.seg([a[0], y0, a[1]], [a[0], y1, a[1]])
  }
}

/** Círculo/polígono no plano gerado por dois vetores unitários. */
export function ring(w: Wire, c: V3, ax: V3, ay: V3, r: number, n = 10) {
  const pts: V3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const ca = Math.cos(a) * r
    const sa = Math.sin(a) * r
    pts.push([
      c[0] + ax[0] * ca + ay[0] * sa,
      c[1] + ax[1] * ca + ay[1] * sa,
      c[2] + ax[2] * ca + ay[2] * sa,
    ])
  }
  w.poly(pts, true)
}

/** Guarda-corpo ao redor de um polígono: dois trilhos e montantes. */
export function railing(
  w: Wire,
  base: [number, number][],
  y: number,
  h = 8,
  step = 14
) {
  const n = base.length
  w.poly(base.map((p) => [p[0], y + h, p[1]] as V3), true)
  w.poly(base.map((p) => [p[0], y + h * 0.5, p[1]] as V3), true)
  for (let i = 0; i < n; i++) {
    const a = base[i]
    const b = base[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const k = Math.max(1, Math.round(len / step))
    for (let j = 0; j < k; j++) {
      const t = j / k
      const px = a[0] + (b[0] - a[0]) * t
      const pz = a[1] + (b[1] - a[1]) * t
      w.seg([px, y, pz], [px, y + h, pz])
    }
  }
}

export function rectXY(w: Wire, x: number, z0: number, z1: number, y0: number, y1: number) {
  w.poly(
    [
      [x, y0, z0],
      [x, y0, z1],
      [x, y1, z1],
      [x, y1, z0],
    ],
    true
  )
}

export function rectZY(w: Wire, z: number, x0: number, x1: number, y0: number, y1: number) {
  w.poly(
    [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ],
    true
  )
}
