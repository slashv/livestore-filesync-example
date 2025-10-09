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
  (e: 'editImage'): void
}>()

const { store } = useStore()

const { localFiles } = store.useClientDocument(tables.localFileState)
const localFile = computed(() => localFiles.value[props.image.fileId])

const file = store.useQuery(queryDb(tables.files.where({ id: props.image.fileId }).first()))
</script>

<template>
  <div class="w-full grid grid-cols-[1fr_3fr] border-[1px] border-border">
    <div class="border-r-[1px] border-border relative overflow-hidden">
      <img :src="localFile?.path" class="absolute inset-0 w-full h-full object-cover" />
    </div>
    <div class="flex flex-col">
      <div class="p-2 border-b-[1px] border-border flex justify-between items-center">
        <div class="text-sm"><strong>Image ID:</strong> {{ props.image.id }} | <strong>File ID:</strong> {{ file.id }}</div>
        <div class="flex gap-2">
          <button class="btn" @click="emits('editImage')">Edit</button>
          <button class="btn" @click="emits('deleteImage')">Delete</button>
        </div>
      </div>

      <div class="grid grid-cols-[120px_1fr] text-sm">
        <div class="p-2 border-b-[1px] border-r-[1px] border-border">Path</div>
        <div class="p-2 border-b-[1px] border-border">{{ file?.path }}</div>

        <div class="p-2 border-b-[1px] border-r-[1px] border-border">Remote URL</div>
        <div class="p-2 border-b-[1px] border-border">{{ file?.remoteUrl }}</div>

        <div class="p-2 border-b-[1px] border-r-[1px] border-border">Download</div>
        <div class="p-2 border-b-[1px] border-border">{{ localFile?.downloadStatus }}</div>

        <div class="p-2 border-b-[1px] border-r-[1px] border-border">Upload</div>
        <div class="p-2 border-b-[1px] border-border">{{ localFile?.uploadStatus }}</div>

        <div class="p-2 border-b-[1px] border-r-[1px] border-border">Content Hash</div>
        <div class="p-2 border-b-[1px] border-border">{{ file?.contentHash }}</div>

        <div class="p-2 border-r-[1px] border-border" :class="{ 'border-b-[1px] border-border': localFile?.lastSyncError }">Local Hash</div>
        <div class="p-2" :class="{ 'border-b-[1px] border-border': localFile?.lastSyncError }">{{ localFile?.localHash }}</div>

        <template v-if="localFile?.lastSyncError">
          <div class="p-2 border-r-[1px] border-border">Error</div>
          <div class="p-2">{{ localFile?.lastSyncError }}</div>
        </template>
      </div>
    </div>
  </div>
</template>