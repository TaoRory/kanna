import { describe, expect, test } from "vite-plus/test"
import type { PluginService, PluginSummary } from "./plugin-service"
import { startEnabledPlugins } from "./plugin-service-host"

function summary(id: string, enabled: boolean): PluginSummary {
  return { id, sourceDir: `/plugins/${id}`, enabled, state: "stopped" }
}

function fakeService(plugins: PluginSummary[], failing: ReadonlySet<string> = new Set()) {
  const started: string[] = []
  const service: Pick<PluginService, "list" | "start"> = {
    list: () => plugins,
    start: async (id) => {
      if (failing.has(id)) throw new Error(`${id} will not start`)
      started.push(id)
    },
  }
  return { service, started }
}

describe("startEnabledPlugins", () => {
  test("starts every enabled plugin and leaves disabled ones alone", async () => {
    const { service, started } = fakeService([summary("a", true), summary("b", false), summary("c", true)])

    await startEnabledPlugins(service, () => {
      throw new Error("no failure expected")
    })

    expect(started).toEqual(["a", "c"])
  })

  test("a plugin that fails to start is reported without stopping the others", async () => {
    const { service, started } = fakeService([summary("a", true), summary("b", true)], new Set(["a"]))
    const failures: string[] = []

    await startEnabledPlugins(service, (pluginId, error) => {
      failures.push(`${pluginId}: ${String(error)}`)
    })

    expect(started).toEqual(["b"])
    expect(failures).toEqual(["a: Error: a will not start"])
  })

  test("does nothing when no plugin is installed", async () => {
    const { service, started } = fakeService([])
    await startEnabledPlugins(service, () => undefined)
    expect(started).toEqual([])
  })
})
