<script setup lang="ts">
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import { tables } from '../livestore/schema'

const { store } = useStore()

const files = store.useQuery(queryDb(tables.files.select()))
const { localFiles } = store.useClientDocument(tables.localFileState)
</script>

<template>
  <div>
    Files:
    {{ files }}
  </div>
  <div>
    localFiles:
    {{ localFiles }}
  </div>
</template>