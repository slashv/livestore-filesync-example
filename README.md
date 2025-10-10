# Local first file syncing using LiveStore

This is an example repository on how file syncing can work with LiveStore for local first apps. It's built with Vue but the core [services](src/services/) are framework agnostic.

Files are first saved to OPFS and automatically synced across clients in the background through remote storage.

[State](src/livestore/schema.ts) is split between a synced `files` table and a `localFilesState` clientDocument which is only synced between clients sessions (tabs) which have access to the same local storage.

[File storage](src/services/file-storage.ts) service exposes `saveFile`, `updateFile` and `deleteFile` methods which handle the underlying file operations through the [local storage](src/services/local-file-storage.ts) and [remote storage](src/services/remote-file-storage.ts) services.

[Sync service](src/services/file-sync.ts) subscribes to changes on the files table, updates `localFileStorage` and queues transfers through a [sync executor](src/services/sync-executor.ts). It handles network failure and automatically resumes syncing when reconnected.

[Service worker](src/workers/sw.ts) proxies requests which start with `/files` to first try to retrieve from OPFS and falls back to remote url. This relieves UI code from needing to detect when to fetch from remote or local storage.

[Web worker](src/workers/cloudflare-sync.ts) included which handles remote file storage api requests alongside LiveStore syncing via Cloudflare.

## Comments

There is a simpler way to approach this by delegating file caching to a service worker completely. This solves the problem of persistent access to remote files when going offline but would still require logic to enqueue uploads and storing files locally temporarily when adding them in an offline state.

This feature is suitable for using [Effect](https://effect.website/) due to it's solid primitives for concurrency, requirements management and potentially adopting `platform FileSystem` to make it more runtime agnostic. I'm still new to Effect so I wanted to first approach this problem space from a more familiar perspective. Another reason for first implementing without Effect is that I though it would be a good exercise later to evaluate the benefits that Effect brings.

## Todo

- [ ] File transfer progress tracking
- [ ] Resumable transfers

## Dev setup

```bash
# Install dependencies
pnpm install

# Create .env file
cp .env.template .env

# Start local cloudflare sync provider and storage api
npx wrangler dev

# Start local dev server
pnpm dev
```

## Example

This is a simplified version to showcase basic functionality, for complete code see files in [src](/src).

[schema.ts](src/livestore/schema.ts) is relevant context to understand how the data structures are set up.

For more information about using Vue and LiveStore see [the getting started guide](https://docs.livestore.dev/getting-started/vue/)

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
import { fileSync } from "../services/file-sync"
const { runFileSync } = fileSync()

runFileSync()
</script>

<template>
  <slot />
</template>
```

To save an file we call `saveFile` from the [file storage](src/services/file-storage.ts) service which handles writing the file to local storage and creating a `file` in the synced files table.

```vue
// components/images.vue
<script setup lang="ts">
import { useStore } from "vue-livestore"
import { fileStorage } from "../services/file-storage"

const { store } = useStore()
const { saveFile } = fileStorage()

const images = store.useQuery(
  queryDb(tables.images.where({ deletedAt: null }))
)

const addImage = async (event) => {
  const file = Array.from(event.target.files)[0]
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
  <input type="file" ref="fileInput" @change="addImage" accept="image/*" multiple class="hidden" id="fileInput" />
  <div v-for="image in images" :key="image.id">
    <image-display :image="image" />
  </div>
</template>
```

To display an image we can use either `file.path` of `localFile.path`. By using localFileState it allows us to react to local edits by adding a cache-busting parameter to the localFile.path when we call `markLocalFileChanged` in [file sync](src/services/file-sync.ts). An alternative would be to combine `file.path` with `localFiles.localHash` with the same result in UI code.

```vue
// components/image-display.vue
<script setup lang="ts">
import { useStore } from "vue-livestore"
import { fileStorage } from "../services/file-storage"

const props = defineProps<{ image: Image }>()

const { store } = useStore()
const { localFiles } = store.useClientDocument(tables.localFileState)
const localFile = computed(() => localFiles.value[props.image.fileId])
</script>

<template>
  <img :src="localFile.path" />
</template>
```
