<script setup lang="ts">
import { computed } from 'vue'
import { tables } from '../livestore/schema'
import { fileStorage } from '../services/file-storage'

type ImageInst = typeof tables.images.rowSchema.Type

const { fileUrl } = fileStorage()

const props = defineProps<{
  image: ImageInst
}>()

// const url = computed(async () => await fileUrl(props.image.fileId))
const url = await fileUrl(props.image.fileId)
</script>

<template>
  <div>
    <img :src="url" />
    <div>URL: {{ url }}</div>
  </div>
</template>