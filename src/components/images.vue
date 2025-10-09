<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { queryDb } from '@livestore/livestore'
import { useStore } from 'vue-livestore'
import { tables, events } from '../livestore/schema'
import type { Image } from '../types'
import { fileStorage } from '../services/file-storage'
import { localFileStorage } from '../services/local-file-storage'
import { invertImageFile } from '../utils/image.utils'
import ImageDisplay from './image-display.vue'

const { store } = useStore()
const { saveFile, deleteFile } = fileStorage()
const { updateFile } = fileStorage()
const { readFile } = localFileStorage()

const images = store.useQuery(queryDb(tables.images.where({ deletedAt: null }).orderBy('createdAt', 'desc')))

const dragDepth = ref(0)
const showDropOverlay = ref(false)

async function deleteImage(image: Image) {
  await deleteFile(image.fileId)
  store.commit(events.imageDeleted({ id: image.id, deletedAt: new Date() }))
}

async function addImagesFromFiles(files: File[]) {
  for (const file of files) {
    const fileId = await saveFile(file)
    store.commit(events.imageCreated({
      id: crypto.randomUUID(),
      title: 'Untitled',
      fileId: fileId,
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  }
}

async function editImage(image: Image) {
  const file = store.query(queryDb(tables.files.where({ id: image.fileId }).first()))
  const srcFile = await readFile(file.path)
  const edited = await invertImageFile(srcFile)
  await updateFile(image.fileId, edited)
}

function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement | null
  const files = input?.files ? Array.from(input.files) : []
  if (files.length > 0) {
    void addImagesFromFiles(files)
  }
}

function isFileDrag(e: DragEvent) {
  const types = e.dataTransfer?.types
  return !!types && Array.from(types).includes('Files')
}

function handleWindowDragEnter(e: DragEvent) {
  if (!isFileDrag(e)) return
  e.preventDefault()
  dragDepth.value += 1
  showDropOverlay.value = true
}

function handleWindowDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleWindowDragLeave(e: DragEvent) {
  if (!isFileDrag(e)) return
  e.preventDefault()
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) showDropOverlay.value = false
}

async function handleWindowDrop(e: DragEvent) {
  e.preventDefault()
  const dt = e.dataTransfer
  if (!dt) return
  const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'))
  if (files.length === 0) return
  await addImagesFromFiles(files)
  dragDepth.value = 0
  showDropOverlay.value = false
}

onMounted(() => {
  window.addEventListener('dragenter', handleWindowDragEnter)
  window.addEventListener('dragover', handleWindowDragOver)
  window.addEventListener('dragleave', handleWindowDragLeave)
  window.addEventListener('drop', handleWindowDrop)
})

onUnmounted(() => {
  window.removeEventListener('dragenter', handleWindowDragEnter)
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('dragleave', handleWindowDragLeave)
  window.removeEventListener('drop', handleWindowDrop)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <input
      type="file"
      ref="fileInput"
      @change="handleFileInputChange"
      accept="image/*"
      multiple
      class="hidden"
      id="fileInput"
    />
    <button @click="$refs.fileInput?.click()" class="btn">
      Add Images
    </button>
    <div class="flex flex-col gap-4">
      <div v-for="image in images" :key="image.id">
        <ImageDisplay :image="image" @deleteImage="deleteImage(image)" @editImage="editImage(image)" />
      </div>
    </div>
    <div v-if="showDropOverlay" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none select-none">
      <div class="text-white text-xl font-medium">Drop file</div>
    </div>
  </div>
</template>