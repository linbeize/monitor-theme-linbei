import { Activity, Search, X } from "lucide-react"

import type { Node } from "@/lib/api"
import { convert, monthlyCost } from "@/lib/cost"
import { bytes, money, rate } from "@/lib/format"
import { FX_SOURCE, useRates } from "@/lib/fx"
import {
  DEFAULT_FILTER, isDefault, SORTS, STATUSES, summarize, type ListFilter, type Summary,
} from "@/lib/overview"
import { plural, t as tr } from "@/lib/i18n"

/**
 * 首页卡片上方的两块（1.12.0）：
 *   ① 总览条：在线台数、实时总网速、本月总流量、每月成本（1.15.0 起替掉「即将到期」，到期台数挪到状态筛选上）；
 *   ② 筛选栏：搜索框、状态、排序，下面一行地区（国旗 + 台数，点一下只看这个地区，再点取消）。
 * 筛选只是「看哪几张卡」，不改卡片本身；状态由 App 持有并同步进地址栏（见 @/lib/overview）。
 */
export function Overview({ nodes, filter, onChange, shown, onCompare }: {
  nodes: Node[]
  filter: ListFilter
  onChange: (next: ListFilter) => void
  /** 筛完还剩几台（与 nodes.length 不同时显示「N / 共 M 台」）。 */
  shown: number
  /** 进延迟对比页。 */
  onCompare: () => void
}) {
  const s: Summary = summarize(nodes)
  const set = (patch: Partial<ListFilter>) => onChange({ ...filter, ...patch })
  const filtering = !isDefault({ ...filter, sort: "default" })

  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={tr("在线", "Online")} value={`${s.online} / ${s.total}`} sub={s.online < s.total ? tr(`${s.total - s.online} 台离线`, `${s.total - s.online} offline`) : tr("全部在线", "All online")} />
        <Tile label={tr("实时总网速", "Total speed")} value={`↓ ${rate(s.rx)}`} sub={`↑ ${rate(s.tx)}`} />
        <Tile label={tr("本月总流量", "Traffic this month")} value={bytes(s.month)} sub={tr("所有机器上下行合计", "Up + down, all nodes")} />
        <CostTile nodes={nodes} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={tr("搜索名字、地区、系统、备注", "Search name, region, OS, notes")}
            aria-label={tr("搜索节点", "Search nodes")}
            className="h-8 w-full rounded-lg border bg-card pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label={tr("按状态筛选", "Filter by status")}>
          {STATUSES.map((st) => (
            <button
              key={st.key}
              type="button"
              aria-pressed={filter.st === st.key}
              onClick={() => set({ st: st.key })}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                filter.st === st.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {st.label()}
              {/* 「即将到期」那颗带上台数（1.15.0：总览条那格换成了每月成本，到期数挪到这里）。 */}
              {st.key === "expiring" && s.expiring > 0 && (
                <span className={`ml-1 tabular-nums ${filter.st === st.key ? "" : "text-[oklch(0.62_0.16_60)]"}`}>{s.expiring}</span>
              )}
            </button>
          ))}
        </div>
        <select
          value={filter.sort}
          onChange={(e) => set({ sort: e.target.value as ListFilter["sort"] })}
          aria-label={tr("排序", "Sort")}
          className="h-8 rounded-lg border bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {SORTS.map((o) => (
            <option key={o.key} value={o.key}>{o.label()}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCompare}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Activity className="size-3.5" aria-hidden />{tr("延迟对比", "Latency")}
        </button>
      </div>

      {s.countries.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tr("按地区筛选", "Filter by region")}>
          {s.countries.map(([cc, count]) => (
            <button
              key={cc}
              type="button"
              aria-pressed={filter.cc === cc}
              onClick={() => set({ cc: filter.cc === cc ? "" : cc })}
              title={cc}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors ${
                filter.cc === cc ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <img src={`/flags/${cc}.svg`} alt="" width={16} height={12} loading="lazy"
                className="h-3 w-4 rounded-[2px] object-cover ring-1 ring-border/70" />
              {cc} {count}
            </button>
          ))}
        </div>
      )}

      {filtering && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{tr(`显示 ${shown} / 共 ${s.total} 台`, `Showing ${shown} of ${s.total}`)}</span>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTER, sort: filter.sort })}
            className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
          >
            <X className="size-3" aria-hidden />{tr("清除筛选", "Clear filters")}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 每月成本（1.15.0，替掉原来的「即将到期」那格）：付费机器按周期折到每月、按币种加总，
 * 再按实时汇率折成人民币（@/lib/cost、@/lib/fx）。汇率取不到时分币种显示「¥x + $y」。
 * 悬停看分币种明细与汇率；ExchangeRate-API 的条款要求注明来源，所以下面那行小字带个链接。
 */
function CostTile({ nodes }: { nodes: Node[] }) {
  const cost = monthlyCost(nodes)
  const base = "CNY"
  const rates = useRates(base, cost.byCurrency.size > 0)
  const total = rates ? convert(cost.byCurrency, rates.rates, base) : null
  const parts = [...cost.byCurrency].sort((a, b) => b[1] - a[1]).map(([cur, amt]) => money(amt, cur))
  const per = tr("/月", "/mo")
  const value = cost.paid === 0 ? "—" : total !== null ? `¥${amount(total)}${per}` : parts.join(" + ")
  const rateNote = rates
    ? [...cost.byCurrency.keys()].filter((c) => c && c !== base && rates.rates[c]).map((c) => `1 ${c} ≈ ${(1 / rates.rates[c]).toFixed(2)} ${base}`).join(" · ")
    : ""
  const title = [parts.join(" + ") + per, rateNote, cost.skipped ? tr(`另有 ${cost.skipped} 台一次性付款未计入`, `${cost.skipped} one-time payment(s) not included`) : ""]
    .filter(Boolean).join("\n")
  const count = tr(`${cost.paid} 台付费`, plural(cost.paid, "paid node"))
  return (
    <Tile
      label={tr("每月成本", "Monthly cost")}
      value={value}
      title={cost.paid ? title : undefined}
      sub={total !== null ? (
        <>
          {count} · <a href={FX_SOURCE} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{tr("实时汇率", "live FX")}</a>
        </>
      ) : cost.byCurrency.size > 1 ? `${count} · ${tr("未换算", "not converted")}` : count}
    />
  )
}

/** 金额：百元以上取整、带千分位；以下留两位。 */
const amount = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2))

function Tile({ label, value, sub, tone, active, onClick, title }: {
  label: string
  value: string
  sub: React.ReactNode
  tone?: "warn"
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="tnum mt-0.5 truncate text-[15px] font-semibold leading-5"
        style={tone === "warn" ? { color: "oklch(0.62 0.16 60)" } : undefined}
      >
        {value}
      </div>
      <div className="tnum truncate text-xs text-muted-foreground">{sub}</div>
    </>
  )
  const cls = `min-w-0 rounded-xl border bg-card px-3 py-2.5 text-left ${active ? "ring-2 ring-foreground/70" : ""}`
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} transition-colors hover:bg-muted/40`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title}>{body}</div>
  )
}
