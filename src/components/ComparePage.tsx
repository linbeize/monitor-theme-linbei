import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { lossColor } from "@/components/Chart"
import { Country, deployed } from "@/components/NodeCard"
import { api, type Node } from "@/lib/api"
import { cellsOf, columnRange, columnsOf, latencyTint, POINTS, sortByProbe, type NodePing } from "@/lib/compare"
import { ms } from "@/lib/pingstats"

const RANGES = [
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
]

/** 同时在途的请求数：36 台一起发会把 hub（以及前面的反代限并发）一下子打满。 */
const PARALLEL = 6
/** 结果缓存一分钟：从详情页点回来、或在三个范围之间来回切，不必重拉。 */
const TTL = 60_000
const cache = new Map<string, { at: number; data: NodePing | null }>()

/**
 * 延迟对比页（`/compare`，1.13.0）：所有接入过的节点 × 每条探测线路的中位延迟与丢包。
 * 点表头按那条线路从快到慢排，点一行进那台的详情页（延迟页签）。
 * 格子底色按**列内**快慢从绿到红；丢包率缀在右边，有丢包时按 Smokeping 那套档位上色。
 */
export function ComparePage({ nodes, onOpen, onBack }: {
  nodes: Node[]
  onOpen: (id: number) => void
  onBack: () => void
}) {
  const [hours, setHours] = useState(1)
  const [by, setBy] = useState<number | null>(null)
  const targets = useMemo(() => nodes.filter(deployed), [nodes])
  // 依赖只看 id 串：nodes 每两秒换一次身份（实时帧），不能因此重拉。
  const ids = targets.map((n) => n.id).join(",")
  const [data, setData] = useState<Map<number, NodePing | null>>(new Map())

  useEffect(() => {
    const control = new AbortController()
    const list = ids ? ids.split(",").map(Number) : []
    const now = Date.now()
    const fresh = new Map<number, NodePing | null>()
    for (const id of list) {
      const hit = cache.get(`${id}:${hours}`)
      if (hit && now - hit.at < TTL) fresh.set(id, hit.data)
    }
    // oxlint-disable-next-line react/set-state-in-effect
    setData(new Map(fresh))
    const queue = list.filter((id) => !fresh.has(id))
    const worker = async () => {
      while (queue.length && !control.signal.aborted) {
        const id = queue.shift()!
        let got: NodePing | null = null
        try {
          got = await api<NodePing>(
            `/nodes/${id}/metrics?hours=${hours}&points=${POINTS[hours] ?? 60}&series=ping`,
            { signal: control.signal },
            30_000,
          )
        } catch {
          if (control.signal.aborted) return
        }
        cache.set(`${id}:${hours}`, { at: Date.now(), data: got })
        if (!control.signal.aborted) setData((prev) => new Map(prev).set(id, got))
      }
    }
    for (let i = 0; i < PARALLEL; i++) void worker()
    return () => control.abort()
  }, [ids, hours])

  const columns = useMemo(() => columnsOf([...data.values()].map((d) => d ?? undefined)), [data])
  const rows = useMemo(
    () => sortByProbe(targets.map((node) => ({ node, cells: cellsOf(data.get(node.id) ?? undefined), loaded: data.has(node.id) })), by),
    [targets, data, by],
  )
  const ranges = useMemo(() => new Map(columns.map((c) => [c.id, columnRange(rows, c.id)])), [columns, rows])
  const done = targets.filter((n) => data.has(n.id)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />返回
        </button>
        <h2 className="text-lg font-semibold tracking-tight">延迟对比</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              type="button"
              aria-pressed={hours === r.hours}
              onClick={() => setHours(r.hours)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                hours === r.hours ? "border bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {done < targets.length ? `加载中 ${done} / ${targets.length}` : `${targets.length} 台 · 中位延迟 ms · 点表头排序`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-lg shadow-border/60 dark:shadow-none">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-normal">
              <th className="sticky left-0 bg-card text-left">
                <button type="button" onClick={() => setBy(null)} className={by === null ? "font-medium text-foreground" : "hover:text-foreground"}>
                  节点
                </button>
              </th>
              {columns.map((c) => (
                <th key={c.id} className="text-right">
                  <button
                    type="button"
                    aria-pressed={by === c.id}
                    onClick={() => setBy(by === c.id ? null : c.id)}
                    className={`whitespace-nowrap ${by === c.id ? "font-medium text-foreground" : "hover:text-foreground"}`}
                  >
                    {c.name}{by === c.id ? " ↑" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, cells, loaded }) => (
              <tr
                key={node.id}
                onClick={() => onOpen(node.id)}
                className="cursor-pointer border-t transition-colors hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2"
              >
                <td className="sticky left-0 bg-card">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Country node={node} />
                    <span className={node.online ? "" : "text-muted-foreground"}>{node.name}</span>
                  </span>
                </td>
                {columns.map((c) => {
                  const cell = cells.get(c.id)
                  const range = ranges.get(c.id)
                  if (!loaded) return <td key={c.id} className="text-right text-muted-foreground/50">…</td>
                  if (!cell) return <td key={c.id} className="text-right text-muted-foreground/50">—</td>
                  const best = cell.median !== null && range && cell.median === range[0]
                  return (
                    <td
                      key={c.id}
                      className="text-right"
                      style={cell.median !== null && range ? { background: latencyTint(cell.median, range) } : undefined}
                      title={`${node.name} · ${c.name}：中位 ${ms(cell.median)} ms，丢包 ${cell.loss.toFixed(1)}%`}
                    >
                      <span className={`whitespace-nowrap ${best ? "font-semibold" : ""}`}>
                        {cell.median === null ? <span className="text-destructive">全丢</span> : ms(cell.median)}
                        {cell.loss > 0 && cell.median !== null && (
                          <span className="ml-1.5 text-[11px]" style={{ color: lossColor(cell.loss) }}>
                            {cell.loss < 1 ? "<1" : Math.round(cell.loss)}%
                          </span>
                        )}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
