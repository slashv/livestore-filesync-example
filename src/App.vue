<script setup lang="ts">
import { makePersistedAdapter } from '@livestore/adapter-web'
import LiveStoreSharedWorker from '@livestore/adapter-web/shared-worker?sharedworker'
import LiveStoreWorker from './livestore/livestore.worker?worker'
import { schema } from './livestore/schema'
import { LiveStoreProvider } from 'vue-livestore'
import Images from './components/images.vue'
import Debug from './components/debug.vue'
import FileSyncProvider from './components/file-sync-provider.vue'

const adapter = makePersistedAdapter({
  storage: { type: 'opfs' },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
})

const storeOptions = {
  schema,
  adapter,
  storeId: 'vue-livestore-filesync-13',
  syncPayload: { authToken: import.meta.env.VITE_WORKER_AUTH_TOKEN }
}
</script>

<template>
  <LiveStoreProvider :options="storeOptions">
    <template #loading>
      <div>Loading LiveStore...</div>
    </template>
    <FileSyncProvider>
      <div class="flex flex-col gap-4 p-6">
        <Images />
        <Debug />
      </div>
    </FileSyncProvider>
  </LiveStoreProvider>
</template>
