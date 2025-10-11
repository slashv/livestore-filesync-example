### File transfer progress tracking design

This document describes how to implement precise, UI-visible progress tracking for uploads and downloads in this repository. It builds directly on the existing architecture referenced in `README.md` and integrates with `localFileState` so that UI can render progress with no additional side channels. It also outlines options for resumable transfers and how the service worker fits in.

Goals
- Local, reactive progress state for each file in `tables.localFileState` (client document)
- Minimal churn to the current architecture (`file-sync.ts`, `local-file-storage.ts`, `remote-file-storage.ts`, `sync-executor.ts`)
- Accurate progress for both uploads and downloads
- Throttled updates to avoid store spam
- Compatible with offline-first behavior and backoff in the executor

Non-goals
- Writing tests in this doc
- Implementing complex resumable protocols; we document options and an incremental path


### State model extensions (localFileState)

Extend `localFileState` to carry byte-level progress and timestamps. This keeps progress purely client-local (not synced) and visible to all UI through the standard client document.

Proposed additions:
- `downloadBytes`: number
- `downloadTotalBytes`: number
- `uploadBytes`: number
- `uploadTotalBytes`: number
- `startedAt`: Date (ms since epoch)
- `updatedAt`: Date (ms since epoch)

Schema edits in `src/livestore/schema.ts`:

```23:45:src/livestore/schema.ts
export const transferStatus = Schema.Literal('pending', 'queued', 'inProgress', 'done', 'error')

export const localFileState = Schema.Struct({
  path: Schema.String,
  localHash: Schema.String,
  downloadStatus: transferStatus,
  uploadStatus: transferStatus,
  lastSyncError: Schema.String,
  // New fields for progress
  downloadBytes: Schema.Number,
  downloadTotalBytes: Schema.Number,
  uploadBytes: Schema.Number,
  uploadTotalBytes: Schema.Number,
  startedAt: Schema.Integer({ schema: Schema.DateFromNumber }),
  updatedAt: Schema.Integer({ schema: Schema.DateFromNumber }),
})
```

Defaults: when creating local entries for files that exist only remotely or only locally, initialize totals and bytes to `0`, and timestamps to `Date.now()`.


### State machine and progress semantics

- `pending`: known work exists but not yet enqueued (bytes=0)
- `queued`: enqueued, waiting executor slot (bytes=0)
- `inProgress`: bytes monotonically increase until they reach `totalBytes`; `updatedAt` ticks
- `done`: bytes == totalBytes (if total known); keep values for a short window for UI to render 100%, then optionally reset bytes to 0 in a later housekeeping pass
- `error`: keep last known bytes; `lastSyncError` populated; executor backoff governs retry

Unknown totals: if the server does not provide `Content-Length` or upload total is unknown, keep `totalBytes=0` and render an indeterminate progress UI in the client. When length becomes known, set `totalBytes` and switch to determinate rendering.


### Store helper APIs in `file-sync.ts`

Add small helpers to avoid writer stomps and to keep progress updates targeted.

```120:148:src/services/file-sync.ts
const setLocalFileTransferProgress = (
  fileId: string,
  action: 'upload' | 'download',
  bytes: number,
  totalBytes: number
) => {
  const { localFiles } = store.query(queryDb(tables.localFileState.get()))
  const existing = localFiles[fileId]
  if (!existing) return
  const at = Date.now()
  const patch = action === 'upload'
    ? { uploadBytes: bytes, uploadTotalBytes: totalBytes, updatedAt: new Date(at) }
    : { downloadBytes: bytes, downloadTotalBytes: totalBytes, updatedAt: new Date(at) }
  store.commit(events.localFileStateSet({
    localFiles: { ...localFiles, [fileId]: { ...existing, ...patch } }
  }))
}
```

Initialize progress when moving to `inProgress`:

```197:211:src/services/file-sync.ts
if (kind === 'download') {
  setLocalFileTransferStatus(fileId, 'download', 'inProgress')
  setLocalFileTransferProgress(fileId, 'download', 0, 0)
  const newLocalFile = await downloadRemoteFile(fileId)
  mergeLocalFiles(newLocalFile)
} else {
  setLocalFileTransferStatus(fileId, 'upload', 'inProgress')
  setLocalFileTransferProgress(fileId, 'upload', 0, 0)
  const { localFiles: latest } = store.query(queryDb(tables.localFileState.get()))
  const latestLocal = latest[fileId]
  if (!latestLocal) return
  const newLocalFile = await uploadLocalFile(fileId, latestLocal)
  mergeLocalFiles(newLocalFile)
}
```

Throttle: wrap calls to `setLocalFileTransferProgress` with a simple time-based throttle (e.g., 100–200ms) to reduce commits during large transfers.


### Download progress implementation

Implement a progress-aware download that streams the body and updates progress as chunks arrive.

New method in `src/services/remote-file-storage.ts`:

```typescript
export const remoteFileStorage = () => {
  const downloadFileWithProgress = async (
    url: string,
    onProgress: (received: number, total: number) => void
  ): Promise<File> => {
    const response = await fetch(url, { headers: getAuthHeaders() })
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`)

    const total = Number(response.headers.get('content-length') || 0)
    const reader = response.body?.getReader()
    if (!reader) {
      const blob = await response.blob()
      return new File([blob], url.split('/').pop() ?? 'noname', { type: blob.type || '' })
    }

    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        received += value.byteLength
        onProgress(received, total)
      }
    }
    const blob = new Blob(chunks)
    return new File([blob], url.split('/').pop() ?? 'noname', { type: response.headers.get('content-type') || '' })
  }

  return { /* existing exports */, downloadFileWithProgress }
}
```

Integrate in `file-sync.ts` by replacing `downloadFile` call inside `downloadRemoteFile` with the progress variant and wiring to `setLocalFileTransferProgress`.

```127:159:src/services/file-sync.ts
const newLocalStatePatch = await (async () => {
  const fileInstance = store.query(queryDb(tables.files.where({ id: fileId }).first()))
  if (!fileInstance) throw new Error(`File: ${fileId} not found`)
  const file = await downloadFileWithProgress(fileInstance.remoteUrl, (bytes, total) => {
    setLocalFileTransferProgress(fileId, 'download', bytes, total)
  })
  const { path } = makeStoredPathForId(fileId, file.name)
  await writeFile(path, file)
  const localHash = await hashFile(file)
  return {
    [fileId]: {
      path: `${path}?v=${localHash}`,
      localHash,
      downloadStatus: 'done',
      uploadStatus: 'done',
      lastSyncError: '',
      downloadBytes: 0,
      downloadTotalBytes: 0,
      uploadBytes: 0,
      uploadTotalBytes: 0,
      updatedAt: new Date(),
    }
  }
})()
```

Note: This keeps OPFS writing as a single write at the end. If partial writes are desired (to support resumable downloads), add `writeFileStream(path)` to `local-file-storage.ts` that returns a `FileSystemWritableFileStream` and write chunks as they arrive. With stream writes, update hash and cache-busting suffix only after finalize.


### Upload progress implementation

Browser `fetch` does not surface upload progress reliably. The simplest cross-browser approach is `XMLHttpRequest` with `upload.onprogress`.

Add `uploadFileWithProgress` to `src/services/remote-file-storage.ts`:

```typescript
const uploadFileWithProgress = async (
  file: File,
  onProgress: (sent: number, total: number) => void
): Promise<string> => {
  const baseUrl = import.meta.env.VITE_WORKER_API_URL || 'http://localhost:8787/api'
  const uploadUrl = `${baseUrl}/upload`
  const formData = new FormData()
  formData.append('file', file)

  const token = import.meta.env.VITE_WORKER_AUTH_TOKEN

  const url = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total)
      else onProgress(e.loaded, 0)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).url) } catch (e) { reject(e) }
      } else reject(new Error(`Upload failed: ${xhr.statusText}`))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(formData)
  })
  return url
}
```

Wire it in `file-sync.ts` inside `uploadLocalFile`:

```162:189:src/services/file-sync.ts
const file = await readFile(localFile.path)
const remoteUrl = await uploadFileWithProgress(file, (sent, total) => {
  setLocalFileTransferProgress(fileId, 'upload', sent, total)
})
store.commit(events.fileUpdated({ id: fileId, remoteUrl, contentHash: localFile.localHash, updatedAt: new Date() }))
return { [fileId]: { ...localFile, uploadStatus: 'done', uploadBytes: 0, uploadTotalBytes: 0, updatedAt: new Date() } }
```

Throttle progress updates to ~10/sec to avoid excessive commits.


### UI integration (Vue)

All UI reads progress exclusively from `localFileState`. Example wiring in a component that already has `localFiles` from the client document (see `components/image-display.vue` and `components/images.vue`).

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vue-livestore'
import { tables } from '../livestore/schema'

const props = defineProps<{ fileId: string }>()
const { store } = useStore()
const { localFiles } = store.useClientDocument(tables.localFileState)
const lf = computed(() => localFiles.value[props.fileId])

const uploadProgress = computed(() => lf.value?.uploadTotalBytes > 0
  ? lf.value.uploadBytes / lf.value.uploadTotalBytes
  : (lf.value?.uploadStatus === 'inProgress' ? undefined : 0))

const downloadProgress = computed(() => lf.value?.downloadTotalBytes > 0
  ? lf.value.downloadBytes / lf.value.downloadTotalBytes
  : (lf.value?.downloadStatus === 'inProgress' ? undefined : 0))
</script>

<template>
  <div v-if="lf">
    <div v-if="lf.downloadStatus !== 'done'">
      <progress v-if="downloadProgress !== undefined" :value="downloadProgress" max="1" />
      <div v-else>Downloading…</div>
    </div>
    <div v-if="lf.uploadStatus !== 'done'">
      <progress v-if="uploadProgress !== undefined" :value="uploadProgress" max="1" />
      <div v-else>Uploading…</div>
    </div>
    <div v-if="lf.lastSyncError">{{ lf.lastSyncError }}</div>
  </div>
  <div v-else />
  </template>
```

Cache-busting stays as-is: when a file is written, `markLocalFileChanged` sets `path` to `path?v=<hash>`; images continue to load via `/files/...` routed by the service worker.


### Service worker considerations

Current SW (`public/sw.js`) proxies `/files/*` to OPFS first, then remote fallback. Progress for UI does not come from the SW; UI derives it from `localFileState` driven by `file-sync.ts` transfers. Notes:
- When an `<img src="/files/...">` hits the SW and falls back to remote, the UI will not see progress from that fetch. This is acceptable because the sync path downloads via `file-sync.ts` and updates `localFileState` with progress.
- Do not implement UI progress via SW fetch events; coordinating that to the main thread is possible via `postMessage`, but it complicates architecture and duplicates the sync logic.
- Keep SW fetch with `cache-control: no-store` for OPFS responses to avoid stale content.

Optional enhancement: For very large assets, stream to OPFS from the SW with Range requests and post progress to the client via `Client.postMessage`. If you adopt that, ensure only one place (SW or app) performs the download to avoid duplication.


### Resumable transfers (optional, incremental)

Uploads:
- Replace single-request upload with a multipart/session approach. Common options:
  - Tus protocol
  - R2 S3-compatible multipart API (initiate → upload parts → complete)
- Track per-file `uploadSessionId` (client-local only) and `uploadBytes` based on committed parts.
- Expose `remoteFileStorage.startMultipart`, `uploadPartWithProgress`, `completeMultipart`.

Downloads:
- Support HTTP Range and etag verification. Persist partially downloaded data to a temp OPFS path, track `downloadBytes` and `downloadTotalBytes`, and resume at the saved offset on retry.
- Cloudflare R2 supports Range; verify your worker passes `Range` through to R2 get.

Executor integration:
- Do not enqueue a second task for the same file while an in-flight resumable task exists.
- On error, backoff as today; on resume, continue from last byte.


### Error handling and offline

- On network errors set `lastSyncError` and keep status:
  - If offline: keep status at `pending`/`queued`; health checker will flip online and `executor.resume()`
  - If online with server error: set `error`, executor backoff will re-enqueue
- Consider mapping fatal errors (4xx) to terminal `error` and clear queue entries for that file


### Performance notes

- Throttle progress updates to the store to ~10 Hz; last chunk should force an immediate commit
- Avoid heavy per-chunk hashing during download; compute hash once at end
- Keep `maxConcurrentPerKind` conservative to reduce UI thrash


### Minimal change checklist

- Extend `localFileState` schema with progress fields
- Add `setLocalFileTransferProgress` helper in `file-sync.ts`
- Implement `downloadFileWithProgress` (streaming) and `uploadFileWithProgress` (XHR) in `remote-file-storage.ts`
- Call progress setters from `downloadRemoteFile`/`uploadLocalFile`
- Throttle progress updates in `file-sync.ts`
- Render progress from `localFileState` in UI components


### Future enhancements

- Resumable uploads via R2 multipart or Tus
- Resumable downloads via Range + OPFS partial writes
- Speed/ETA calculation using `(bytes delta) / (time delta)` and projecting to `totalBytes`
- Aggregate progress across many files for a global indicator in `uiState`


