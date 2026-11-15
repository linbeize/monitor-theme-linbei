/**
 * 延迟统计表的那几个数（Smokeping 图底下那张表的同类）。
 *
 * 输入是一条线路在当前窗口里的逐桶延迟（hub 已按 `points` 分好桶，每桶是那段时间的中位延迟；
 * 超时桶是 null）。所以这里的平均 / 中位 / P95 是**桶中位数**的统计，量程越长越平滑——
 * 这和图上画的是同一份数，表与图对得上。丢包率不在这里算：hub 单独给了按样本数加权的
 * `loss[id]`，比拿各桶百分比再平均准。
 */
export type PingStats = {
  /** 最近一个答上来的桶。 */
  now: number | null
  avg: number | null
  median: number | null
  p95: number | null
  min: number | null
  max: number | null
  /** 抖动：相邻两个答上来的桶之间延迟差的平均值（RFC 3550 那种口径的简化版）。 */
  jitter: number | null
  /** 答上来的桶数（0 表示整段都超时或没数据）。 */
  samples: number
}

const EMPTY: PingStats = { now: null, avg: null, median: null, p95: null, min: null, max: null, jitter: null, samples: 0 }

/** 线性插值的分位数（sorted 必须升序、非空）。 */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function pingStats(latencies: (number | null | undefined)[]): PingStats {
  const ok: number[] = []
  for (const v of latencies) if (typeof v === "number" && Number.isFinite(v)) ok.push(v)
  if (!ok.length) return EMPTY
  let sum = 0
  let diff = 0
  for (let i = 0; i < ok.length; i++) {
    sum += ok[i]
    if (i > 0) diff += Math.abs(ok[i] - ok[i - 1])
  }
  const sorted = [...ok].sort((a, b) => a - b)
  return {
    now: ok[ok.length - 1],
    avg: sum / ok.length,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    jitter: ok.length > 1 ? diff / (ok.length - 1) : null,
    samples: ok.length,
  }
}

/** 表里的毫秒数：10ms 以下留一位小数（Cloudflare 那种 1.4ms 的线路），其余取整。 */
export function ms(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—"
  return v < 10 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v))
}
