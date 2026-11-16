import { Activity, Search, X } from "lucide-react"

import type { Node } from "@/lib/api"
import { bytes, rate } from "@/lib/format"
import {
  DEFAULT_FILTER, EXPIRING_DAYS, isDefault, SORTS, STATUSES, summarize, type ListFilter, type Summary,
} from "@/lib/overview"

/**
 * 首页卡片上方的两块（1.12.0）：
 *   ① 总览条：在线台数、实时总网速、本月总流量、即将到期台数（点它＝筛出那几台）；
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
        <Tile label="在线" value={`${s.online} / ${s.total}`} sub={s.online < s.total ? `${s.total - s.online} 台离线` : "全部在线"} />
        <Tile label="实时总网速" value={`↓ ${rate(s.rx)}`} sub={`↑ ${rate(s.tx)}`} />
        <Tile label="本月总流量" value={bytes(s.month)} sub="所有机器上下行合计" />
        <Tile
          label="即将到期"
          value={`${s.expiring} 台`}
          sub={`${EXPIRING_DAYS} 天内（含已过期）`}
          tone={s.expiring > 0 ? "warn" : undefined}
          active={filter.st === "expiring"}
          onClick={s.expiring > 0 ? () => set({ st: filter.st === "expiring" ? "all" : "expiring" }) : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={filter.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="搜索名字、地区、系统、备注"
            aria-label="搜索节点"
            className="h-8 w-full rounded-lg border bg-card pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>
        <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="按状态筛选">
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
              {st.label}
            </button>
          ))}
        </div>
        <select
          value={filter.sort}
          onChange={(e) => set({ sort: e.target.value as ListFilter["sort"] })}
          aria-label="排序"
          className="h-8 rounded-lg border bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {SORTS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCompare}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Activity className="size-3.5" aria-hidden />延迟对比
        </button>
      </div>

      {s.countries.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按地区筛选">
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
          <span>显示 {shown} / 共 {s.total} 台</span>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTER, sort: filter.sort })}
            className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
          >
            <X className="size-3" aria-hidden />清除筛选
          </button>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, sub, tone, active, onClick }: {
  label: string
  value: string
  sub: string
  tone?: "warn"
  active?: boolean
  onClick?: () => void
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
    <div className={cls}>{body}</div>
  )
}
