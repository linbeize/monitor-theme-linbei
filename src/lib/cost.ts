import type { Node } from "./api.ts"

/**
 * 首页「每月成本」（1.15.0）：所有付费机器折算到每月、按币种加总，再用汇率折成人民币。
 *
 *   · 只算 price > 0 且周期认得出来的；一次性付款（once）没有「每月」可言，不进总数，单独计数；
 *   · 先按币种分开加（这一步不依赖汇率，永远准），换算是最后一步、可以失败（失败就分币种显示）。
 */
export const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
}

export type MonthlyCost = {
  /** 币种 → 每月金额（币种代码大写；hub 没填币种的记成 ""）。 */
  byCurrency: Map<string, number>
  /** 计入每月成本的台数。 */
  paid: number
  /** 一次性付款、或周期认不出来的付费机器（不进每月成本）。 */
  skipped: number
}

const isPrice = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0

export function monthlyCost(nodes: Node[]): MonthlyCost {
  const byCurrency = new Map<string, number>()
  let paid = 0
  let skipped = 0
  for (const n of nodes) {
    if (!isPrice(n.price)) continue
    const months = Object.hasOwn(CYCLE_MONTHS, n.billing_cycle) ? CYCLE_MONTHS[n.billing_cycle] : 0
    if (!months) {
      skipped += 1
      continue
    }
    const cur = typeof n.currency === "string" ? n.currency.trim().toUpperCase() : ""
    byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + n.price / months)
    paid += 1
  }
  return { byCurrency, paid, skipped }
}

/**
 * 折成 `base`：`rates[X]` 是「1 个 base 能换多少 X」（open.er-api.com 的口径）。
 * 任何一个币种没有汇率（或币种没填）就返回 null —— 宁可不折，也不给一个漏算的总数。
 */
export function convert(byCurrency: Map<string, number>, rates: Record<string, number>, base: string): number | null {
  let total = 0
  for (const [cur, amount] of byCurrency) {
    if (cur === base) {
      total += amount
      continue
    }
    const r = rates[cur]
    if (!cur || typeof r !== "number" || !Number.isFinite(r) || r <= 0) return null
    total += amount / r
  }
  return total
}
