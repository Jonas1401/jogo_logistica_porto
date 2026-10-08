// ============================================================
// INTERFACE DO JOGO — Etapa 1 (mobile-first)
// Botões grandes, peso sempre visível, sem menus escondidos.
// ============================================================
import type { GameState, RunResult, Weighing } from '../sim/mission'

export const fmt = (v: number) => v.toFixed(1).replace('.', ',')

export function mmss(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const pct = (v: number) => Math.max(0, Math.min(100, v))

// ------------------------------------------------------------
// Botão grande
// ------------------------------------------------------------
type Tone = 'go' | 'stop' | 'warn' | 'ghost' | 'muted'

const TONES: Record<Tone, string> = {
  go: 'bg-emerald-500/90 text-emerald-950 border-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.35)] active:bg-emerald-400',
  stop: 'bg-rose-600/95 text-white border-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.4)] active:bg-rose-500',
  warn: 'bg-amber-500/90 text-amber-950 border-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.35)] active:bg-amber-400',
  ghost: 'bg-sky-500/15 text-sky-100 border-sky-400/70 active:bg-sky-500/30',
  muted: 'bg-slate-500/15 text-sky-200/80 border-slate-400/30 active:bg-slate-500/25',
}

export function BigButton({
  children,
  onClick,
  tone = 'ghost',
  sub,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: Tone
  sub?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[62px] w-full touch-manipulation select-none flex-col items-center justify-center rounded-2xl border-2 px-4 py-3 text-center text-base font-bold leading-tight tracking-wide transition-transform duration-75 active:scale-[0.985] disabled:opacity-40 ${TONES[tone]}`}
    >
      <span>{children}</span>
      {sub && <span className="mt-0.5 text-[11px] font-medium opacity-75">{sub}</span>}
    </button>
  )
}

// ------------------------------------------------------------
// Barra de peso
// ------------------------------------------------------------
export function WeightBar({
  value,
  max,
  limit,
  tone = 'load',
}: {
  value: number
  max: number
  limit?: number
  tone?: 'load' | 'remove'
}) {
  const over = limit !== undefined && value > limit
  const fill =
    tone === 'remove'
      ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
      : over
        ? 'linear-gradient(90deg,#f97316,#ef4444)'
        : 'linear-gradient(90deg,#0ea5e9,#34d399)'
  return (
    <div className="relative h-8 w-full overflow-hidden rounded-xl border border-sky-700/60 bg-[#03121f]">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
        style={{ width: `${pct((value / max) * 100)}%`, background: fill }}
      />
      {limit !== undefined && (
        <div
          className="absolute inset-y-0 w-[3px] bg-rose-300/90 shadow-[0_0_8px_rgba(255,80,110,0.9)]"
          style={{ left: `${pct((limit / max) * 100)}%` }}
        />
      )}
      {limit !== undefined && (
        <div
          className="absolute inset-y-0 left-0 border-r border-dashed border-rose-200/25"
          style={{ width: `${pct((limit / max) * 100)}%` }}
        />
      )}
      <div className="absolute inset-0 flex items-center justify-between px-3 text-[12px] font-bold tabular-nums text-sky-50 drop-shadow">
        <span>{fmt(value)} t</span>
        {limit !== undefined && <span className="opacity-70">{fmt(limit)} t</span>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Cartões
// ------------------------------------------------------------
export function Card({
  children,
  tone = 'blue',
  className = '',
}: {
  children: React.ReactNode
  tone?: 'blue' | 'green' | 'red' | 'amber'
  className?: string
}) {
  const tones = {
    blue: 'border-sky-600/50 bg-[#03101f]/92',
    green: 'border-emerald-400/60 bg-[#04180f]/92',
    red: 'border-rose-500/70 bg-[#1a0508]/92',
    amber: 'border-amber-400/60 bg-[#1a1204]/92',
  }
  return (
    <div
      className={`rounded-2xl border-2 px-3.5 py-3 shadow-[0_-6px_40px_rgba(0,0,0,0.55)] backdrop-blur-md ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  )
}

export function Row({
  label,
  value,
  tone = 'sky',
}: {
  label: string
  value: string
  tone?: 'sky' | 'green' | 'red' | 'amber'
}) {
  const tones = {
    sky: 'text-sky-100',
    green: 'text-emerald-300',
    red: 'text-rose-300',
    amber: 'text-amber-300',
  }
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-sky-800/40 py-2 last:border-0">
      <span className="text-[11px] uppercase tracking-[0.16em] text-sky-400/80">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${tones[tone]}`}>{value}</span>
    </div>
  )
}

export function MiniBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-sky-950">
      <div
        className="h-full rounded bg-sky-400/80 transition-[width] duration-150"
        style={{ width: `${pct(value * 100)}%` }}
      />
    </div>
  )
}

// ------------------------------------------------------------
// Faixa de espera (fases automáticas)
// ------------------------------------------------------------
export function WaitCard({ g, icon }: { g: GameState; icon: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold tracking-wide text-sky-100">
          {icon} {g.msg}
        </span>
        <span className="text-[11px] text-sky-400/80">{g.hint}</span>
      </div>
      <div className="mt-2.5">
        <MiniBar value={g.progress} />
      </div>
    </Card>
  )
}

// ------------------------------------------------------------
// Bloco de pesagem (entrada / saída)
// ------------------------------------------------------------
export function WeighCard({
  title,
  w,
  sub,
  tone = 'blue',
}: {
  title: string
  w: Weighing
  sub: string
  tone?: 'blue' | 'green'
}) {
  const done = w.status === 'done'
  return (
    <Card tone={tone}>
      <div className="text-center text-[11px] uppercase tracking-[0.22em] text-sky-400">{title}</div>
      <div className="my-1.5 text-center text-5xl font-black tabular-nums text-sky-50 drop-shadow-[0_0_18px_rgba(80,200,255,0.35)]">
        {fmt(w.value)} <span className="text-2xl text-sky-300">t</span>
      </div>
      <div className="mb-2 flex items-center justify-center gap-2 text-[12px] font-bold">
        {done ? (
          <span className="text-emerald-300">✅ PESAGEM CONCLUÍDA</span>
        ) : (
          <span className="animate-pulse text-amber-300">⏳ ESTABILIZANDO...</span>
        )}
      </div>
      <MiniBar value={Math.min(1, w.t / 70)} />
      <div className="mt-1.5 text-center text-[11px] text-sky-400/80">{sub}</div>
    </Card>
  )
}

// ------------------------------------------------------------
// Painel inferior — muda conforme a fase
// ------------------------------------------------------------
export function ActionPanel({
  g,
  stopLoading,
  leaveWithLoad,
  completeLoad,
  stopRemoval,
  resumeRemoval,
  continueAfterRemoval,
}: {
  g: GameState
  stopLoading: () => void
  leaveWithLoad: () => void
  completeLoad: () => void
  stopRemoval: () => void
  resumeRemoval: () => void
  continueAfterRemoval: () => void
}) {
  switch (g.phase) {
    case 'IDLE':
    case 'SUMMARY':
    case 'NEXT':
      return null

    case 'ENTERING':
      return <WaitCard g={g} icon="🚛" />
    case 'RETURN':
    case 'REQUEUE':
      return <WaitCard g={g} icon="🔄" />
    case 'QUEUE':
      return <WaitCard g={g} icon="🚦" />
    case 'TO_HOPPER':
      return <WaitCard g={g} icon="📍" />
    case 'TO_EXCESS':
      return <WaitCard g={g} icon="🔧" />
    case 'TO_EXIT':
      return <WaitCard g={g} icon="⚖️" />

    case 'WEIGH_IN':
      return (
        <WeighCard
          title="⚖️ Balança de entrada"
          w={g.weighIn}
          sub={`Tara do cavalo + carreta · ${g.queueLen} veículo(s) no pátio`}
        />
      )

    case 'WEIGH_OUT':
      return (
        <WeighCard
          title="⚖️ Balança de saída"
          w={g.weighOut}
          sub="Registrando peso final da operação"
          tone="green"
        />
      )

    case 'LOADING': {
      const over = g.overweight
      return (
        <Card tone={over ? 'red' : 'blue'}>
          <div className="text-center text-[11px] uppercase tracking-[0.22em] text-sky-400">
            Peso da carga
          </div>
          <div className="my-0.5 text-center text-5xl font-black tabular-nums text-sky-50 drop-shadow-[0_0_18px_rgba(80,200,255,0.35)]">
            {fmt(g.load)} <span className="text-2xl text-sky-300">t</span>
            <span className="ml-1 text-lg font-bold text-sky-400/80">/ {fmt(g.limit)} t</span>
          </div>
          <WeightBar value={g.load} max={g.bedMax} limit={g.limit} />
          <div
            className={`mt-2 text-center text-[13px] font-bold ${over ? 'animate-pulse text-rose-300' : 'text-emerald-300'}`}
          >
            {over ? `⚠️ EXCESSO DE PESO · ${fmt(g.over)} t acima` : '✅ DENTRO DO LIMITE'}
          </div>
          <div className="mt-2.5">
            <BigButton tone="stop" onClick={stopLoading}>
              🛑 PARAR CARREGAMENTO
            </BigButton>
          </div>
        </Card>
      )
    }

    case 'DECIDE':
      return (
        <Card>
          <div className="text-center text-[11px] uppercase tracking-[0.22em] text-sky-400">
            Carregamento parado
          </div>
          <div className="my-1 text-center text-4xl font-black tabular-nums text-sky-50">
            {fmt(g.load)} <span className="text-xl text-sky-300">t</span>
          </div>
          <div className="mb-3 text-center text-[12px] text-sky-300/80">
            Faltam {fmt(Math.max(0, g.limit - g.load))} t para o limite de {fmt(g.limit)} t
          </div>
          <div className="grid gap-2">
            <BigButton tone="go" onClick={leaveWithLoad} sub="segue para a balança de saída">
              ✅ SAIR COM ESTE PESO
            </BigButton>
            <BigButton tone="warn" onClick={completeLoad} sub="volta à fila e completa a carga">
              ➕ COMPLETAR CARGA
            </BigButton>
          </div>
        </Card>
      )

    case 'OVERWEIGHT':
      return (
        <Card tone="red">
          <div className="text-center text-xl font-black text-rose-300">⚠️ EXCESSO DE PESO</div>
          <div className="mt-2">
            <Row label="Peso atual" value={`${fmt(g.load)} t`} tone="red" />
            <Row label="Limite" value={`${fmt(g.limit)} t`} />
            <Row label="Excesso" value={`${fmt(g.over)} t`} tone="red" />
          </div>
          <div className="mt-1 text-center text-[12px] text-rose-200/80">
            {g.hint} — levando o caminhão para a retirada
          </div>
          <div className="mt-2">
            <MiniBar value={g.progress} />
          </div>
        </Card>
      )

    case 'REMOVING': {
      const paused = g.removalPaused
      const stillOver = paused && g.load > g.limit
      return (
        <Card tone={g.overweight ? 'red' : 'blue'}>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-sky-400">Peso atual</div>
              <div className="text-4xl font-black tabular-nums text-sky-50">
                {fmt(g.load)} <span className="text-lg text-sky-300">t</span>
              </div>
            </div>
            <div className="text-right text-[11px] text-sky-400">
              limite {fmt(g.limit)} t
              <div className={`text-[13px] font-bold ${g.overweight ? 'text-rose-300' : 'text-emerald-300'}`}>
                {g.overweight ? `excesso ${fmt(g.over)} t` : 'no limite'}
              </div>
            </div>
          </div>
          <div className="mt-2">
            <WeightBar value={g.load} max={g.bedMax} limit={g.limit} />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-300/90">
              Quantidade retirada
            </div>
            <div className="text-2xl font-black tabular-nums text-amber-200">
              {fmt(g.removed)} <span className="text-sm">t</span>
            </div>
          </div>
          <div className="mt-1.5">
            <WeightBar value={g.removed} max={g.removedMax} tone="remove" />
          </div>
          <div className="mt-2.5">
            {stillOver ? (
              <BigButton tone="warn" onClick={resumeRemoval} sub={`ainda faltam ${fmt(g.over)} t`}>
                🔄 CONTINUAR RETIRANDO
              </BigButton>
            ) : paused ? (
              <BigButton tone="go" onClick={resumeRemoval}>
                🔄 CONTINUAR RETIRANDO
              </BigButton>
            ) : (
              <BigButton tone="stop" onClick={stopRemoval}>
                🛑 PARAR RETIRADA
              </BigButton>
            )}
          </div>
        </Card>
      )
    }

    case 'CORRECTED':
      return (
        <Card tone="green">
          <div className="text-center text-xl font-black text-emerald-300">✅ PESO CORRIGIDO</div>
          <div className="mt-1 text-center text-[11px] uppercase tracking-[0.2em] text-emerald-400/80">
            Peso final
          </div>
          <div className="my-1 text-center text-5xl font-black tabular-nums text-emerald-100">
            {fmt(g.load)} <span className="text-2xl">t</span>
          </div>
          <div className="mb-2 text-center text-[12px] text-emerald-200/80">
            Retirado: {fmt(g.removed)} t · Limite {fmt(g.limit)} t
          </div>
          <BigButton tone="go" onClick={continueAfterRemoval} sub="segue para a balança de saída">
            ▶ CONTINUAR
          </BigButton>
        </Card>
      )
  }
}

// ------------------------------------------------------------
// Telas cheias: início, resumo e próxima etapa
// ------------------------------------------------------------
export function StartSheet({ onStart }: { onStart: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#020812]/85 via-[#020812]/70 to-[#020812]/95 px-5">
      <div className="w-full max-w-md rounded-3xl border-2 border-sky-600/50 bg-[#03101f]/95 p-5 shadow-[0_0_60px_rgba(0,140,255,0.25)] backdrop-blur-md">
        <div className="text-center text-[10px] tracking-[0.34em] text-sky-500">TERMINAL DE GRANÉIS</div>
        <h1 className="mt-1 text-center text-2xl font-black leading-tight text-sky-100">
          ETAPA 1 — OPERAÇÃO NO PORTO
        </h1>
        <p className="mt-1 text-center text-[13px] text-sky-300/90">Carregamento do caminhão</p>

        <div className="mt-4 rounded-2xl border border-sky-800/60 bg-sky-950/40 p-3">
          <Row label="Caminhão" value="5 EIXOS" />
          <Row label="Limite de carga" value="41,5 t" />
        </div>

        <ol className="mt-3 space-y-1 pl-1 text-[12px] leading-relaxed text-sky-200/80">
          <li>1. O caminhão entra e passa pela balança de entrada</li>
          <li>2. Entra na fila e se posiciona sob o funil</li>
          <li>3. Você decide a hora de parar o carregamento</li>
          <li>4. Excesso é retirado pela máquina antes da saída</li>
        </ol>

        <div className="mt-4">
          <BigButton tone="go" onClick={onStart}>
            ▶ INICIAR NOVA CARGA
          </BigButton>
        </div>
        <p className="mt-2 text-center text-[11px] text-sky-400/70">
          A movimentação dentro do porto é automática
        </p>
      </div>
    </div>
  )
}

export function SummarySheet({
  r,
  onContinue,
}: {
  r: RunResult
  onContinue: () => void
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#020812]/88 via-[#020812]/75 to-[#020812]/96 px-5">
      <div className="w-full max-w-md rounded-3xl border-2 border-emerald-400/50 bg-[#04140f]/95 p-5 shadow-[0_0_60px_rgba(16,185,129,0.25)] backdrop-blur-md">
        <div className="text-center text-2xl font-black text-emerald-300">✅ OPERAÇÃO CONCLUÍDA</div>

        <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-1">
          <Row label="Caminhão" value={r.truck} />
          <Row label="Peso final" value={`${fmt(r.finalWeight)} t`} tone="green" />
          <Row label="Carga transportada" value={`${fmt(r.cargo)} t`} tone="green" />
          <Row label="Excesso retirado" value={`${fmt(r.removed)} t`} tone="amber" />
          <Row label="Tempo da operação" value={mmss(r.time)} />
          <Row label="Status" value={`✅ ${r.status}`} tone="green" />
        </div>

        <div className="mt-4">
          <BigButton tone="go" onClick={onContinue}>
            ➡️ CONTINUAR PARA A RODOVIA
          </BigButton>
        </div>
      </div>
    </div>
  )
}

export function NextSheet({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#020812]/92 px-5">
      <div className="w-full max-w-md rounded-3xl border-2 border-sky-600/50 bg-[#03101f]/95 p-5 backdrop-blur-md">
        <div className="text-center text-xl font-black text-sky-100">🚧 ETAPA 2 — RODOVIA</div>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-sky-300/85">
          A viagem até a empresa, o trânsito, a balança da empresa e a descarga serão
          implementados na próxima etapa. A Etapa 1 está concluída e funcionando.
        </p>
        <div className="mt-4">
          <BigButton tone="ghost" onClick={onRestart}>
            🔄 REPETIR A ETAPA 1
          </BigButton>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Barra superior
// ------------------------------------------------------------
export function TopBar({
  g,
  showPanel,
  onTogglePanel,
}: {
  g: GameState
  showPanel: boolean
  onTogglePanel: () => void
}) {
  return (
    <div className="pointer-events-auto flex items-start justify-between gap-2">
      <div className="rounded-xl border border-sky-700/50 bg-[#020c1a]/80 px-3 py-1.5 backdrop-blur">
        <div className="text-[9px] tracking-[0.24em] text-sky-500">ETAPA 1 · PORTO</div>
        <div className="text-[13px] font-bold leading-tight text-sky-100">{g.msg}</div>
        <div className="text-[10px] text-sky-400/80">
          5 EIXOS · {mmss(g.time)} · {g.hint}
        </div>
      </div>
      <button
        type="button"
        onClick={onTogglePanel}
        className="touch-manipulation rounded-xl border border-sky-700/60 bg-[#020c1a]/80 px-3 py-2 text-[11px] font-bold text-sky-200 backdrop-blur active:bg-sky-900/60"
      >
        {showPanel ? '◧ FECHAR' : '◨ PAINEL'}
      </button>
    </div>
  )
}
