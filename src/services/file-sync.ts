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
  const { writeFile, readFile, deleteFile } = localFileStorage()
  const { downloadFile, uploadFile, checkHealth } = remoteFileStorage()

  let unwatch: (() => void) | null = null
  let connectivityEventsAttached = false
  let healthCheckIntervalId: number | null = null
  let setOnline: (value: boolean) => void

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

  const updateLocalFileState = () => {
    const files = store.query(queryDb(tables.files.where({ deletedAt: null })))
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))

    const nextLocalFilesState: LocalFilesState = { ...localFiles }
    files.forEach((file) => {
      if (file.id in nextLocalFilesState) {
        const localFile = nextLocalFilesState[file.id]!
        nextLocalFilesState[file.id] = {
          path: localFile.path ?? '',
          localHash: localFile.localHash ?? '',
          downloadStatus: localFile.downloadStatus ?? 'done',
          uploadStatus: localFile.uploadStatus ?? 'done',
          lastSyncError: localFile.lastSyncError ?? ''
        }
      } else if (file.remoteUrl) {
        nextLocalFilesState[file.id] = {
          path: '',
          localHash: '',
          downloadStatus: 'pending',
          uploadStatus: 'done',
          lastSyncError: ''
        }
      }
    })

    Object.keys(nextLocalFilesState).forEach((fileId) => {
      if (!files.find((f) => f.id === fileId)) {
        delete nextLocalFilesState[fileId]
      }
    })

    store.commit(events.localFileStateSet({ localFiles: nextLocalFilesState }))
  }

  const _setLocalFileTransferStatus = (fileId: string, action: 'upload' | 'download', status: TransferStatus) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    const localFile = localFiles[fileId]
    if (!localFile) return
    const field = action === 'upload' ? 'uploadStatus' : 'downloadStatus'
    store.commit(events.localFileStateSet({ localFiles: { ...localFiles, [fileId]: { ...localFile, [field]: status } } }))
  }

  const downloadRemoteFile = async (fileId: string): Promise<Record<string, LocalFile>> => {
    const fileInstance = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    if (!fileInstance) {
      throw new Error(`File: ${fileId} not found`)
    }
    const file = await downloadFile(fileInstance.remoteUrl)
    console.log('downloaded remote file', file.name, file)
    _setLocalFileTransferStatus(fileId, 'download', 'inProgress')
    const { path } = makeStoredPathForId(fileId, file.name)
    await writeFile(path, file)
    return {
      [fileId]: {
        path: path,
        localHash: await hashFile(file),
        downloadStatus: 'done',
        uploadStatus: 'done',
        lastSyncError: ''
      }
    }
  }

  const uploadLocalFile = async (fileId: string, localFile: LocalFile): Promise<Record<string, LocalFile>> => {
    console.log('uploading local file', fileId)
    const file = await readFile(localFile.path)
    _setLocalFileTransferStatus(fileId, 'upload', 'inProgress')
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
  }

  const _withFailure = async <T>(fileId: string, run: () => Promise<T>, setStatus: (status: TransferStatus) => void) => {
    try {
      return await run()
    } catch (error: any) {
      const { localFiles } = store.query(queryDb(tables.localFileState.get()))
      const localFile = localFiles[fileId]
      if (localFile) {
        store.commit(events.localFileStateSet({ localFiles: { ...localFiles, [fileId]: { ...localFile, lastSyncError: String(error?.message ?? error) } } }))
        setStatus('pending')
      }
      // trigger connectivity verification when a transfer fails
      if (typeof setOnline === 'function') {
        setOnline(false)
      }
      startHealthChecks()
      throw error
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
      if (kind === 'download') {
        _setLocalFileTransferStatus(fileId, 'download', 'inProgress')
        const partial = await _withFailure(fileId, () => downloadRemoteFile(fileId), (status) => _setLocalFileTransferStatus(fileId, 'download', status))
        const { localFiles } = store.query(queryDb(tables.localFileState.get()))
        store.commit(events.localFileStateSet({ localFiles: { ...localFiles, ...partial } }))
      } else {
        const { localFiles } = store.query(queryDb(tables.localFileState.get()))
        const localFile = localFiles[fileId]
        if (!localFile) return
        _setLocalFileTransferStatus(fileId, 'upload', 'inProgress')
        const partial = await _withFailure(fileId, () => uploadLocalFile(fileId, localFile), (status) => _setLocalFileTransferStatus(fileId, 'upload', status))
        const { localFiles: currentLocalFiles } = store.query(queryDb(tables.localFileState.get()))
        store.commit(events.localFileStateSet({ localFiles: { ...currentLocalFiles, ...partial } }))
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
    const watchTrigger = computed(() => files.value.map((file) => `${file.id}:${file.remoteUrl ?? ''}:${file.deletedAt ?? ''}`).join(','))
    unwatch = watch(() => watchTrigger.value, () => {
      updateLocalFileState()
      syncFiles()
    }, { immediate: true })
  }

  return {
    runFileSync
  }
}