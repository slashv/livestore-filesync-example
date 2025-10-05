<script setup lang="ts">
import { fileSync } from '../services/file-sync'

const { runFileSync } = fileSync()
runFileSync()
</script>

<template>
  <slot />
</template>