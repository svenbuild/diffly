<script lang="ts">
  import { tick } from 'svelte'

  export let onResetPreferences: () => void
  export let onClearRememberedSelections: () => void
  export let onResetEverything: () => void

  const RESET_CONFIRMATION_PHRASE = 'RESET'

  let showResetEverythingDialog = false
  let resetEverythingConfirmationValue = ''
  let resetEverythingInput: HTMLInputElement | null = null

  async function openResetEverythingDialog() {
    resetEverythingConfirmationValue = ''
    showResetEverythingDialog = true
    await tick()
    resetEverythingInput?.focus()
  }

  function closeResetEverythingDialog() {
    showResetEverythingDialog = false
    resetEverythingConfirmationValue = ''
  }

  function confirmResetEverything() {
    if (resetEverythingConfirmationValue !== RESET_CONFIRMATION_PHRASE) {
      return
    }

    closeResetEverythingDialog()
    onResetEverything()
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (showResetEverythingDialog && event.key === 'Escape') {
      closeResetEverythingDialog()
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<section class="settings-page settings-reset-page">
  <div class="settings-page-heading">
    <h2>Reset</h2>
    <p>Clear saved state when you need a clean slate.</p>
  </div>

  <section class="settings-group">
    <div class="settings-group-header">
      <h3>Local data</h3>
      <p>Reset preferences or remove remembered compare targets.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Reset preferences</strong>
          <p>Restore appearance, viewer, and update settings to defaults.</p>
        </div>

        <div class="settings-control">
          <button class="secondary" type="button" on:click={onResetPreferences}>
            Reset preferences
          </button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row-copy">
          <strong>Clear remembered selections</strong>
          <p>Remove recent compare targets and stored file history.</p>
        </div>

        <div class="settings-control">
          <button class="secondary" type="button" on:click={onClearRememberedSelections}>
            Clear selections
          </button>
        </div>
      </div>
    </div>
  </section>

  <section class="settings-group settings-group-danger">
    <div class="settings-group-header">
      <h3>Danger zone</h3>
      <p>Use this only when you want Diffly back in a first-run state.</p>
    </div>

    <div class="settings-group-grid">
      <div class="settings-row settings-row-span-full">
        <div class="settings-row-copy">
          <strong>Reset everything</strong>
          <p>Clear all saved local app data and return Diffly to first-run state.</p>
        </div>

        <div class="settings-control">
          <button class="primary danger-button" type="button" on:click={openResetEverythingDialog}>
            Reset everything
          </button>
        </div>
      </div>
    </div>
  </section>
</section>

{#if showResetEverythingDialog}
  <div class="settings-dialog-backdrop" role="presentation">
    <button
      aria-label="Close reset confirmation"
      class="settings-dialog-scrim"
      type="button"
      on:click={closeResetEverythingDialog}
    ></button>
    <div
      aria-describedby="reset-everything-description"
      aria-labelledby="reset-everything-title"
      aria-modal="true"
      class="settings-dialog"
      role="dialog"
    >
      <div class="settings-dialog-header">
        <h2 id="reset-everything-title">Reset everything?</h2>
        <p id="reset-everything-description">
          This clears the saved local state for Diffly and returns the app to setup mode.
        </p>
      </div>

      <ul class="settings-dialog-list">
        <li>Restore appearance, viewer, and update settings to defaults.</li>
        <li>Remove remembered compare targets and navigation history.</li>
        <li>Return Diffly to a clean first-run state.</li>
      </ul>

      <label class="settings-dialog-field">
        <span>Type {RESET_CONFIRMATION_PHRASE} to continue</span>
        <input
          bind:this={resetEverythingInput}
          bind:value={resetEverythingConfirmationValue}
          autocomplete="off"
          spellcheck="false"
          type="text"
        />
      </label>

      <div class="settings-dialog-actions">
        <button class="secondary" type="button" on:click={closeResetEverythingDialog}>
          Cancel
        </button>
        <button
          class="primary danger-button"
          disabled={resetEverythingConfirmationValue !== RESET_CONFIRMATION_PHRASE}
          type="button"
          on:click={confirmResetEverything}
        >
          Reset everything
        </button>
      </div>
    </div>
  </div>
{/if}
