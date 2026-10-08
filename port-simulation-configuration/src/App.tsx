import { useEffect, useRef, useState } from 'react'
import { PortSim, type PortStats } from './sim/port'
import { Renderer } from './sim/scene'
import type { GameState } from './sim/mission'
import {
  ActionPanel,
  NextSheet,
  StartSheet,
  SummarySheet,
  TopBar,
  fmt,
} from './ui/GameUI'

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded border border-sky-800/60 bg-sky-950">
      <div
        className="h-full transition-all duration-150"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/** Fases em que uma tela cobre o cenário: o HUD não empurra a câmera. */
const FULLSCREEN: GameState['phase'][] = ['IDLE', 'SUMMARY', 'NEXT']

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<PortSim>(null as unknown as PortSim)
  const rendererRef = useRef<Renderer>(null as unknown as Renderer)
  if (!simRef.current) simRef.current = new PortSim()
  if (!rendererRef.current) rendererRef.current = new Renderer()
  const sim = simRef.current
  const renderer = rendererRef.current

  const speedRef = useRef(1)
  const pausedRef = useRef(false)
  const dprRef = useRef(1)
  const insetRef = useRef(0)
  const phaseRef = useRef<GameState['phase']>('IDLE')

  const [g, setG] = useState<GameState>(() => sim.gameState())
  const [stats, setStats] = useState<PortStats>(() => sim.stats())
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [dumpOn, setDumpOn] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

  phaseRef.current = g.phase
  const sheetOpen = g.phase === 'IDLE' || g.phase === 'SUMMARY' || g.phase === 'NEXT'

  // ---------------- laço principal ----------------
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      dprRef.current = dpr
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
        for (let i = 0; i < n; i++) sim.update(total / n)
      }
      const inset = FULLSCREEN.includes(phaseRef.current) ? 0 : insetRef.current
      renderer.render(sim, ctx, canvas.width, canvas.height, inset)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [sim, renderer])

  // ---------------- leitura de estado (HUD) ----------------
  useEffect(() => {
    const fast = setInterval(() => setG(sim.gameState()), 60)
    const slow = setInterval(() => setStats(sim.stats()), 260)
    return () => {
      clearInterval(fast)
      clearInterval(slow)
    }
  }, [sim])

  // ---------------- altura do HUD (para a câmera não cobrir a ação) ----------------
  useEffect(() => {
    const el = hudRef.current
    if (!el) return
    const measure = () => {
      insetRef.current = el.getBoundingClientRect().height * dprRef.current
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [sheetOpen])

  // ---------------- ações ----------------
  const act = (fn: () => void) => {
    fn()
    setG(sim.gameState())
  }
  const setSpd = (s: number) => {
    speedRef.current = s
    setSpeed(s)
  }
  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }
  const toggleDump = () => {
    sim.toggleDump()
    setDumpOn(sim.dumpLock)
  }
  /** Reinicia o terminal por completo (volta à tela inicial). */
  const reset = () => {
    window.location.reload()
  }

  const cur = stats.current

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#020812] font-mono text-sky-200">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* topo */}
      {!sheetOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <TopBar g={g} showPanel={showPanel} onTogglePanel={() => setShowPanel((v) => !v)} />
          {showPanel && (
            <div className="pointer-events-auto mt-2 w-60 rounded-xl border border-sky-700/50 bg-[#020c1a]/88 p-2.5 text-[11px] backdrop-blur">
              <div className="text-[9px] tracking-[0.28em] text-sky-500">TERMINAL DE GRANÉIS</div>
              <div className="text-[13px] font-bold text-sky-100">PORTO INTEGRADO</div>
              <div className="mb-2 text-[10px] text-sky-500">
                {stats.shipName} · {stats.shipPhase}
              </div>

              <div className="mb-1.5 border-t border-sky-800/60 pt-1.5">
                <div className="flex justify-between">
                  <span className="text-sky-500">Caminhão</span>
                  <span className="font-bold text-sky-100">#{cur.id}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Carga</span>
                  <span>
                    {fmt(cur.load)} t
                  </span>
                </div>
                <Bar value={cur.load} max={g.bedMax} color="#4cc3ff" />
              </div>

              <div className="space-y-1.5">
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
                </div>
                <div className="flex justify-between">
                  <span>Guindaste</span>
                  <span className="text-sky-100">{stats.cranePhase}</span>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[
                  ['Viagens', stats.trucksLoaded],
                  ['Basculado', `${stats.tonsDelivered} t`],
                  ['Ciclos garra', stats.grabs],
                  ['Articulação', `${Math.round(cur.phi)}°`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded border border-sky-800/60 bg-sky-950/40 px-2 py-1">
                    <div className="text-[8px] uppercase text-sky-500">{k}</div>
                    <div className="text-[13px] font-bold text-sky-100">{v}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 hidden border-t border-sky-800/60 pt-1.5 md:block">
                <div className="text-sky-500">REGISTRO</div>
                {stats.events.slice(0, 4).map((e, i) => (
                  <div key={i} className={i === 0 ? 'text-sky-200' : 'text-sky-600'}>
                    {e}
                  </div>
                ))}
              </div>

              {/* controles do sandbox (preservados) */}
              <div className="mt-2 border-t border-sky-800/60 pt-2">
                <div className="mb-1 text-[9px] tracking-widest text-sky-500">OPÇÕES</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={togglePause}
                    className="touch-manipulation rounded border border-sky-700 px-2 py-1 text-[10px] active:bg-sky-900/60"
                  >
                    {paused ? '▶ RETOMAR' : '❚❚ PAUSAR'}
                  </button>
                  {[1, 2, 4].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpd(s)}
                      className={`touch-manipulation rounded border px-2 py-1 text-[10px] ${
                        speed === s
                          ? 'border-sky-400 bg-sky-500 text-black'
                          : 'border-sky-700 active:bg-sky-900/60'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                  <button
                    onClick={toggleDump}
                    className={`touch-manipulation rounded border px-2 py-1 text-[10px] ${
                      dumpOn
                        ? 'border-amber-300 bg-amber-400 text-black'
                        : 'border-amber-500/70 text-amber-300 active:bg-amber-900/40'
                    }`}
                  >
                    {dumpOn ? '▼ BASCULANDO' : '▲ BASCULAR'}
                  </button>
                  <button
                    onClick={reset}
                    className="touch-manipulation rounded border border-sky-700 px-2 py-1 text-[10px] active:bg-sky-900/60"
                  >
                    ↺ REINICIAR
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* rodapé — ações da Etapa 1 */}
      {!sheetOpen && (
        <div
          ref={hudRef}
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto w-full max-w-md">
            <ActionPanel
              g={g}
              stopLoading={() => act(() => sim.game.stopLoading())}
              leaveWithLoad={() => act(() => sim.game.leaveWithLoad())}
              completeLoad={() => act(() => sim.game.completeLoad())}
              stopRemoval={() => act(() => sim.game.stopRemoval())}
              resumeRemoval={() => act(() => sim.game.resumeRemoval())}
              continueAfterRemoval={() => act(() => sim.game.continueAfterRemoval())}
            />
          </div>
        </div>
      )}

      {/* telas cheias */}
      {g.phase === 'IDLE' && <StartSheet onStart={() => act(() => sim.game.start())} />}
      {g.phase === 'SUMMARY' && g.result && (
        <SummarySheet r={g.result} onContinue={() => act(() => sim.game.continueToHighway())} />
      )}
      {g.phase === 'NEXT' && (
        <NextSheet
          onRestart={() => {
            act(() => sim.game.start())
          }}
        />
      )}
    </div>
  )
}
