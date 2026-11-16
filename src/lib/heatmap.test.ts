/// <reference types="node" />
import assert from "node:assert/strict"
import { heatGrid, latencyHeat, latencySpan, lossTint, type Clock } from "./heatmap.ts"

const utc: Clock = (ms) => {
  const d = new Date(ms)
  return { day: d.toISOString().slice(0, 10), label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, hour: d.getUTCHours() }
}
const at = (iso: string) => Date.parse(iso) / 1000

const grid = heatGrid([
  // 11/15 22 点：两桶，一桶丢 50%、一桶不丢 → 平均 25%；延迟中位 (200+210)/2
  { ts: at("2026-11-15T22:10:00Z"), latency: 200, loss: 50 },
  { ts: at("2026-11-15T22:40:00Z"), latency: 210 },
  // 全超时的桶：没有 loss 键也按 100% 算，延迟不进中位数
  { ts: at("2026-11-15T23:05:00Z"), latency: null },
  // 乱序输入也按时间排
  { ts: at("2026-11-14T03:00:00Z"), latency: 150 },
], utc)

assert.deepEqual(grid.labels, ["11/14", "11/15"])
assert.equal(grid.cells.length, 2)
assert.equal(grid.cells[0].length, 24)
assert.deepEqual(grid.cells[1][22], { loss: 25, median: 205, n: 2 })
assert.deepEqual(grid.cells[1][23], { loss: 100, median: null, n: 1 })
assert.deepEqual(grid.cells[0][3], { loss: 0, median: 150, n: 1 })
assert.deepEqual(grid.cells[0][4], { loss: null, median: null, n: 0 }, "没有数据的小时是空格")

assert.deepEqual(heatGrid([], utc), { labels: [], cells: [] })

// 色阶取 5% / 95% 分位
{
  const g = heatGrid(Array.from({ length: 21 }, (_, i) => ({ ts: at("2026-11-15T00:00:00Z") + i * 3600 * 1, latency: 100 + i })), utc)
  const span = latencySpan(g)
  assert.ok(span && span[0] >= 100 && span[1] <= 120 && span[0] < span[1])
}
assert.equal(latencySpan({ labels: [], cells: [] }), null)

assert.equal(lossTint(0), "oklch(0.72 0.15 150 / 0.28)")
assert.equal(lossTint(30), "oklch(0.62 0.2 25 / 1.00)")
assert.equal(lossTint(90), "oklch(0.62 0.2 25 / 1.00)", "30% 以上封顶")
assert.equal(latencyHeat(100, [100, 200]), "oklch(0.72 0.16 150 / 0.75)")
assert.equal(latencyHeat(200, [100, 200]), "oklch(0.72 0.16 25 / 0.75)")

console.log("热力图：全部通过")
