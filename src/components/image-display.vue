<script setup lang="ts">
import { computed } from 'vue'
import { tables } from '../livestore/schema'
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import type { Image } from '../types'

const props = defineProps<{
  image: Image
}>()

const emits = defineEmits<{
  (e: 'deleteImage'): void
}>()

const { store } = useStore()

const { localFiles } = store.useClientDocument(tables.localFileState)
const localFile = computed(() => localFiles.value[props.image.fileId])

const file = store.useQuery(queryDb(tables.files.where({ id: props.image.fileId }).first()))
</script>

<template>
  <div class="w-full grid grid-cols-[1fr_3fr] h-[200px] border-[1px]">
    <div class="h-full flex items-center justify-center overflow-hidden">
      <img :src="localFile?.path" class="h-full w-full object-cover" />
    </div>
    <div class="flex flex-col gap-2 p-4">
      <div>Path: {{ localFile?.path }}</div>
      <div>Remote URL: {{ file?.remoteUrl }}</div>
      <button class="border-[1px] px-2 py-1 w-fit" @click="emits('deleteImage')">Delete</button>
    </div>
  </div>
</template>