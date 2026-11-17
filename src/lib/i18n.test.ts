/// <reference types="node" />
import assert from "node:assert/strict"
import { cycleShort, uptime } from "./format.ts"
import { browserLang, getLang, plural, setLang, t } from "./i18n.ts"
import { rangeLabel, rangesFor } from "./ranges.ts"
import { SORTS, STATUSES } from "./overview.ts"

// 非浏览器环境（单测）固定中文：Node 自己的 navigator.language 不该改掉别的测试的断言。
assert.equal(browserLang(), "zh")
assert.equal(getLang(), "zh")
assert.equal(t("中", "en"), "中")

// 订阅者在切换时被通知（这里直接看结果）
setLang("en")
assert.equal(getLang(), "en")
assert.equal(t("中", "en"), "en")
assert.equal(uptime(2 * 86400 + 5 * 3600), "2d 5h")
assert.equal(uptime(3 * 3600 + 25 * 60), "3h 25m")
assert.equal(uptime(90), "1m")
assert.equal(cycleShort("yearly"), "yr")
assert.equal(cycleShort("constructor"), "", "原型链上的键不认")
assert.equal(rangeLabel(1), "1 hour")
assert.equal(rangeLabel(6), "6 hours")
assert.equal(rangeLabel(24 * 7), "7 days")
assert.deepEqual(rangesFor(7).map((r) => r.label), ["1 hour", "6 hours", "24 hours", "7 days"])
assert.equal(STATUSES[1].label(), "Online")
assert.equal(SORTS[0].label(), "Default order")
assert.equal(plural(1, "node"), "1 node")
assert.equal(plural(3, "node"), "3 nodes")

setLang("zh")
assert.equal(uptime(2 * 86400 + 5 * 3600), "2 天 5 小时")
assert.equal(cycleShort("yearly"), "年")
assert.deepEqual(rangesFor(7).map((r) => r.label), ["1 小时", "6 小时", "24 小时", "7 天"])
assert.equal(STATUSES[1].label(), "在线")

console.log("中英切换：全部通过")
