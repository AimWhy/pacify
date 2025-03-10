<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Monaco } from '@/services/MonacoService'
  import { NotifyService } from '@/services/NotifyService'
  import { ERROR_TYPES } from '@/interfaces'
  import FlexGroup from '../FlexGroup.svelte'
  import { scriptTemplates } from '@/constants/templates'
  import Button from '../Button.svelte'
  import { I18nService } from '@/services/i18n/i18nService'
  import { defaultOptions } from '@/utils/monaco'

  export let pacUrl: string = ''
  export let pacMandatory: boolean = false
  export let editorContent: string = scriptTemplates.empty

  let editor: any = null
  let editorContainer: HTMLElement
  let editorHeight: string = '400px'

  function setTemplate(template: string) {
    editorContent = template
    if (editor) {
      editor.setValue(template)
    }
  }

  onMount(async () => {
    if (!pacUrl) {
      try {
        editor = await Monaco.create(editorContainer, {
          ...defaultOptions,
          value: editorContent,
        })

        // Set up content change listener
        editor.onDidChangeModelContent(() => {
          editorContent = editor.getValue()
        })
      } catch (error) {
        NotifyService.error(ERROR_TYPES.EDITOR, error)
      }
    }
  })

  onDestroy(() => {
    if (editor) {
      editor.dispose()
    }
  })
</script>

<div class="space-y-4">
  <div>
    <label
      for="pacUrl"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
    >
      {I18nService.getMessage('pacScriptUrl')}
    </label>
    <input
      type="url"
      id="pacUrl"
      bind:value={pacUrl}
      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
             focus:ring-2 focus:ring-primary focus:border-primary"
      placeholder="https://example.com/proxy.pac"
    />
  </div>

  {#if !pacUrl}
    <div class="flex-1 min-h-0">
      <FlexGroup>
        <label
          for="editorContainer"
          class="flex-grow text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {I18nService.getMessage('pacScript')}
        </label>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {I18nService.getMessage('templates')}
        </span>
        <Button
          minimal
          color="primary"
          on:click={() => setTemplate(scriptTemplates.empty)}
        >
          {I18nService.getMessage('emptyTemplate')}
        </Button>
        <Button
          minimal
          color="primary"
          on:click={() => setTemplate(scriptTemplates.basic)}
        >
          {I18nService.getMessage('basicTemplate')}
        </Button>
        <Button
          minimal
          color="primary"
          on:click={() => setTemplate(scriptTemplates.advanced)}
        >
          {I18nService.getMessage('advancedTemplate')}
        </Button>
        <Button
          minimal
          color="primary"
          on:click={() => setTemplate(scriptTemplates.pro)}
        >
          {I18nService.getMessage('proTemplate')}
        </Button>
      </FlexGroup>
      <div
        id="editorContainer"
        bind:this={editorContainer}
        class="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden"
        style="height: {editorHeight}"
      ></div>
    </div>
  {/if}

  <FlexGroup direction="horizontal" childrenGap="sm" alignItems="center">
    <input
      type="checkbox"
      id="pacMandatory"
      bind:checked={pacMandatory}
      class="rounded border-gray-300 text-primary focus:ring-primary"
    />
    <label for="pacMandatory" class="text-sm text-gray-700 dark:text-gray-300">
      {I18nService.getMessage('mandatoryPacScript')}
    </label>
  </FlexGroup>
</div>
