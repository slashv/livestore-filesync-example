<script setup lang="ts">
import { queryDb } from '@livestore/livestore'
import { useStore } from 'vue-livestore'
import { tables, events } from '../livestore/schema'
import { fileStorage } from '../services/file-storage'

const { store } = useStore()
const { saveFile } = fileStorage()

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
    <div v-for="image in images" :key="image.id">
      {{ image }}
      <!-- <ImageDisplay :image="image" /> -->
    </div>
  </div>
</template>