<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import { tables } from '../livestore/schema'
import { fileStorage } from '../services/file-storage'
import { useStore } from 'vue-livestore'

type ImageInst = typeof tables.images.rowSchema.Type

const props = defineProps<{
  image: ImageInst
}>()

const { store } = useStore()
const { localFiles } = store.useClientDocument(tables.localFileState)
const localFile = computed(() => localFiles.value[props.image.fileId])

const { fileUrl } = fileStorage()
const url = await fileUrl(props.image.fileId)
const urlRef = ref(url)
watch(() => localFile.value, async () => {
  urlRef.value = await fileUrl(props.image.fileId)
  console.log('url updated', urlRef.value)
})

</script>

<template>
  <div>
    <img :src="urlRef" />
    <div>URL: {{ urlRef }}</div>
  </div>
</template>