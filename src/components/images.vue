<script setup lang="ts">
import { queryDb } from '@livestore/livestore'
import { useStore } from 'vue-livestore'
import { tables, events } from '../livestore/schema'
import type { Image } from '../types'
import { fileStorage } from '../services/file-storage'
import ImageDisplay from './image-display.vue'

type ImageInst = Image

const { store } = useStore()
const { saveFile, deleteFile } = fileStorage()

const images = store.useQuery(queryDb(tables.images.where({ deletedAt: null })))

async function addImage(e: any) {
  const file = Array.from(e.target.files)[0] as File
  const fileId = await saveFile(file)
  store.commit(events.imageCreated({
    id: crypto.randomUUID(),
    title: 'Untitled',
    fileId: fileId
  }))
}

async function deleteImage(image: ImageInst) {
  await deleteFile(image.fileId)
  store.commit(events.imageDeleted({ id: image.id, deletedAt: new Date() }))
}
</script>

<template>
  <div class="flex flex-col gap-4">
    Images
    <input
      type="file"
      ref="fileInput"
      @change="addImage($event)"
      accept="image/*"
    />
    <div class="flex gap-4">
      <div v-for="image in images" :key="image.id" class="w-[400px]">
        <button @click="deleteImage(image)">Delete</button>
        <Suspense>
          <ImageDisplay :image="image" />
          <template #fallback>Loading img..</template>
        </Suspense>
      </div>
    </div>
  </div>
</template>