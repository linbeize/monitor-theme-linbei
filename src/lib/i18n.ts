import { useSyncExternalStore } from "react"

/**
 * 中英双语（1.14.0）。不引依赖：一份模块级的「当前语言」+ 订阅，文案就地写成 `t("中文", "English")`。
 *
 *   · 默认跟浏览器：`navigator.languages` 里排在最前、且是中文或英文的那一项说了算；
 *     都不是（日文、德文……）就用英文 —— 状态页的访客里，不读中文的人读英文的可能性最大。
 *   · 访客在右上角手动切过，就记在 localStorage（`lang`），以后以它为准；切回与浏览器一致的
 *     那一档＝删掉记录、重新跟浏览器走（与明暗那枚开关同一套口径）。
 *   · App 顶层订阅它（useLang），语言一变整棵树重渲染，各处 `t()` 在渲染时现取当前语言。
 *     所以 **`t()` 只能在渲染期间（或渲染期调用的函数里）用**，不能拿去初始化模块级常量。
 *
 * 不翻译的：hub 下发的内容（站名、节点名、备注、探测线路名）、日期数字格式、hub 返回的报错原文。
 */
export type Lang = "zh" | "en"

const KEY = "lang"
const browser = typeof window !== "undefined"

/** 浏览器偏好的语言（不看手动记录）。非浏览器环境（单测）固定中文，免得 Node 的 navigator 改了断言。 */
export function browserLang(): Lang {
  if (!browser || typeof navigator === "undefined") return "zh"
  const list = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of list) {
    const l = String(raw || "").toLowerCase()
    if (l.startsWith("zh")) return "zh"
    if (l.startsWith("en")) return "en"
  }
  return "en"
}

function saved(): Lang | null {
  if (!browser) return null
  try {
    const v = localStorage.getItem(KEY)
    return v === "zh" || v === "en" ? v : null
  } catch {
    return null
  }
}

let current: Lang = saved() ?? browserLang()
const listeners = new Set<() => void>()

function apply() {
  if (browser) document.documentElement.lang = current === "zh" ? "zh-CN" : "en"
}
apply()

export const getLang = () => current

export function setLang(next: Lang) {
  if (next === current) return
  current = next
  if (browser) {
    try {
      if (next === browserLang()) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch { /* 隐私模式写不进去也无所谓，本次会话照样生效 */ }
  }
  apply()
  for (const f of listeners) f()
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

/** 订阅当前语言（App 顶层用一次即可；其余组件随它重渲染）。 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

/** 当前语言下的那一句。 */
export const t = (zh: string, en: string): string => (current === "en" ? en : zh)

/** 英文的单复数：`plural(3, "node")` → "3 nodes"。中文不需要。 */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
