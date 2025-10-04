<script setup lang="ts">
import { watch } from 'vue'
import { queryDb } from '@livestore/livestore'
import { tables } from '../livestore/schema'
import { fileSync } from '../services/file-sync'
import { useStore } from 'vue-livestore'

const { updateLocalFileState, syncFiles } = fileSync()

const { store } = useStore()
const files = store.useQuery(queryDb(tables.files.select().where({ deletedAt: null })))

watch(() => files.value.length, () => {
  console.log('files changed', files.value.length)
  updateLocalFileState()
  syncFiles()
})
</script>

<template>
  <slot />
</template>