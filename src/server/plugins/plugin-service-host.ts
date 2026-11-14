
import { toError } from "../../shared/errors"
import { log } from "../../shared/log"
import type { AppSettingsManager } from "../app-settings"
import { createPluginService, type InstalledPluginStore, type PluginService } from "./plugin-service"

let instance: PluginService | null = null
let installedStore: InstalledPluginStore | null = null

export function startEnabledPlugins(
  service: Pick<PluginService, "list" | "start">,
  onFailure: (pluginId: string, error: Error) => void,
): Promise<void> {
  const starts = service
    .list()
    .filter((plugin) => plugin.enabled)
    .map((plugin) => service.start(plugin.id).catch((error) => onFailure(plugin.id, toError(error))))
  return Promise.all(starts).then(() => undefined)
}

export function configurePluginService(store: InstalledPluginStore): PluginService {
  installedStore = store
  instance = createPluginService({ installed: store })
  instance.restore()
  void startEnabledPlugins(instance, (pluginId, error) => {
    log.error(`[kanna/plugins] could not start "${pluginId}" at boot:`, String(error))
  })
  return instance
}

export function getPluginService(): PluginService {
  instance ??= createPluginService(installedStore ? { installed: installedStore } : {})
  return instance
}

export function setPluginServiceForTest(service: PluginService | null): void {
  instance = service
  if (service === null) installedStore = null
}

export function createPluginsHost(appSettings: Pick<AppSettingsManager, "getSnapshot">) {
  return {
    enabled: () => appSettings.getSnapshot().plugins.enabled,
    service: getPluginService,
  }
}
