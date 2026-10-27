<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <svg :class="[size === 'sm' ? 'h-3 w-3' : 'h-4 w-4', 'shrink-0']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 7v5h-5" />
    <path d="M4 17v-5h5" />
    <path d="M5.64 15a8 8 0 0 0 13.32 2" />
    <path d="M18.36 9A8 8 0 0 0 5.64 7" />
  </svg>
</template>
