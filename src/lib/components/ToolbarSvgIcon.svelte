<script lang="ts">
  export let src = ''
  export let className = ''
</script>

<span
  aria-hidden="true"
  class={`toolbar-svg-icon ${className}`.trim()}
  style={`--toolbar-icon-url: url("${src}")`}
></span>
