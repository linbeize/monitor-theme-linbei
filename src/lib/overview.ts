import type { Node } from "./api.ts"
import { t } from "./i18n.ts"

/**
 * 首页的总览 / 搜索 / 筛选 / 排序（1.12.0）。全是纯函数：App 只管把状态塞进来、把结果画出去。
 *
 * 状态写在列表页的查询串里（`/?q=hk&cc=US&st=online&sort=cpu`）：刷新、分享、从详情页后退回来
 * 都还是同一份筛选。默认值不写进地址栏，所以没筛选时列表地址仍然是干干净净的 `/`。
 */
export type Status = "all" | "online" | "offline" | "expiring"
export type SortKey = "default" | "cpu" | "mem" | "disk" | "net" | "traffic" | "expiry"
export type ListFilter = { q: string; cc: string; st: Status; sort: SortKey }

export const DEFAULT_FILTER: ListFilter = { q: "", cc: "", st: "all", sort: "default" }

/** 标签在渲染时按语言取（`label()`）：模块级常量不能直接存 `t()` 的结果。 */
export const STATUSES: { key: Status; label: () => string }[] = [
  { key: "all", label: () => t("全部", "All") },
  { key: "online", label: () => t("在线", "Online") },
  { key: "offline", label: () => t("离线", "Offline") },
  { key: "expiring", label: () => t("即将到期", "Expiring") },
]

export const SORTS: { key: SortKey; label: () => string }[] = [
  { key: "default", label: () => t("默认排序", "Default order") },
  { key: "cpu", label: () => t("CPU 占用", "CPU usage") },
  { key: "mem", label: () => t("内存占用", "Memory usage") },
  { key: "disk", label: () => t("硬盘占用", "Disk usage") },
  { key: "net", label: () => t("实时网速", "Network speed") },
  { key: "traffic", label: () => t("本月流量", "Monthly traffic") },
  { key: "expiry", label: () => t("剩余天数", "Days left") },
]

/** 「即将到期」的线：30 天内（含已过期）。卡片上 ≤30 天转黄、≤7 天转红，用的是同两条线。 */
export const EXPIRING_DAYS = 30
export const URGENT_DAYS = 7

const isStatus = (v: string | null): v is Status => STATUSES.some((s) => s.key === v)
const isSort = (v: string | null): v is SortKey => SORTS.some((s) => s.key === v)

export function readFilter(search: string): ListFilter {
  const p = new URLSearchParams(search)
  const st = p.get("st")
  const sort = p.get("sort")
  return {
    q: (p.get("q") ?? "").slice(0, 100),
    cc: (p.get("cc") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
    st: isStatus(st) ? st : "all",
    sort: isSort(sort) ? sort : "default",
  }
}

/** 只写非默认的键；全是默认就返回空串（列表地址回到 `/`）。 */
export function writeFilter(f: ListFilter): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set("q", f.q.trim())
  if (f.cc) p.set("cc", f.cc)
  if (f.st !== "all") p.set("st", f.st)
  if (f.sort !== "default") p.set("sort", f.sort)
  const s = p.toString()
  return s ? `?${s}` : ""
}

export const isDefault = (f: ListFilter) => !f.q.trim() && !f.cc && f.st === "all" && f.sort === "default"

/** 有实时数据才算在线（与卡片点绿、列表沉底同一判据）。 */
export const isLive = (n: Node) => Boolean(n.online && n.metrics)

/** 剩余天数：优先 hub 算好的 `expires_in`，旧 hub 退回按 `expires_at` 数；没填到期日是 null。 */
export function daysLeft(n: Node, now = Date.now()): number | null {
  if (typeof n.expires_in === "number" && Number.isFinite(n.expires_in)) return n.expires_in
  if (!n.expires_at) return null
  const t = Date.parse(n.expires_at)
  if (!Number.isFinite(t)) return null
  return Math.ceil((t - now) / 86_400_000)
}

export const isExpiring = (n: Node, now = Date.now()) => {
  const d = daysLeft(n, now)
  return d !== null && d <= EXPIRING_DAYS
}

const ratio = (used: number, total: number) => (total > 0 ? used / total : -1)

/** 每种排序取的值；越大越靠前（剩余天数反过来：越少越靠前）。拿不到值的沉底。 */
function sortValue(n: Node, key: SortKey): number | null {
  const m = n.metrics
  switch (key) {
    case "cpu": return m ? m.cpu : null
    case "mem": return m ? ratio(m.mem_used, m.mem_total) : null
    case "disk": return m ? ratio(m.disk_used, m.disk_total) : null
    case "net": return m ? m.net_rx + m.net_tx : null
    case "traffic": return (m?.month_rx ?? n.month_rx ?? 0) + (m?.month_tx ?? n.month_tx ?? 0)
    case "expiry": { const d = daysLeft(n); return d === null ? null : -d }
    default: return null
  }
}

/** 稳定排序：值相同（或都拿不到）保持原来的先后（也就是站长排序）。 */
export function sortNodes(nodes: Node[], key: SortKey): Node[] {
  if (key === "default") return nodes
  return nodes
    .map((n, i) => ({ n, i, v: sortValue(n, key) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i
      if (a.v === null) return 1
      if (b.v === null) return -1
      return b.v - a.v || a.i - b.i
    })
    .map((x) => x.n)
}

/** 搜索：名字、国家码、系统、公开备注里任意一处包含关键字（不分大小写，空格分隔的词都要命中）。 */
export function matches(n: Node, f: ListFilter, now = Date.now()): boolean {
  if (f.cc && (n.country || "").toUpperCase() !== f.cc) return false
  if (f.st === "online" && !isLive(n)) return false
  if (f.st === "offline" && isLive(n)) return false
  if (f.st === "expiring" && !isExpiring(n, now)) return false
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = [n.name, n.country, n.os, n.public_remark ?? "", n.remark ?? ""].join(" ").toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function applyFilter(nodes: Node[], f: ListFilter, now = Date.now()): Node[] {
  return sortNodes(nodes.filter((n) => matches(n, f, now)), f.sort)
}

export type Summary = {
  total: number
  online: number
  /** 在线机器的实时总速率（B/s）。 */
  rx: number
  tx: number
  /** 本月累计流量（上下行之和）。 */
  month: number
  expiring: number
  /** 地区 → 台数，按台数从多到少（同数按国家码）。没有国家码的不进来。 */
  countries: [string, number][]
}

export function summarize(nodes: Node[], now = Date.now()): Summary {
  const out: Summary = { total: nodes.length, online: 0, rx: 0, tx: 0, month: 0, expiring: 0, countries: [] }
  const cc = new Map<string, number>()
  for (const n of nodes) {
    const m = n.metrics
    if (isLive(n) && m) {
      out.online += 1
      out.rx += m.net_rx
      out.tx += m.net_tx
    }
    out.month += (m?.month_rx ?? n.month_rx ?? 0) + (m?.month_tx ?? n.month_tx ?? 0)
    if (isExpiring(n, now)) out.expiring += 1
    const c = (n.country || "").toUpperCase()
    if (/^[A-Z]{2}$/.test(c)) cc.set(c, (cc.get(c) ?? 0) + 1)
  }
  out.countries = [...cc].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return out
}
