# Local first file syncing using LiveStore

This is an example repository on how file syncing can work with LiveStore for local first apps. It's build with Vue but the core [services](src/services/) should be mostly framework agnostic.

Files are first saved in OPFS and automatically synced across clients in the background through remote storage.

[State](src/livestore/schema.ts) is split between a synced `files` table and a `localFilesState` `clientDocument` which is only shared between clients with access to the same local storage.

[fileStorage](src/services/file-storage.ts) service exposes `saveFile` and `deleteFile` methods which handles the underlying file operations through the [localFileStorage](src/services/local-file-storage.ts) and [remoteFileStorage](src/services/remote-file-storage.ts) services while also updating LiveStore state.

[Sync service](src/services/file-sync.ts) detects changes to files, updates `localFileStorage` and queues transfers through a [sync execturor](src/services/sync-executor.ts). It handles network failure and automatically resumes syncing when reconnected.

[Service worker](public/sw.js) proxies requests which start with `/files` to first try to retrieve from OPFS and falls back to remote url. This relieves UI code from needing to detect when to fetch from remote or local storage.

[Web worker](src/workers/cloudflare-sync.ts) included which handles remote file storage api requests alongside LiveStore syncing.

## Dev setup

```bash
# Install dependencies
pnpm install

# Start local cloudflare sync provider and storage api
npx wrangler dev

# Start local dev server
pnpm dev
```

## Example

This is simplified example with imports omitted, for complete example see files in [src](/src).

[schema.ts](src/livestore/schema.ts) is relevant context to understand how the data structures are set up.

Some LiveStore code is omitted. For more information about using Vue and LiveStore see [the getting started guide](https://docs.livestore.dev/getting-started/vue/)

We first wrap our app in a FileSyncProvider.

```vue
// App.vue
<template>
  <LiveStoreProvider :options="storeOptions">
    <template #loading>
      <div>Loading LiveStore...</div>
    </template>
    <FileSyncProvider>
      <Images />
    </FileSyncProvider>
  </LiveStoreProvider>
</template>
```

The FileSyncProvider is responsible for starting the sync process. It need to be inside the LiveStoreProvider since it depends on the store being initiated.

```vue
// components/file-sync-provider.vue
<script setup lang="ts">
const { runFileSync } = fileSync()
runFileSync()
</script>

<template>
  <slot />
</template>
```

The `saveFile` method from `file-storage.ts` takes care of saving the file to OPFS, creating a File instance in the synced LiveStore DB and a record in the `localFileState` clientDocument which is what the `file-sync.ts` service uses to track sync operations.

```vue
// components/images.vue
<script setup lang="ts">
const { store } = useStore()
const images = store.useQuery(
  queryDb(tables.images.where({ deletedAt: null }))
)

const addImage = async (file: File) => {
  const fileId = await saveFile(file)
  store.commit(
    events.imageCreated({
      id: crypto.randomUUID(),
      fileId: fileId,
    })
  )
}
</script>
<template>
  <button @click="(event) => addImage(event.target.files[0])">
    Add Image
  </button>
  <div v-for="image in images" :key="image.id">
    <image-display :image="image" />
  </div>
</template>
```

We can display an image by just passing the `file.path`. The service worker takes care or routing the request to local or remote storage.

```vue
// components/image-display.vue
<script setup lang="ts">
const props = defineProps<{
  image: Image
}>()

const { store } = useStore()
const file = store.useQuery(
  queryDb(tables.files.where({ id: props.image.fileId }).first())
)
</script>

<template>
  <img :src="file.path" />
</template>
```