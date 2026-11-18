import { useMemo, useState } from "react"

import { heatGrid, latencyHeat, latencySpan, lossTint, type HeatPoint } from "@/lib/heatmap"
import { ms } from "@/lib/pingstats"
import { t as tr } from "@/lib/i18n"

/**
 * 详情页「网络延迟」页签下方的热力图（1.13.0）：选 2~31 天的范围时出现。
 * 一条可见线路一张；「丢包 / 延迟」切换看哪一种。用的是页面已经拉回来的同一份数据。
 */
export function LatencyHeatmap({ series }: {
  series: { id: number; name: string; color: string; points: HeatPoint[] }[]
}) {
  const [mode, setMode] = useState<"loss" | "latency">("loss")
  const grids = useMemo(() => series.map((s) => ({ ...s, grid: heatGrid(s.points) })), [series])

  return (
    <section className="rounded-2xl border bg-card px-4 py-3 text-card-foreground shadow-lg shadow-border/60 dark:shadow-none">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">{tr("按小时分布（本地时间）", "By hour (local time)")}</h3>
        <div className="flex rounded-md border p-0.5 text-xs" role="group" aria-label={tr("热力图显示", "Heatmap metric")}>
          {(["loss", "latency"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={mode === k}
              onClick={() => setMode(k)}
              className={`rounded px-2 py-0.5 ${mode === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k === "loss" ? tr("丢包", "Loss") : tr("延迟", "Latency")}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {mode === "loss"
            ? tr("绿＝不丢，越红丢得越多（30% 以上最红）", "Green = no loss, redder = more loss (30%+ is darkest)")
            : tr("每张图内从快（绿）到慢（红）", "Within each map: fast (green) to slow (red)")}
        </span>
      </div>
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2 xl:grid-cols-3">
        {grids.map(({ id, name, color, grid }) => {
          const span = latencySpan(grid)
          return (
            <div key={id} className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5 text-xs">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} aria-hidden />
                {name}
              </div>
              <div className="grid gap-px text-[10px] text-muted-foreground" style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0, 1fr))" }}>
                <span />
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="text-center tabular-nums">{h % 6 === 0 ? h : ""}</span>
                ))}
                {grid.cells.map((row, d) => (
                  <Row key={grid.labels[d] + d} label={grid.labels[d]} row={row} name={name} mode={mode} span={span} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Row({ label, row, name, mode, span }: {
  label: string
  row: { loss: number | null; median: number | null; n: number }[]
  name: string
  mode: "loss" | "latency"
  span: [number, number] | null
}) {
  return (
    <>
      <span className="pr-1 text-right tabular-nums leading-3">{label}</span>
      {row.map((c, h) => {
        const bg = c.n === 0
          ? undefined
          : mode === "loss"
            ? (c.loss === null ? undefined : lossTint(c.loss))
            : c.median === null ? "oklch(0.62 0.2 25 / 1)" : span ? latencyHeat(c.median, span) : undefined
        return (
          <span
            key={h}
            className={`h-3 rounded-[2px] ${c.n === 0 ? "bg-muted/50" : ""}`}
            style={bg ? { background: bg } : undefined}
            title={c.n === 0
              ? `${label} ${h}:00 · ${tr("无数据", "no data")}`
              : `${name} · ${label} ${h}:00–${h + 1}:00 · ${tr("丢包", "loss")} ${(c.loss ?? 0).toFixed(1)}% · ${tr("中位", "median")} ${ms(c.median)} ms`}
          />
        )
      })}
    </>
  )
}
