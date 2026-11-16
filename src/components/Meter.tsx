import type { ReactNode } from "react"

/**
 * 用量条的颜色（1.13.0 起卡片与详情页共用）：≥90% 红、≥75% 黄，其余是那支绿。
 * 原来卡片上的条永远是绿的 —— 硬盘用到 87% 和 7% 看着一样，只有详情页会变色。
 */
export function usageColor(pct: number): string {
  return pct >= 90 ? "var(--destructive)" : pct >= 75 ? "oklch(0.75 0.16 75)" : "var(--ok)"
}

type Props = {
  label: string
  value: ReactNode
  pct: number | null
  /** 悬停说明：核数、已用/总量这类挤不进一格、又不该丢的附加信息。 */
  title?: string
}

/**
 * 一个读数格：表名在上、读数在中、条在下 —— 卡片上三格（CPU / 内存 / 存储）都是它；
 * 第四格「网络」（上行 / 下行两行速率）没有条，由 NodeCard 直接排。
 *
 * 版式照参考站：表名是弱化灰的小字（12px），读数 13px / 600（那一格的重心），条 3px 压在读数
 * 下缘、铺满整格宽。
 *
 * ★ 填色是**绿**（`bg-ok`，2026-10-15 起）：草稿期那版按 2026-10-08 站长的反馈做成了
 * 「前景色 70%」的单色条 —— 那不是因为单色好看，而是因为当时那根 4px 的**近黑**条一页
 * 4×N 根排下来太压人。参考站给的是另一种解法：细一档（3px）、并且用一支清新的绿，
 * 同样不压人，还比灰条透气。判据是**点缀型图形**那一档：`--ok` 合成到白卡上是 2.28:1，
 * 低于正文的 17:1 一大截（站长当初嫌的「突兀」不会再出现）；数值由它正上方的读数承载，
 * 条本身不承担读数，所以不套 3:1 / 4.5:1（护栏 verify_appearance 的下限就是 ≥2）。
 *
 * `pct` 为 null（这台没上报 / 这一项没有上限）时轨道留空、不画填色，读数由调用方写成「—」或
 * 「∞」：一条 0% 的实心条会被读成「用得很少」，而真相是「不知道」。
 */
export function Meter({ label, value, pct, title }: Props) {
  const filled = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div className="min-w-0" title={title}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="tnum mt-0.5 truncate text-[13px] font-semibold leading-[18px]">{value}</div>
      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${filled}%`, background: usageColor(filled) }} />
      </div>
    </div>
  )
}
