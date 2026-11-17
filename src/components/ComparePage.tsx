import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { lossColor } from "@/components/Chart"
import { Country, deployed } from "@/components/NodeCard"
import { api, ApiError, type Node } from "@/lib/api"
import { cellsOf, columnRange, columnsOf, latencyTint, POINTS, sortByProbe, type NodePing } from "@/lib/compare"
import { ms } from "@/lib/pingstats"

const RANGES = [
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
]

/**
 * 同时在途的请求数：**3**。hub 对历史查询有一道全站共用的闸（`HISTORY_SLOTS = 4`，api.rs），
 * 满了不排队、直接答 503「查询历史的请求太多」。1.13.0 开 6 路时实测 36 台里每轮有 2 台被拒 ——
 * 那几行就一直是「—」。留一个位子给同时在看详情页的其他访客。
 */
const PARALLEL = 3
/** 被闸拒掉（503）或网络抖动时重试几次；退避 0.6s → 1.2s → 2.4s → 4.8s（再加点随机，免得几路一起撞回去）。 */
const RETRIES = 4
/** 结果缓存一分钟：从详情页点回来、或在三个范围之间来回切，不必重拉。**只缓存成功的**。 */
const TTL = 60_000
const cache = new Map<string, { at: number; data: NodePing }>()

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => { clearTimeout(t); resolve() }, { once: true })
  })

/** 值得再试一次的失败：hub 的闸（503）、反代的 502 / 504、超时与网络错误（status 0）。 */
const transient = (e: unknown) => e instanceof ApiError && [0, 502, 503, 504].includes(e.status)

async function load(id: number, hours: number, signal: AbortSignal): Promise<NodePing> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<NodePing>(
        `/nodes/${id}/metrics?hours=${hours}&points=${POINTS[hours] ?? 60}&series=ping`,
        { signal },
        30_000,
      )
    } catch (e) {
      if (signal.aborted || attempt >= RETRIES || !transient(e)) throw e
      await sleep(600 * 2 ** attempt + Math.random() * 300, signal)
    }
  }
}

/** 一台的状态：拿到了 / 重试完仍失败（不进缓存，点「重试」再拉）。还在路上的不在 Map 里。 */
type Got = NodePing | "failed"

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
  const [attempt, setAttempt] = useState(0)
  const targets = useMemo(() => nodes.filter(deployed), [nodes])
  // 依赖只看**排好序的** id 串：nodes 每两秒换一次身份（实时帧），列表顺序也会因为某台
  // 上下线而变 —— 两者都不该让进行中的请求被整批取消、从头再来（1.13.1）。
  const ids = targets.map((n) => n.id).sort((x, y) => x - y).join(",")
  const [data, setData] = useState<Map<number, Got>>(new Map())

  useEffect(() => {
    const control = new AbortController()
    const list = ids ? ids.split(",").map(Number) : []
    const now = Date.now()
    const fresh = new Map<number, Got>()
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
        let got: Got = "failed"
        try {
          got = await load(id, hours, control.signal)
          cache.set(`${id}:${hours}`, { at: Date.now(), data: got })
        } catch {
          if (control.signal.aborted) return
        }
        if (!control.signal.aborted) setData((prev) => new Map(prev).set(id, got))
      }
    }
    for (let i = 0; i < PARALLEL; i++) void worker()
    return () => control.abort()
  }, [ids, hours, attempt])

  const ok = (d: Got | undefined) => (d && d !== "failed" ? d : undefined)
  const columns = useMemo(() => columnsOf([...data.values()].map(ok)), [data])
  const rows = useMemo(
    () => sortByProbe(targets.map((node) => ({
      node,
      cells: cellsOf(ok(data.get(node.id))),
      loaded: data.has(node.id),
      failed: data.get(node.id) === "failed",
    })), by),
    [targets, data, by],
  )
  const ranges = useMemo(() => new Map(columns.map((c) => [c.id, columnRange(rows, c.id)])), [columns, rows])
  const done = targets.filter((n) => data.has(n.id)).length
  const failed = rows.filter((r) => r.failed).length

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
        {failed > 0 && done === targets.length && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-full border px-2.5 py-0.5 text-xs text-destructive hover:bg-muted/40"
          >
            {failed} 台没拉到，重试
          </button>
        )}
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
            {rows.map(({ node, cells, loaded, failed: bad }) => (
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
                  if (bad) return <td key={c.id} className="text-right text-xs text-destructive/70" title="hub 忙或网络错误，点上面的「重试」">失败</td>
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
