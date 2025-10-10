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

      <table class="w-full text-sm">
        <tbody>
          <tr>
            <td class="p-2 w-[180px] border-b-[1px] border-r-[1px] border-border whitespace-nowrap">File: Path</td>
            <td class="p-2 border-b-[1px] border-border">{{ file?.path }}</td>
          </tr>

          <tr>
            <td class="p-2 w-[180px] border-b-[1px] border-r-[1px] border-border whitespace-nowrap">File: Remote URL</td>
            <td class="p-2 border-b-[1px] border-border">{{ file?.remoteUrl }}</td>
          </tr>

          <tr>
            <td class="p-2 w-[180px] border-b-[1px] border-r-[1px] border-border whitespace-nowrap">File: Hash</td>
            <td class="p-2 border-b-[1px] border-border">{{ file?.contentHash }}</td>
          </tr>

          <tr>
            <td class="p-2 w-[180px] border-b-[1px] border-r-[1px] border-border whitespace-nowrap">Local File: Hash</td>
            <td class="p-2 border-b-[1px] border-border">{{ localFile?.localHash }}</td>
          </tr>

          <tr>
            <td class="p-2 w-[180px] border-b-[1px] border-r-[1px] border-border whitespace-nowrap">Local File: Download</td>
            <td class="p-2 border-b-[1px] border-border">{{ localFile?.downloadStatus }}</td>
          </tr>

          <tr>
            <td class="p-2 w-[180px] border-r-[1px] border-border whitespace-nowrap">Local File: Upload</td>
            <td class="p-2">{{ localFile?.uploadStatus }}</td>
          </tr>

          <tr v-if="localFile?.lastSyncError">
            <td class="p-2 w-[180px] border-r-[1px] border-t-[1px] border-border whitespace-nowrap">Error</td>
            <td class="p-2 border-t-[1px] border-border">{{ localFile?.lastSyncError }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>