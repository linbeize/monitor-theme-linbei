import { useEffect, useState } from "react"

/**
 * 汇率（1.15.0，首页「每月成本」用）：访客浏览器直接取 open.er-api.com 的免费接口
 * （ExchangeRate-API，免 key、允许跨域，每天更新一次；条款要求页面上注明来源 —— 见 Overview 那格的链接）。
 *
 *   · 结果在访客本地缓存 12 小时（localStorage），同一个访客一天最多请求两次；
 *   · 取不到（断网、接口挂了、被拦）就返回 null，调用方退回「分币种显示」，页面不报错。
 */
export const FX_SOURCE = "https://www.exchangerate-api.com"
const URL_FOR = (base: string) => `https://open.er-api.com/v6/latest/${base}`
const TTL = 12 * 3600_000
const TIMEOUT = 8000

export type Rates = { base: string; rates: Record<string, number>; updated: number }

function readCache(base: string): Rates | null {
  try {
    const raw = localStorage.getItem(`fx:${base}`)
    if (!raw) return null
    const v = JSON.parse(raw) as Rates & { at: number }
    if (!v || typeof v.at !== "number" || Date.now() - v.at > TTL || typeof v.rates !== "object") return null
    return { base: v.base, rates: v.rates, updated: v.updated }
  } catch {
    return null
  }
}

/** 只认形状对的回包：`result: "success"`、`rates` 是「代码 → 正数」。 */
export function parseRates(body: unknown, base: string): Rates | null {
  if (!body || typeof body !== "object") return null
  const b = body as { result?: unknown; base_code?: unknown; rates?: unknown; time_last_update_unix?: unknown }
  if (b.result !== "success" || b.base_code !== base || !b.rates || typeof b.rates !== "object") return null
  const rates: Record<string, number> = {}
  for (const [k, v] of Object.entries(b.rates as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(k) && typeof v === "number" && Number.isFinite(v) && v > 0) rates[k] = v
  }
  if (!Object.keys(rates).length) return null
  const updated = typeof b.time_last_update_unix === "number" ? b.time_last_update_unix * 1000 : Date.now()
  return { base, rates, updated }
}

export function useRates(base: string, enabled: boolean): Rates | null {
  const [rates, setRates] = useState<Rates | null>(() => (enabled ? readCache(base) : null))
  useEffect(() => {
    if (!enabled || rates) return
    const control = new AbortController()
    const timer = setTimeout(() => control.abort(), TIMEOUT)
    fetch(URL_FOR(base), { signal: control.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const got = parseRates(body, base)
        if (!got) return
        try { localStorage.setItem(`fx:${base}`, JSON.stringify({ ...got, at: Date.now() })) } catch { /* 写不进也无所谓 */ }
        setRates(got)
      })
      .catch(() => { /* 取不到就分币种显示 */ })
      .finally(() => clearTimeout(timer))
    return () => { clearTimeout(timer); control.abort() }
  }, [base, enabled, rates])
  return rates
}
