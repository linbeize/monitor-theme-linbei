/// <reference types="node" />
import assert from "node:assert/strict"
import type { Node } from "./api.ts"
import {
  applyFilter, daysLeft, DEFAULT_FILTER, isDefault, matches, readFilter, sortNodes, summarize, writeFilter,
} from "./overview.ts"

const NOW = Date.parse("2026-11-16T00:00:00Z")
const metrics = (cpu: number, mem: number, rx: number, tx: number) => ({
  uptime: 1, cpu, load: [0, 0, 0] as [number, number, number], mem_total: 100, mem_used: mem, disk_total: 100, disk_used: 10,
  net_rx: rx, net_tx: tx, total_rx: 0, total_tx: 0, month_rx: 1000, month_tx: 500,
  swap_total: 0, swap_used: 0, tcp: 1, udp: 1, procs: 1,
})
const mk = (id: number, over: Partial<Node>): Node => ({
  id, name: `n${id}`, sort: id, public: true, online: true, country: "US", os: "Debian 12",
  metrics: metrics(10, 50, 100, 10), expires_at: null, ...over,
} as unknown as Node)

const a = mk(1, { name: "Huawei SG", country: "SG", expires_in: 13, metrics: metrics(5, 90, 1, 1) })
const b = mk(2, { name: "Hostdzire SFO", country: "US", expires_in: 294, metrics: metrics(40, 20, 500, 50) })
const c = mk(3, { name: "NNB SHJP", country: "HK", online: false, metrics: null, expires_in: 5 })
const d = mk(4, { name: "tencent hk", country: "hk", public_remark: "CN2 GIA" })
const all = [a, b, c, d]

// ── 查询串往返 ──
assert.equal(writeFilter(DEFAULT_FILTER), "")
assert.deepEqual(readFilter(""), DEFAULT_FILTER)
{
  const f = { q: " hk ", cc: "HK", st: "online" as const, sort: "cpu" as const }
  const s = writeFilter(f)
  assert.equal(s, "?q=hk&cc=HK&st=online&sort=cpu")
  assert.deepEqual(readFilter(s), { ...f, q: "hk" })
}
// 非法值退回默认，国家码归一成两位大写字母。
assert.deepEqual(readFilter("?st=nope&sort=evil&cc=us1x"), { ...DEFAULT_FILTER, cc: "US" })
assert.ok(isDefault(DEFAULT_FILTER))
assert.ok(!isDefault({ ...DEFAULT_FILTER, q: "x" }))
assert.ok(isDefault({ ...DEFAULT_FILTER, q: "   " }))

// ── 剩余天数 ──
assert.equal(daysLeft(mk(9, { expires_in: 3 }), NOW), 3)
assert.equal(daysLeft(mk(9, { expires_at: "2026-11-26T00:00:00Z" }), NOW), 10)
assert.equal(daysLeft(mk(9, { expires_at: null }), NOW), null)
assert.equal(daysLeft(mk(9, { expires_at: "garbage" }), NOW), null)

// ── 筛选 ──
const ids = (list: Node[]) => list.map((n) => n.id)
assert.deepEqual(ids(applyFilter(all, { ...DEFAULT_FILTER, cc: "HK" }, NOW)), [3, 4], "国家码不分大小写")
assert.deepEqual(ids(applyFilter(all, { ...DEFAULT_FILTER, st: "online" }, NOW)), [1, 2, 4])
assert.deepEqual(ids(applyFilter(all, { ...DEFAULT_FILTER, st: "offline" }, NOW)), [3])
assert.deepEqual(ids(applyFilter(all, { ...DEFAULT_FILTER, st: "expiring" }, NOW)), [1, 3])
assert.ok(matches(d, { ...DEFAULT_FILTER, q: "cn2" }, NOW), "公开备注也搜")
assert.ok(matches(a, { ...DEFAULT_FILTER, q: "huawei sg" }, NOW), "多个词都要命中")
assert.ok(!matches(a, { ...DEFAULT_FILTER, q: "huawei us" }, NOW))

// ── 排序：越大越前，拿不到值的沉底，并列保持原序 ──
assert.deepEqual(ids(sortNodes(all, "cpu")), [2, 4, 1, 3])
assert.deepEqual(ids(sortNodes(all, "mem")), [1, 4, 2, 3])
assert.deepEqual(ids(sortNodes(all, "net")), [2, 4, 1, 3])
assert.deepEqual(ids(sortNodes(all, "expiry")), [3, 1, 2, 4], "剩得少的在前，没填到期的沉底")
assert.equal(sortNodes(all, "default"), all)

// ── 汇总 ──
{
  const s = summarize(all, NOW)
  assert.equal(s.total, 4)
  assert.equal(s.online, 3)
  assert.equal(s.rx, 1 + 500 + 100)
  assert.equal(s.tx, 1 + 50 + 10)
  assert.equal(s.expiring, 2)
  assert.deepEqual(s.countries, [["HK", 2], ["SG", 1], ["US", 1]])
}

console.log("首页总览：全部通过")
