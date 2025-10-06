<script setup lang="ts">
import { computed } from 'vue'
import { tables } from '../livestore/schema'
import { useStore } from 'vue-livestore'
import type { Image } from '../types'

const props = defineProps<{
  image: Image
}>()

const { store } = useStore()
const { localFiles } = store.useClientDocument(tables.localFileState)
const localFile = computed(() => localFiles.value[props.image.fileId])
</script>

<template>
  <div>
    <img :src="localFile?.path" />
    <div>Path: {{ localFile?.path }}</div>
  </div>
</template>