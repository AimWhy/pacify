import { writable, derived } from 'svelte/store'
import { ERROR_TYPES, type AppSettings, type ProxyConfig } from '@/interfaces'
import { DEFAULT_SETTINGS } from '@/constants/app'
import { StorageService } from '@/services/StorageService'
import { ChromeService } from '@/services/chrome'
import { withErrorHandling } from '@/utils/errorHandling'
import { debounce } from '@/utils/debounce'

function createSettingsStore() {
  const { subscribe, set, update } = writable<AppSettings>(DEFAULT_SETTINGS)

  // Create a derived store for quick switch scripts
  const quickSwitchScripts = derived({ subscribe }, ($settings) =>
    $settings.proxyConfigs.filter((script) => script.quickSwitch)
  )

  // Create a derived store for active script
  const activeScript = derived(
    { subscribe },
    ($settings) =>
      $settings.proxyConfigs.find((script) => script.isActive) || null
  )

  // Function to save settings and return a promise
  async function saveSettings(settings: AppSettings): Promise<void> {
    await StorageService.saveSettings(settings)
  }

  // Debounced function only for non-critical updates
  const debouncedSaveSettings = debounce(saveSettings, 500)

  // Utility function to handle settings changes without immediate messaging requirements
  const handleSettingsChange = (
    callback: (settings: AppSettings) => AppSettings,
    useDebounce = true
  ) => {
    return update((settings) => {
      const newSettings = callback(settings)

      // Use debounced or immediate save based on param
      if (useDebounce) {
        debouncedSaveSettings(newSettings)
      } else {
        // Return a promise for immediate saves
        void saveSettings(newSettings)
      }

      return newSettings
    })
  }

  // For changes that need immediate action after saving
  const handleSettingsChangeAndWait = async (
    callback: (settings: AppSettings) => AppSettings
  ): Promise<AppSettings> => {
    let newSettings: AppSettings = DEFAULT_SETTINGS

    update((settings) => {
      newSettings = callback(settings)
      return newSettings
    })

    // Save immediately and wait for completion
    await saveSettings(newSettings)
    return newSettings
  }

  return {
    subscribe,
    quickSwitchScripts,
    activeScript,

    load: withErrorHandling(async () => {
      const settings = await StorageService.getSettings()
      set(settings)
    }, ERROR_TYPES.LOAD_SETTINGS),

    updateSettings: withErrorHandling(
      async (partialSettings: Partial<AppSettings>) => {
        handleSettingsChange((settings) => ({
          ...settings,
          ...partialSettings,
        }))
      },
      ERROR_TYPES.SAVE_SETTINGS
    ),

    updatePACScript: withErrorHandling(
      async (script: Omit<ProxyConfig, 'id'>, scriptId: string | null) => {
        handleSettingsChange((settings) => {
          if (scriptId) {
            // Update existing script
            return {
              ...settings,
              proxyConfigs: settings.proxyConfigs.map((s) =>
                s.id === scriptId ? { ...script, id: scriptId } : s
              ),
            }
          } else {
            // Add new script
            const newScript = { ...script, id: crypto.randomUUID() }
            return {
              ...settings,
              proxyConfigs: [...settings.proxyConfigs, newScript],
            }
          }
        })
      },
      ERROR_TYPES.SAVE_SCRIPT
    ),

    updateScriptQuickSwitch: withErrorHandling(
      async (scriptId: string, quickSwitch: boolean) => {
        if (!scriptId) return

        // First save the changes and wait for them to complete
        const updatedSettings = await handleSettingsChangeAndWait(
          (settings) => ({
            ...settings,
            proxyConfigs: settings.proxyConfigs.map((s) =>
              s.id === scriptId ? { ...s, quickSwitch } : s
            ),
          })
        )

        // Only after settings are saved, send the message
        await ChromeService.sendMessage({
          type: 'SCRIPT_UPDATE',
          scriptId,
        })

        return updatedSettings
      },
      ERROR_TYPES.SAVE_SCRIPT
    ),

    deletePACScript: withErrorHandling(async (scriptId: string) => {
      // Save without debounce to make sure changes are persisted before UI updates
      handleSettingsChange((settings) => {
        const newSettings = {
          ...settings,
          proxyConfigs: settings.proxyConfigs.filter((s) => s.id !== scriptId),
        }

        // Clear activeScriptId if it was deleted
        if (settings.activeScriptId === scriptId) {
          newSettings.activeScriptId = null
        }

        return newSettings
      }, false) // false = don't use debounce
    }, ERROR_TYPES.DELETE_SCRIPT),

    quickSwitchToggle: withErrorHandling(async (enabled: boolean) => {
      // First save the changes and wait for them to complete
      const updatedSettings = await handleSettingsChangeAndWait((settings) => ({
        ...settings,
        quickSwitchEnabled: enabled,
      }))

      // Only after settings are saved, send the message
      await ChromeService.sendMessage({
        type: 'QUICK_SWITCH',
        enabled,
      })

      return updatedSettings
    }, ERROR_TYPES.SAVE_SETTINGS),

    setProxy: withErrorHandling(async (id: string, isActive: boolean) => {
      // First save the changes and wait for completion
      await handleSettingsChangeAndWait((settings) => {
        const proxyConfigs = settings.proxyConfigs.map((script) => ({
          ...script,
          isActive: script.id === id ? isActive : false,
        }))

        return {
          ...settings,
          proxyConfigs,
          activeScriptId: isActive ? id : null,
        }
      })

      // Now get the fresh settings to ensure we have the latest state
      const updatedSettings = await StorageService.getSettings()
      const activeScript = updatedSettings.proxyConfigs.find((s) => s.id === id)

      if (!activeScript) return

      // Send the appropriate message based on the active state
      if (isActive && activeScript) {
        await ChromeService.sendMessage({
          type: 'SET_PROXY',
          proxy: activeScript,
        })
      } else {
        await ChromeService.sendMessage({
          type: 'CLEAR_PROXY',
        })
      }
    }, ERROR_TYPES.SAVE_SETTINGS),

    reloadSettings: withErrorHandling(async () => {
      await StorageService.invalidateCache()
      const settings = await StorageService.getSettings()
      set(settings)
    }, ERROR_TYPES.LOAD_SETTINGS),

    init: withErrorHandling(async () => {
      await StorageService.migrateStorage()
      await StorageService.invalidateCache()
      const settings = await StorageService.getSettings()
      set(settings)
    }, ERROR_TYPES.INITIALIZATION),
  }
}

export const settingsStore = createSettingsStore()
