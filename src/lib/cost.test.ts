/// <reference types="node" />
import assert from "node:assert/strict"
import type { Node } from "./api.ts"
import { convert, monthlyCost } from "./cost.ts"
import { parseRates } from "./fx.ts"

function mk(price: unknown, currency: unknown, cycle: string): Node {
  return { price, currency, billing_cycle: cycle } as unknown as Node
}

// 按月折算、按币种分开加；免费 / 一次性 / 不认识的周期不进总数
{
  const c = monthlyCost([
    mk(120, "USD", "yearly"),     // 10/月
    mk(5, "usd", "monthly"),      // 5/月（币种归一大写）
    mk(30, "CNY", "quarterly"),   // 10/月
    mk(0, "USD", "monthly"),      // 免费
    mk("99", "USD", "monthly"),   // 价格不是数字 → 不算
    mk(50, "USD", "once"),        // 一次性 → skipped
    mk(9, "USD", "constructor"),  // 原型链上的键 → skipped
  ])
  assert.deepEqual([...c.byCurrency], [["USD", 15], ["CNY", 10]])
  assert.equal(c.paid, 3)
  assert.equal(c.skipped, 2)
}

// 换算：rates[X] = 1 CNY 能换多少 X
{
  const by = new Map([["USD", 15], ["CNY", 10]])
  assert.equal(convert(by, { USD: 0.125 }, "CNY"), 10 + 15 / 0.125)
  assert.equal(convert(by, {}, "CNY"), null, "缺汇率就不折")
  assert.equal(convert(new Map([["", 5]]), { USD: 1 }, "CNY"), null, "币种没填不折")
  assert.equal(convert(new Map(), {}, "CNY"), 0)
}

// 汇率回包校验
{
  const ok = parseRates({ result: "success", base_code: "CNY", time_last_update_unix: 100, rates: { CNY: 1, USD: 0.14, bad: 2, EUR: -1, JPY: "x" } }, "CNY")
  assert.deepEqual(ok, { base: "CNY", rates: { CNY: 1, USD: 0.14 }, updated: 100000 })
  assert.equal(parseRates({ result: "error" }, "CNY"), null)
  assert.equal(parseRates({ result: "success", base_code: "USD", rates: { USD: 1 } }, "CNY"), null, "基准币种不对不认")
  assert.equal(parseRates(null, "CNY"), null)
}

console.log("每月成本：全部通过")
