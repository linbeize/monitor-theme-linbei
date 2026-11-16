import { pingStats } from "./pingstats.ts"

/**
 * 「延迟对比」页（1.13.0）：所有节点 × 所有探测线路一张表。
 *
 * 数据是逐台拉的 `/api/nodes/{id}/metrics?series=ping`（hub 没有一次拿全部节点延迟的接口），
 * 每台只要很少几个桶（见 POINTS），一格取「桶中位数的中位数」—— 与详情页统计表的「中位」同一口径。
 */
export type NodePing = {
  probes?: Record<string, string>
  ping?: { task_id: number; ts: number; latency: number | null }[]
  loss?: Record<string, number>
}

export type Cell = { median: number | null; loss: number; samples: number }

/** 每个时间范围向 hub 要几个桶：够算中位数就行，越少越省（36 台 × 4 条线路）。 */
export const POINTS: Record<number, number> = { 1: 60, 6: 72, 24: 96 }

export function cellsOf(d: NodePing | undefined): Map<number, Cell> {
  const out = new Map<number, Cell>()
  if (!d || !Array.isArray(d.ping)) return out
  const by = new Map<number, { ts: number; latency: number | null }[]>()
  for (const p of d.ping) {
    if (!p || typeof p.task_id !== "number") continue
    const list = by.get(p.task_id) ?? []
    list.push(p)
    by.set(p.task_id, list)
  }
  for (const [id, list] of by) {
    list.sort((a, b) => a.ts - b.ts)
    const st = pingStats(list.map((p) => p.latency))
    const loss = d.loss?.[String(id)]
    out.set(id, { median: st.median, loss: typeof loss === "number" && Number.isFinite(loss) ? loss : 0, samples: st.samples })
  }
  return out
}

/** 表头：所有节点出现过的线路，按 task id 排（hub 后台的任务顺序），名字取第一份报上来的。 */
export function columnsOf(all: (NodePing | undefined)[]): { id: number; name: string }[] {
  const names = new Map<number, string>()
  for (const d of all) {
    if (!d) continue
    const seen = new Set((d.ping ?? []).map((p) => p.task_id))
    for (const id of seen) {
      if (typeof id !== "number" || names.has(id)) continue
      names.set(id, d.probes?.[String(id)] ?? `探测 ${id}`)
    }
  }
  return [...names].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name }))
}

/**
 * 按某条线路的中位延迟从低到高排；拿不到值的沉底，并列保持原序。`by` 为 null 时原样返回。
 * 全丢（有探测、但一个包都没回）算「拿不到值」—— 它不是最快的。
 */
export function sortByProbe<T extends { cells: Map<number, Cell> }>(rows: T[], by: number | null): T[] {
  if (by === null) return rows
  const v = (r: T) => r.cells.get(by)?.median ?? null
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = v(a.r)
      const y = v(b.r)
      if (x === null && y === null) return a.i - b.i
      if (x === null) return 1
      if (y === null) return -1
      return x - y || a.i - b.i
    })
    .map((e) => e.r)
}

/** 一列里的最低 / 最高中位延迟（给格子上色用）；整列都没值是 null。 */
export function columnRange(rows: { cells: Map<number, Cell> }[], id: number): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const r of rows) {
    const m = r.cells.get(id)?.median
    if (m === null || m === undefined) continue
    if (m < lo) lo = m
    if (m > hi) hi = m
  }
  return lo === Infinity ? null : [lo, hi]
}

/**
 * 格子底色：列内最快的偏绿、最慢的偏红（oklch 色相 150 → 25）。按列内名次的比例算，
 * 不是绝对毫秒 —— 美西机器整列 200ms 也该分出快慢。
 */
export function latencyTint(value: number, range: [number, number]): string {
  const [lo, hi] = range
  const t = hi > lo ? Math.min(1, Math.max(0, (value - lo) / (hi - lo))) : 0
  return `oklch(0.75 0.15 ${Math.round(150 - 125 * t)} / 0.2)`
}
