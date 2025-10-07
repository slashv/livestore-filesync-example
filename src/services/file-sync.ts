import { watch, computed } from 'vue'
import { localFileStorage } from '../services/local-file-storage'
import { remoteFileStorage } from '../services/remote-file-storage'
import { hashFile, makeStoredPathForId } from '../utils/file.utils'
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import { tables, events } from '../livestore/schema'
import type { LocalFile, LocalFilesState, TransferStatus } from '../types'
import { createSyncExecutor } from '../services/sync-executor'


export const fileSync = () => {
  const { store } = useStore()
  const { writeFile, readFile, deleteFile, fileExists } = localFileStorage()
  const { downloadFile, uploadFile, checkHealth } = remoteFileStorage()

  let unwatch: (() => void) | null = null
  let connectivityEventsAttached = false
  let healthCheckIntervalId: number | null = null
  let setOnline: (value: boolean) => void
  const inFlightLocalDetection = new Set<string>()

  // Merge helper to always commit against the latest localFileState to avoid
  // concurrent writers stomping each other's updates.
  const mergeLocalFiles = (patch: Record<string, LocalFile>) => {
    const { localFiles: current } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({ localFiles: { ...current, ...patch } }))
  }

  const stopHealthChecks = () => {
    if (healthCheckIntervalId !== null) {
      window.clearInterval(healthCheckIntervalId)
      healthCheckIntervalId = null
    }
  }

  const startHealthChecks = () => {
    if (healthCheckIntervalId !== null) return
    const connectivityTickerMs = 10000
    healthCheckIntervalId = window.setInterval(async () => {
      try {
        const ok = await checkHealth()
        if (ok) {
          setOnline(true)
          stopHealthChecks()
        }
      } catch {
        // remain offline and keep checking
      }
    }, connectivityTickerMs)
  }

  const updateLocalFileState = async () => {
    const files = store.query(queryDb(tables.files.where({ deletedAt: null })))
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))

    const nextLocalFilesState: LocalFilesState = { ...localFiles }

    // Pass 1: reconcile state using existing local state and remote metadata only (no disk I/O)
    files.forEach((file) => {
      if (file.id in nextLocalFilesState) {
        // Known locally: cheap compare of stored localHash vs remote contentHash to decide download status
        const localFile = nextLocalFilesState[file.id]!
        const remoteMismatch = localFile.localHash !== file.contentHash
        nextLocalFilesState[file.id] = {
          ...localFile,
          downloadStatus: remoteMismatch ? 'pending' : 'done',
          uploadStatus: 'done',
        }
      } else if (file.remoteUrl) {
        // Not known locally but exists remotely: mark as pending download
        nextLocalFilesState[file.id] = {
          path: '',
          localHash: '',
          downloadStatus: 'pending',
          uploadStatus: 'done',
          lastSyncError: ''
        }
      }
      console.log('local file state for file', file.id, nextLocalFilesState[file.id])
    })

    // Pass 2: detect on-disk presence for files missing in state (does disk I/O) and initialize state
    const additions: Record<string, LocalFile> = {}

    await Promise.all(files.map(async (file) => {
      if (file.id in nextLocalFilesState) return
      if (!file.localPath) return
      if (inFlightLocalDetection.has(file.id)) return

      inFlightLocalDetection.add(file.id)
      try {
        const exists = await fileExists(file.localPath)
        if (!exists) return
        const f = await readFile(file.localPath)
        const localHash = await hashFile(f)
        const remoteMismatch = !!(file.remoteUrl && file.contentHash && file.contentHash !== localHash)
        const shouldUpload = !file.remoteUrl

        additions[file.id] = {
          path: `${file.localPath}?v=${localHash}`,
          localHash,
          downloadStatus: remoteMismatch ? 'pending' : 'done',
          uploadStatus: shouldUpload ? 'pending' : 'done',
          lastSyncError: ''
        }
      } finally {
        inFlightLocalDetection.delete(file.id)
      }
    }))

    const merged: LocalFilesState = { ...nextLocalFilesState, ...additions }

    // Prune any local state entries for files no longer present
    const fileIds = new Set(files.map((f) => f.id))
    Object.keys(merged).forEach((fileId) => {
      if (!fileIds.has(fileId)) delete merged[fileId]
    })

    store.commit(events.localFileStateSet({ localFiles: merged }))
  }

  const _setLocalFileTransferStatus = (fileId: string, action: 'upload' | 'download', status: TransferStatus) => {
    console.log('setLocalFiletransferStatus', action, status, fileId)
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    const localFile = localFiles[fileId]
    if (!localFile) return
    const field = action === 'upload' ? 'uploadStatus' : 'downloadStatus'
    mergeLocalFiles({ [fileId]: { ...localFile, [field]: status } })
  }

  const downloadRemoteFile = async (fileId: string): Promise<Record<string, LocalFile>> => {
    try {
      const fileInstance = store.query(queryDb(tables.files.where({ id: fileId }).first()))
      if (!fileInstance) {
        throw new Error(`File: ${fileId} not found`)
      }
      const file = await downloadFile(fileInstance.remoteUrl)
      console.log('downloaded remote file', file.name, file)
      const { path } = makeStoredPathForId(fileId, file.name)
      await writeFile(path, file)
      const localHash = await hashFile(file)
      return {
        [fileId]: {
          path: `${path}?v=${localHash}`,
          localHash: localHash,
          downloadStatus: 'done',
          uploadStatus: 'done',
          lastSyncError: ''
        }
      }
    } catch (error) {
      console.error('error downloading remote file', error)
      startHealthChecks()
      return {
        [fileId]: {
          path: '',
          localHash: '',
          downloadStatus: 'pending',
          uploadStatus: 'done',
          lastSyncError: String(error)
        }
      }
    }
  }

  const uploadLocalFile = async (fileId: string, localFile: LocalFile): Promise<Record<string, LocalFile>> => {
    try {
      console.log('uploading local file', fileId)
      const file = await readFile(localFile.path)
      const remoteUrl = await uploadFile(file)
      console.log('uploaded local file', file.name, remoteUrl)
      store.commit(events.fileUpdated({
        id: fileId,
        remoteUrl: remoteUrl,
        localPath: localFile.path,
        contentHash: localFile.localHash,
        updatedAt: new Date(),
      }))
      return { [fileId]: {
          ...localFile,
          uploadStatus: 'done',
        }
      }
    } catch (error) {
      console.error('error uploading local file', error)
      startHealthChecks()
      return {
        [fileId]: {
          ...localFile,
          uploadStatus: 'pending',
          lastSyncError: String(error)
        }
      }
    }
  }

  const deleteLocalFile = async (fileId: string) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    if (fileId in localFiles) {
      console.log('deleting local file', fileId)
      store.commit(events.localFileStateSet({
        localFiles: Object.fromEntries(Object.entries(localFiles).filter(([key]) => key !== fileId))
      }))
      const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
      return deleteFile(file.localPath)
    }
  }

  const executor = createSyncExecutor({
    maxConcurrentPerKind: { download: 2, upload: 2 },
    isOnline: () => {
      const { online } = store.query(queryDb(tables.uiState.get()))
      return online
    },
    run: async (kind, fileId) => {
      console.log('running sync executor', kind, fileId)
      if (kind === 'download') {
        _setLocalFileTransferStatus(fileId, 'download', 'inProgress')
        const newLocalFile = await downloadRemoteFile(fileId)
        mergeLocalFiles(newLocalFile)
      } else {
        _setLocalFileTransferStatus(fileId, 'upload', 'inProgress')
        const { localFiles: latest } = store.query(queryDb(tables.localFileState.get()))
        const latestLocal = latest[fileId]
        if (!latestLocal) return
        const newLocalFile = await uploadLocalFile(fileId, latestLocal)
        mergeLocalFiles(newLocalFile)
      }
    }
  })

  setOnline = (value: boolean) => {
    const { online } = store.query(queryDb(tables.uiState.get()))
    if (online !== value) {
      store.commit(events.uiStateSet({ online: value }))
    }
    if (value) {
      executor.resume()
    } else {
      executor.pause()
    }
  }

  const markLocalFileChanged = async (fileId: string) => {
    const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    if (!file?.localPath) return
    const f = await readFile(file.localPath)
    const localHash = await hashFile(f)
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({
      localFiles: {
        ...localFiles,
        [fileId]: {
          path: `${file.localPath}?v=${localHash}`,
          localHash,
          downloadStatus: 'done',
          uploadStatus: 'queued',
          lastSyncError: ''
        }
      }
    }))
    executor.enqueue('upload', fileId)
  }

  const attachConnectivityHandlers = () => {
    if (connectivityEventsAttached) return
    connectivityEventsAttached = true
    // initialize from navigator
    const initialOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    setOnline(initialOnline)
    if (!initialOnline) startHealthChecks()

    window.addEventListener('online', () => { setOnline(true); stopHealthChecks() })
    window.addEventListener('offline', () => { setOnline(false); startHealthChecks() })
  }

  const syncFiles = async () => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    Object.entries(localFiles).forEach(([fileId, localFile]) => {
      if (localFile.downloadStatus === 'pending' || localFile.downloadStatus === 'queued') {
        _setLocalFileTransferStatus(fileId, 'download', 'queued')
        executor.enqueue('download', fileId)
      }
      if (localFile.uploadStatus === 'pending' || localFile.uploadStatus === 'queued') {
        _setLocalFileTransferStatus(fileId, 'upload', 'queued')
        executor.enqueue('upload', fileId)
      }
    })
    const deletedFiles = store.query(queryDb(tables.files.where('deletedAt', '!=', null)))
    await Promise.all(deletedFiles.map(async (file) => deleteLocalFile(file.id)))
  }

  const runFileSync = () => {
    if (unwatch) return
    attachConnectivityHandlers()
    const files = store.useQuery(queryDb(tables.files.select().where({ deletedAt: null })))
    const watchTrigger = computed(() => files.value
      .map((file) => `${file.id}:${file.remoteUrl ?? ''}:${file.localPath ?? ''}:${file.contentHash ?? ''}:${file.deletedAt ?? ''}`)
      .join(','))
    unwatch = watch(() => watchTrigger.value, async () => {
      await updateLocalFileState()
      await syncFiles()
    }, { immediate: true })
  }

  return {
    runFileSync,
    markLocalFileChanged
  }
}