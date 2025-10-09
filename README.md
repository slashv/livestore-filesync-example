# Local first file syncing using LiveStore

This is an example repository on how file syncing can work with LiveStore for local first apps. It's build with Vue but the core [services](src/services/) should be mostly framework agnostic.

Files are first saved to OPFS and automatically synced across clients in the background through remote storage.

[State](src/livestore/schema.ts) is split between a synced `files` table and a `localFilesState` `clientDocument` which is only shared between clients with access to the same local storage.

[File storage](src/services/file-storage.ts) service exposes `saveFile`, `updateFile` and `deleteFile` methods which handles the underlying file operations through the [local storage](src/services/local-file-storage.ts) and [remote storage](src/services/remote-file-storage.ts) services.

[Sync service](src/services/file-sync.ts) detects changes to files, updates `localFileStorage` and queues transfers through a [sync executor](src/services/sync-executor.ts). It handles network failure and automatically resumes syncing when reconnected.

[Service worker](public/sw.js) proxies requests which start with `/files` to first try to retrieve from OPFS and falls back to remote url. This relieves UI code from needing to detect when to fetch from remote or local storage.

[Web worker](src/workers/cloudflare-sync.ts) included which handles remote file storage api requests alongside LiveStore syncing via Cloudflare.

## Comments

There is a simpler way to approach this by delegating file caching to a service worker completely. This solves the problem of persistent access to remote files when going offline but would still require logic to enqueue uploads and storing files locally temporarily when adding them in an offline state.

The sync trigger currently watches changes to a custom string composed of some key values from files. It might make sense to change this to trigger on specific LiveStore events like FileCreated, FileUpdated and FileDeleted and potentially differentiate the logic depending on which event. I haven't yet explored the best way to tap into LiveStore eventStream but might look into this in the future.

This feature is suitable for using [Effect](https://effect.website/) due to it's solid primitives for concurrency, requirements management and potentially adopting `platform FileSystem` to make it more runtime agnostic. I'm still new to Effect so I wanted to first approach this problem space from a more familiar perspective. Another reason for first implementing without Effect is that I though it would be a good exercise later to evaluate the benefits that Effect brings.

## Todo

- [ ] File transfer progress tracking
- [ ] Resumable transfers
- [ ] Explore Workbox for better service worker caching

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
const { runFileSync } = fileSync()
runFileSync()
</script>

<template>
  <slot />
</template>
```

In the full code we have a `saveFile` helper method in the [file storage](src/services/file-storage.ts) service but here I've extracted the essential part to highlight that we only need to save to file local storage and commit the FileCreated event and then the [sync service](src/services/file-sync.ts) takes care of the rest.

```vue
// components/images.vue
<script setup lang="ts">
const { store } = useStore()
const images = store.useQuery(
  queryDb(tables.images.where({ deletedAt: null }))
)

const addImage = async (event) => {
  const file = Array.from(event.target.files)[0]
  const { id: fileId, path } = makeStoredFilePath(file.name)
  await writeFile(path, file)  // Write file to OPFS
  store.commit(events.fileCreated({
      id: fileId,
      path: path,
      contentHash: fileHash,
      createdAt: new Date(),
      updatedAt: new Date(),
  }))
  store.commit(events.imageCreated({
      id: crypto.randomUUID(),
      fileId: fileId
  }))
}
</script>

<template>
  <input type="file" ref="fileInput" @change="addImage" accept="image/*" multiple class="hidden" id="fileInput" />
  <div v-for="image in images" :key="image.id">
    <image-display :image="image" />
  </div>
</template>
```

We can display an image by just passing the `file.path`. The service worker takes care of routing the request to local or remote storage.

```vue
// components/image-display.vue
<script setup lang="ts">
const props = defineProps<{ image: Image }>()

const { store } = useStore()
const file = store.useQuery(queryDb(tables.files.where({ id: props.image.fileId }).first()))
</script>

<template>
  <img :src="file.path" />
</template>
```