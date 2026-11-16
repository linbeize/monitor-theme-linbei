/// <reference types="node" />
import assert from "node:assert/strict"
import { cellsOf, columnRange, columnsOf, latencyTint, sortByProbe, type NodePing } from "./compare.ts"

const a: NodePing = {
  probes: { "1": "CU", "2": "CT" },
  ping: [
    { task_id: 2, ts: 3, latency: 180 },
    { task_id: 1, ts: 1, latency: 200 },
    { task_id: 1, ts: 2, latency: null },
    { task_id: 1, ts: 3, latency: 220 },
    { task_id: 2, ts: 1, latency: 170 },
  ],
  loss: { "1": 33.3 },
}
const b: NodePing = { probes: { "3": "CM", "1": "联通" }, ping: [{ task_id: 3, ts: 1, latency: 90 }, { task_id: 1, ts: 1, latency: null }] }

// ── 单台：按线路分组，超时不进中位数，丢包取 hub 给的 ──
{
  const c = cellsOf(a)
  assert.equal(c.get(1)?.median, 210)
  assert.equal(c.get(1)?.loss, 33.3)
  assert.equal(c.get(1)?.samples, 2)
  assert.equal(c.get(2)?.median, 175)
  assert.equal(c.get(2)?.loss, 0)
}
assert.equal(cellsOf(undefined).size, 0)
assert.equal(cellsOf({}).size, 0)

// ── 表头：并集、按 id 排，名字取第一份 ──
assert.deepEqual(columnsOf([a, undefined, b]), [{ id: 1, name: "CU" }, { id: 2, name: "CT" }, { id: 3, name: "CM" }])

// ── 排序：低延迟在前，全丢（median null）与没这条线路的沉底 ──
{
  const rows = [
    { n: "a", cells: cellsOf(a) },
    { n: "b", cells: cellsOf(b) },
    { n: "c", cells: cellsOf({ ping: [{ task_id: 1, ts: 1, latency: 150 }] }) },
  ]
  assert.deepEqual(sortByProbe(rows, 1).map((r) => r.n), ["c", "a", "b"])
  assert.deepEqual(sortByProbe(rows, 3).map((r) => r.n), ["b", "a", "c"])
  assert.equal(sortByProbe(rows, null), rows)
  assert.deepEqual(columnRange(rows, 1), [150, 210])
  assert.equal(columnRange(rows, 9), null)
}

// ── 上色：最快绿（150）、最慢红（25），只有一个值时算最快 ──
assert.equal(latencyTint(150, [150, 210]), "oklch(0.75 0.15 150 / 0.2)")
assert.equal(latencyTint(210, [150, 210]), "oklch(0.75 0.15 25 / 0.2)")
assert.equal(latencyTint(99, [99, 99]), "oklch(0.75 0.15 150 / 0.2)")

console.log("延迟对比：全部通过")
