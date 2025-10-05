<script setup lang="ts">
import { watch, computed } from 'vue'
import { queryDb } from '@livestore/livestore'
import { tables } from '../livestore/schema'
import { fileSync } from '../services/file-sync'
import { useStore } from 'vue-livestore'

const { updateLocalFileState, syncFiles } = fileSync()

const { store } = useStore()
const files = store.useQuery(queryDb(tables.files.select().where({ deletedAt: null, })))

const watchTrigger = computed(
  () => files.value.map((file) => file.remoteUrl).join(',') + files.value.length
)

watch(() => watchTrigger.value, () => {
  updateLocalFileState()
  syncFiles()
})
</script>

<template>
  <slot />
</template>