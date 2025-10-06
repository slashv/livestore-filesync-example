<script setup lang="ts">
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import { tables } from '../livestore/schema'

const { store } = useStore()

const files = store.useQuery(queryDb(tables.files.select().where({ deletedAt: null })))

const { online } = store.useClientDocument(tables.uiState)
</script>

<template>
  <div class="grid grid-cols-2 border-b-[1px] border-border px-2 py-1">
    <div>Files: {{ files.length }}</div>
    <div class="self-end justify-self-end">Online: {{ online ? 'Yes' : 'No' }}</div>
  </div>
</template>