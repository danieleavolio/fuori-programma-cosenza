<script lang="ts">
  let { schema }: { schema: unknown } = $props();
  // Escape '<' so upstream text can never terminate the script element.
  const json = $derived(JSON.stringify(schema).replace(/</g, '\\u003c'));
</script>

{@html `<script type="application/ld+json">${json}</script>`}
