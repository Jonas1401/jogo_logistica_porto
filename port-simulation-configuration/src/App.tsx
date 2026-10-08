import { useEffect, useRef, useState } from 'react'
import { PortSim, type PortStats } from './sim/port'
import { Renderer } from './sim/scene'
import { TRK } from './sim/config'

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="h-1.5 w-full rounded bg-sky-950 overflow-hidden border border-sky-800/60">
      <div className="h-full transition-all duration-150" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<PortSim>(null as unknown as PortSim)
  const rendererRef = useRef<Renderer>(null as unknown as Renderer)
  if (!simRef.current) simRef.current = new PortSim()
  if (!rendererRef.current) rendererRef.current = new Renderer()
  const speedRef = useRef(1)
  const pausedRef = useRef(false)
  const [stats, setStats] = useState<PortStats>(() => simRef.current.stats())
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState(true)
  const [dumpOn, setDumpOn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const dt = Math.min(50, now - last) / 16.667
      last = now
      if (!pausedRef.current) {
        const total = dt * speedRef.current
        const n = Math.max(1, Math.ceil(total / 1.5))
        for (let i = 0; i < n; i++) simRef.current.update(total / n)
      }
      rendererRef.current.render(simRef.current, ctx, canvas.width, canvas.height)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const iv = setInterval(() => setStats(simRef.current.stats()), 150)

    const aim = (e: PointerEvent) => {
      if (e.target !== canvas) return
      const r = canvas.getBoundingClientRect()
      const dpr = canvas.width / Math.max(1, r.width)
      simRef.current.setTarget(
        rendererRef.current.screenToGround(e.clientX - r.left, e.clientY - r.top, dpr)
      )
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      simRef.current.setDumpHeld(e.type === 'keydown')
    }
    window.addEventListener('pointerdown', aim)
    window.addEventListener('pointermove', aim)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(iv)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', aim)
      window.removeEventListener('pointermove', aim)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  const setSpd = (s: number) => {
    speedRef.current = s
    setSpeed(s)
  }
  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }
  const reset = () => {
    simRef.current = new PortSim()
    setDumpOn(false)
    setStats(simRef.current.stats())
  }
  const toggleDump = () => {
    simRef.current.toggleDump()
    setDumpOn(simRef.current.dumpLock)
  }

  const cur = stats.current
  const stateColor =
    cur.state === 'CARREGANDO'
      ? 'text-cyan-300'
      : cur.state === 'BASCULANDO'
        ? 'text-amber-300'
        : cur.state === 'SOB O FUNIL'
          ? 'text-emerald-300'
          : 'text-sky-300'

  return (
    <div className="fixed inset-0 bg-[#020812] text-sky-300 font-mono select-none overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      {/* Controles */}
      <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-1 rounded-lg border border-sky-700/50 bg-[#020c1a]/80 backdrop-blur p-1.5">
        <button
          onClick={() => setHud((h) => !h)}
          className="px-2.5 py-1 text-[11px] rounded border border-sky-700 hover:bg-sky-900/60"
        >
          {hud ? '◧ OCULTAR PAINEL' : '◨ PAINEL'}
        </button>
        <button
          onClick={togglePause}
          className="px-2.5 py-1 text-[11px] rounded border border-sky-700 hover:bg-sky-900/60"
        >
          {paused ? '▶ RETOMAR' : '❚❚ PAUSAR'}
        </button>
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            onClick={() => setSpd(s)}
            className={`px-2.5 py-1 text-[11px] rounded border ${
              speed === s ? 'bg-sky-500 text-black border-sky-400' : 'border-sky-700 hover:bg-sky-900/60'
            }`}
          >
            {s}×
          </button>
        ))}
        <button
          onClick={toggleDump}
          className={`px-2.5 py-1 text-[11px] rounded border ${
            dumpOn ? 'bg-amber-400 text-black border-amber-300' : 'border-amber-500/70 text-amber-300 hover:bg-amber-900/40'
          }`}
        >
          {dumpOn ? '▼ BASCULANDO' : '▲ BASCULAR'}
        </button>
        <button
          onClick={reset}
          className="px-2.5 py-1 text-[11px] rounded border border-sky-700 hover:bg-sky-900/60"
        >
          ↺ REINICIAR
        </button>
      </div>

      {hud && (
        <>
          {/* Painel principal */}
          <div className="absolute top-3 left-3 w-64 rounded-lg border border-sky-700/50 bg-[#020c1a]/80 backdrop-blur p-3 shadow-[0_0_30px_rgba(0,140,255,0.18)]">
            <div className="text-[9px] tracking-[0.3em] text-sky-500">TERMINAL DE GRANÉIS</div>
            <div className="text-base font-bold text-sky-200 leading-tight">PORTO INTEGRADO</div>
            <div className="text-[10px] text-sky-600 mb-2">
              {stats.shipName} · {stats.shipPhase}
            </div>

            <div className="border-t border-sky-800/60 pt-2 mb-2">
              <div className="text-[9px] text-sky-500">CAVALO + BASCULANTE</div>
              <div className={`text-xs font-bold ${stateColor}`}>
                #{cur.id} · {cur.state}
              </div>
              <div className="mt-1">
                <div className="flex justify-between text-[10px]">
                  <span>Carga</span>
                  <span>
                    {cur.load.toFixed(1)} / {TRK.CAP} t
                  </span>
                </div>
                <Bar value={cur.load} max={TRK.CAP} color="#4cc3ff" />
              </div>
              <div className="mt-1.5">
                <div className="flex justify-between text-[10px]">
                  <span>Caçamba</span>
                  <span>{Math.round(cur.bed * 100)}%</span>
                </div>
                <Bar value={cur.bed} max={1} color="#f5b942" />
              </div>
            </div>

            <div className="space-y-2 text-[10px]">
              <div>
                <div className="flex justify-between">
                  <span>Funil</span>
                  <span>
                    {stats.hopperFill.toFixed(1)} / {stats.hopperCap} t
                  </span>
                </div>
                <Bar
                  value={stats.hopperFill}
                  max={stats.hopperCap}
                  color={stats.hopperFill / stats.hopperCap < 0.2 ? '#ff4455' : '#2aa4ff'}
                />
              </div>
              <div>
                <div className="flex justify-between">
                  <span>Porões do navio</span>
                  <span>{Math.round(stats.shipCargo)} t</span>
                </div>
                <Bar value={stats.shipCargo} max={stats.shipCargoMax} color="#00aaff" />
                <div className="flex justify-between text-sky-600 mt-0.5">
                  <span>Porão 1: {Math.round(stats.holds[0])} t</span>
                  <span>Porão 2: {Math.round(stats.holds[1])} t</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span>Guindaste</span>
                <span className="text-sky-200">{stats.cranePhase}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mt-3">
              {[
                ['Viagens', stats.trucksLoaded],
                ['Basculado', `${stats.tonsDelivered} t`],
                ['Ciclos garra', stats.grabs],
                ['Articulação', `${Math.round(cur.phi)}°`],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-sky-800/60 bg-sky-950/40 px-2 py-1">
                  <div className="text-[8px] text-sky-500 uppercase">{k}</div>
                  <div className="text-sm font-bold text-sky-200">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Registro */}
          <div className="absolute bottom-3 left-3 w-80 rounded-lg border border-sky-700/50 bg-[#020c1a]/80 backdrop-blur p-2 text-[10px] hidden md:block">
            <div className="text-sky-500 tracking-widest mb-1">REGISTRO DE EVENTOS</div>
            {stats.events.map((e, i) => (
              <div key={i} className={i === 0 ? 'text-sky-200' : 'text-sky-600'}>
                {e}
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full border border-sky-700/50 bg-[#020c1a]/75 px-4 py-1.5 text-[11px] tracking-wide text-sky-300/90 sm:block">
            CURSOR CONDUZ O CAMINHÃO · ESPAÇO BASCULA A CAÇAMBA
          </div>
        </>
      )}
    </div>
  )
}
