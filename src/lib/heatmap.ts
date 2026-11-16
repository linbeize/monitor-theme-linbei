/**
 * 延迟 / 丢包热力图（1.13.0）：一条线路一张，行是日期、列是一天 24 小时（访客本地时间）。
 * 晚高峰丢包在图上是每天同一位置的一条竖带，比折线好认得多。
 *
 * 输入是详情页已经拉回来的那份逐桶数据（不多发请求）；一格 = 落在那一小时里的所有桶：
 *   · 丢包 = 这些桶丢包率的平均（桶大小相同，等权平均就是按时长加权）；
 *   · 延迟 = 这些桶中位延迟的中位数（全超时的桶不算）。
 */
export type HeatPoint = { ts: number; latency: number | null; loss?: number }
export type HeatCell = { loss: number | null; median: number | null; n: number }
export type HeatGrid = { labels: string[]; cells: HeatCell[][] }

/** 把秒级时间戳落到「哪一天、几点」：默认按访客本地时区；测试里换成 UTC。 */
export type Clock = (ms: number) => { day: string; label: string; hour: number }

export const localClock: Clock = (ms) => {
  const d = new Date(ms)
  return {
    day: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
    label: `${d.getMonth() + 1}/${d.getDate()}`,
    hour: d.getHours(),
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function heatGrid(points: HeatPoint[], clock: Clock = localClock): HeatGrid {
  const days = new Map<string, { label: string; hours: { loss: number[]; lat: number[] }[] }>()
  const order: string[] = []
  for (const p of [...points].sort((a, b) => a.ts - b.ts)) {
    const { day, label, hour } = clock(p.ts * 1000)
    let row = days.get(day)
    if (!row) {
      row = { label, hours: Array.from({ length: 24 }, () => ({ loss: [], lat: [] })) }
      days.set(day, row)
      order.push(day)
    }
    const cell = row.hours[hour]
    cell.loss.push(typeof p.loss === "number" && Number.isFinite(p.loss) ? p.loss : p.latency === null ? 100 : 0)
    if (typeof p.latency === "number" && Number.isFinite(p.latency)) cell.lat.push(p.latency)
  }
  return {
    labels: order.map((d) => days.get(d)!.label),
    cells: order.map((d) =>
      days.get(d)!.hours.map((h) => ({
        loss: h.loss.length ? h.loss.reduce((a, b) => a + b, 0) / h.loss.length : null,
        median: median(h.lat),
        n: h.loss.length,
      })),
    ),
  }
}

/** 整张图的延迟色阶两端：格子中位数的 5% / 95% 分位（个别爆表格子不把色阶拉坏）。 */
export function latencySpan(grid: HeatGrid): [number, number] | null {
  const xs = grid.cells.flat().map((c) => c.median).filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (!xs.length) return null
  const at = (q: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round((xs.length - 1) * q)))]
  return [at(0.05), at(0.95)]
}

/** 丢包格的颜色：0 是淡绿，有丢包就往红走，30% 以上算满档。 */
export function lossTint(loss: number): string {
  if (loss <= 0) return "oklch(0.72 0.15 150 / 0.28)"
  const t = Math.min(1, loss / 30)
  return `oklch(0.62 0.2 25 / ${(0.25 + 0.75 * t).toFixed(2)})`
}

/** 延迟格的颜色：色阶内从绿到红（色相 150 → 25）。 */
export function latencyHeat(value: number, span: [number, number]): string {
  const [lo, hi] = span
  const t = hi > lo ? Math.min(1, Math.max(0, (value - lo) / (hi - lo))) : 0
  return `oklch(0.72 0.16 ${Math.round(150 - 125 * t)} / 0.75)`
}
