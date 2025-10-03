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
    <h2>Files</h2>
    <table border="1" style="border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 4px 8px;">ID</th>
          <th style="text-align: left; padding: 4px 8px;">Upload State</th>
          <th style="text-align: left; padding: 4px 8px;">Local Path</th>
          <th style="text-align: left; padding: 4px 8px;">Remote URL</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="file in files" :key="file.id">
          <td style="padding: 4px 8px;">{{ file.id.split('-')[0] }}</td>
          <td style="padding: 4px 8px;">{{ file.uploadState }}</td>
          <td style="padding: 4px 8px;">{{ file.localPath }}</td>
          <td style="padding: 4px 8px;">{{ file.remoteUrl }}</td>
        </tr>
      </tbody>
    </table>

    <h2>Local Files</h2>
    <table border="1" style="border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 4px 8px;">ID</th>
          <th style="text-align: left; padding: 4px 8px;">OPFS Key</th>
          <th style="text-align: left; padding: 4px 8px;">Download</th>
          <th style="text-align: left; padding: 4px 8px;">Upload</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(localFile, fileId) in localFiles" :key="fileId">
          <td style="padding: 4px 8px;">{{ fileId.split('-')[0] }}</td>
          <td style="padding: 4px 8px;">{{ localFile.opfsKey }}</td>
          <td style="padding: 4px 8px;">{{ localFile.downloadStatus }}</td>
          <td style="padding: 4px 8px;">{{ localFile.uploadStatus }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>