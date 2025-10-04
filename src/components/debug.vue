<script setup lang="ts">
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import { tables } from '../livestore/schema'

const { store } = useStore()

const files = store.useQuery(queryDb(tables.files.select().where({ deletedAt: null })))
const { localFiles } = store.useClientDocument(tables.localFileState)
</script>

<template>
  <div>
    <h2>Files</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Upload State</th>
          <th>Local Path</th>
          <th>Remote URL</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="file in files" :key="file.id">
          <td>{{ file.id.split('-')[0] }}</td>
          <td>{{ file.uploadState }}</td>
          <td>{{ file.localPath }}</td>
          <td>{{ file.remoteUrl }}</td>
        </tr>
      </tbody>
    </table>

    <h2>Local Files</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>OPFS Key</th>
          <th>Download</th>
          <th>Upload</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(localFile, fileId) in localFiles" :key="fileId">
          <td>{{ fileId.split('-')[0] }}</td>
          <td>{{ localFile.opfsKey }}</td>
          <td>{{ localFile.downloadStatus }}</td>
          <td>{{ localFile.uploadStatus }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
@reference "../style.css";

table {
  @apply border-[1px] mb-4 w-full;
}

h2 {
  @apply text-lg font-bold mb-2;
}

th {
  @apply text-left px-2 py-1 border-[1px];
}

td {
  @apply px-2 py-1 border-[1px];
}
</style>