import { Schema } from '@livestore/livestore'
import { watch, computed } from 'vue'
import { localFileStorage } from '../services/local-file-storage'
import { remoteFileStorage } from '../services/remote-file-storage'
import { hashFile, makeStoredPathForId } from '../utils/file.utils'
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import { tables, events, localFileState as localFileStateSchema, localFilesState as localFilesStateSchema, type TransferStatus } from '../livestore/schema'

const localFileStateSchemaMutable = Schema.mutable(localFileStateSchema)
type LocalFileInst = typeof localFileStateSchemaMutable.Type
const localFilesStateSchemaMutable = Schema.mutable(localFilesStateSchema)
type LocalFilesState = typeof localFilesStateSchemaMutable.Type

export const fileSync = () => {
  const { store } = useStore()
  const { writeFile, readFile, deleteFile } = localFileStorage()
  const { downloadFile, uploadFile } = remoteFileStorage()

  let unwatch: (() => void) | null = null

  const updateLocalFileState = () => {
    const files = store.query(queryDb(tables.files.where({ deletedAt: null })))
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))

    const newLocalFileState: LocalFilesState = {}
    files.forEach(async (file) => {
      const localFilePresent = file.id in localFiles
      // const localFileValid = localFilePresent && await _localFileValid(localFiles[file.id]!, file)
      if (localFilePresent) {
        newLocalFileState[file.id] = localFiles[file.id]!
      } else if (file.remoteUrl) {
        newLocalFileState[file.id] = {
          path: '',
          localHash: '',
          downloadStatus: 'pending',
          uploadStatus: 'done',
          lastSyncError: ''
        }
      }
    })
    store.commit(events.localFileStateSet({ localFiles: newLocalFileState }))
  }

  const _setLocalFileUploadStatus = (fileId: string, status: TransferStatus) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({ ...localFiles, [fileId]: { ...localFiles[fileId], uploadStatus: status } }))
  }

  const _setLocalFileDownloadStatus = (fileId: string, status: LocalFileInst['downloadStatus']) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({ ...localFiles, [fileId]: { ...localFiles[fileId], downloadStatus: status } }))
  }

  const downloadRemoteFile = async (fileId: string): Promise<Record<string, LocalFileInst>> => {
    console.log('downloading remote file', fileId)
    const fileInst = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    if (!fileInst) {
      throw new Error(`File: ${fileId} not found`)
    }
    const file = await downloadFile(fileInst.remoteUrl)
    console.log('downloaded remote file', file.name, file)
    _setLocalFileDownloadStatus(fileId, 'inProgress')
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

  const uploadLocalFile = async (fileId: string, localFile: LocalFileInst): Promise<Record<string, LocalFileInst>> => {
    console.log('uploading local file', fileId)
    const file = await readFile(localFile.path)
    _setLocalFileUploadStatus(fileId, 'inProgress')
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

  const syncFiles = async () => {
    // Remote files that require download
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    const fileActionPromises = Object.entries(localFiles).map(async ([fileId, localFile]) => {
      if (localFile.downloadStatus === 'pending') {
        _setLocalFileDownloadStatus(fileId, 'queued')
        return downloadRemoteFile(fileId)
      } else if (localFile.uploadStatus === 'pending') {
        _setLocalFileUploadStatus(fileId, 'inProgress')
        return uploadLocalFile(fileId, localFile)
      }
    })
    // Execute upload & download promises in parallel
    const fileActionResults = await Promise.all(fileActionPromises)
    store.commit(events.localFileStateSet({
      localFiles: {
        ...localFiles,
        ...Object.assign({}, ...fileActionResults.filter(Boolean))
      }
    }))
    // Delete files locally that are deleted
    const deletedFiles = store.query(queryDb(tables.files.where('deletedAt', '!=', null)))
    await Promise.all(deletedFiles.map(async (file) => deleteLocalFile(file.id)))
  }

  const runFileSync = () => {
    if (unwatch) return
    const files = store.useQuery(queryDb(tables.files.select().where({ deletedAt: null })))
    const watchTrigger = computed(() => files.value.map((file) => file.remoteUrl).join(','))
    unwatch = watch(() => watchTrigger.value, () => {
      updateLocalFileState()
      syncFiles()
    }, { immediate: true })
  }

  return {
    runFileSync
  }
}