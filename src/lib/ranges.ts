import { t } from "./i18n.ts"
/**
 * 「时间范围」那排按钮：按 hub 的保留天数生成。
 *
 * hub 1.3.2 起保留天数可设 1~365 天（默认 30），而 `/api/nodes/{id}/metrics` 的 `hours`
 * 上限也从「匿名 168、登录 2160」改成**保留天数本身**（登录与匿名相同）。所以按钮不能再写死
 * 那一排 1/6/24 小时/7 天：站长把保留天数调到 90 天，访客却只有 7 天可点；调到 3 天，点 7 天
 * 又会拿到被静默收窄的结果（图与按钮上的字对不上）。
 *
 * 老 hub 没有 `history_days`（`/api/me` 里那个字段），那时上限就还是 168 小时，按 7 天算 ——
 * 算出来正好是 1.15.x 那排按钮（1 小时 / 6 小时 / 24 小时 / 7 天），逐字不变。
 *
 * 三条规则：
 *   · 1 / 6 / 24 小时永远在：保留天数最小是 1 天，这三档都取得到；
 *   · 7 天、30 天「够得着才出现」（严格小于保留天数，免得和最后那枚重复）；
 *   · 最后补一枚**保留天数本身**，站长把保留天数设成 14 天这种非整档的值时也有个完整窗口。
 * 最多 6 枚（1 小时 / 6 小时 / 24 小时 / 7 天 / 30 天 / 保留天数）——再多一行放不下。
 */
const BASE = [
  { hours: 1 },
  { hours: 6 },
  { hours: 24 },
]

/** 保留天数这座「阶梯」：够得着才摆出来。 */
const LADDER = [7, 30]

export type Range = { hours: number; label: string }

/** 按钮上的字：整天的写「N 天」，其余写「N 小时」（按当前语言）。 */
export function rangeLabel(hours: number): string {
  if (hours > 24 && hours % 24 === 0) {
    const d = hours / 24
    return t(`${d} 天`, `${d} ${d === 1 ? "day" : "days"}`)
  }
  return t(`${hours} 小时`, `${hours} ${hours === 1 ? "hour" : "hours"}`)
}

export function rangesFor(days: unknown): Range[] {
  // 类型不对（老 hub 没有这个字段、站长存的不是数字）一律按 7 天。
  const n = typeof days === "number" && Number.isFinite(days) ? Math.floor(days) : 7
  // hub 自己把保留天数钳在 1~365；这边再钳一次，免得一个手改的值把按钮排成 400 枚。
  const hours = Math.min(365, Math.max(1, n)) * 24
  const out: Range[] = BASE.map((r) => ({ hours: r.hours, label: rangeLabel(r.hours) }))
  for (const d of LADDER) if (d * 24 < hours && !out.some((r) => r.hours === d * 24)) out.push({ hours: d * 24, label: rangeLabel(d * 24) })
  if (hours > 24 && !out.some((r) => r.hours === hours)) out.push({ hours, label: rangeLabel(hours) })
  return out
}
