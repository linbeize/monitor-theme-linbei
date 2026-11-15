import assert from "node:assert/strict"

import { ms, pingStats } from "./pingstats.ts"

// 空 / 全超时：每一格都是 null，samples 0。
assert.deepEqual(pingStats([]), { now: null, avg: null, median: null, p95: null, min: null, max: null, jitter: null, samples: 0 })
assert.equal(pingStats([null, null, undefined]).samples, 0)

// 超时桶不进统计，「当前」取最后一个答上来的。
{
  const s = pingStats([100, null, 110, 120, null])
  assert.equal(s.samples, 3)
  assert.equal(s.now, 120)
  assert.equal(s.avg, 110)
  assert.equal(s.median, 110)
  assert.equal(s.min, 100)
  assert.equal(s.max, 120)
  // 相邻差 10、10 → 平均 10（跨过超时桶的那一对照样算相邻）。
  assert.equal(s.jitter, 10)
}

// P95 线性插值：1..100 的 P95 = 95.05。
{
  const s = pingStats(Array.from({ length: 100 }, (_, i) => i + 1))
  assert.ok(Math.abs((s.p95 ?? 0) - 95.05) < 1e-9)
  assert.equal(s.median, 50.5)
}

// 单个样本：没有抖动可言。
assert.equal(pingStats([42]).jitter, null)

// NaN / Infinity 当没数据。
assert.equal(pingStats([NaN, Infinity, 5]).samples, 1)

// 毫秒格式：<10 留一位小数（整数不带 .0），其余取整；null 是破折号。
assert.equal(ms(null), "—")
assert.equal(ms(1.44), "1.4")
assert.equal(ms(1), "1")
assert.equal(ms(9.96), "10")
assert.equal(ms(208.6), "209")

console.log("延迟统计：全部通过")
