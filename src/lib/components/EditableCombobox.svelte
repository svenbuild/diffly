<script context="module" lang="ts">
  let editableComboboxId = 0

  export interface EditableComboboxOption {
    value: string
    label: string
  }
</script>

<script lang="ts">
  export let value = ''
  export let options: ReadonlyArray<EditableComboboxOption> = []
  export let ariaLabel: string
  export let placeholder = 'Search or enter a ref…'
  export let disabled = false
  export let invalid = false
  export let onChange: (value: string) => void

  const listId = `editable-combobox-${(editableComboboxId += 1)}`
</script>

<div class="editable-combobox">
  <input
    aria-invalid={invalid}
    aria-label={ariaLabel}
    autocomplete="off"
    {disabled}
    list={listId}
    {placeholder}
    spellcheck="false"
    type="text"
    {value}
    on:input={(event) => onChange(event.currentTarget.value)}
  />
  <svg aria-hidden="true" viewBox="0 0 16 16">
    <path
      d="m4.5 6.2 3.5 3.6 3.5-3.6"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    />
  </svg>
  <datalist id={listId}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </datalist>
</div>

<style>
  .editable-combobox {
    position: relative;
    min-width: 0;
  }

  input {
    width: 100%;
    min-width: 0;
    padding-right: 30px;
    font-family: var(--code, var(--font-code));
    font-size: 12px;
  }

  input[aria-invalid='true'] {
    border-color: color-mix(in srgb, var(--danger) 62%, var(--border));
  }

  svg {
    position: absolute;
    top: 50%;
    right: 9px;
    width: 14px;
    height: 14px;
    color: var(--muted);
    pointer-events: none;
    transform: translateY(-50%);
  }
</style>
