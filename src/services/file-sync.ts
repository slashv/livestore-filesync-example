import { Schema } from '@livestore/livestore'
import { localFileStorage } from '../services/local-file-storage'
import { remoteFileStorage } from '../services/remote-file-storage'
import { hashFile } from '../utils/file.utils'
import { useStore } from 'vue-livestore'
import { queryDb } from '@livestore/livestore'
import { tables, events, localFileState as localFileStateSchema, localFilesState as localFilesStateSchema } from '../livestore/schema'

const localFileStateSchemaMutable = Schema.mutable(localFileStateSchema)
type LocalFileInst = typeof localFileStateSchemaMutable.Type
const localFilesStateSchemaMutable = Schema.mutable(localFilesStateSchema)
type LocalFilesState = typeof localFilesStateSchemaMutable.Type
type FileInst = typeof tables.files.rowSchema.Type

export const fileSync = () => {
  const { store } = useStore()
  const { fileExists, writeFile, readFile, deleteFile } = localFileStorage()
  const { downloadFile, uploadFile } = remoteFileStorage()

  const _localFileValid = async (localFile: LocalFileInst, file: FileInst): Promise<boolean> => {
      const schemaMatches = Schema.is(localFileStateSchema)(localFile)
      const contentMatch = file.contentHash === localFile.localHash
      // const fileExsitsLocally = await fileExists(localFile.opfsKey)
      return schemaMatches && contentMatch // && fileExsitsLocally
  }

  const updateLocalFileState = () => {
    const files = store.query(queryDb(tables.files.where({ deletedAt: null })))
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))

    const newLocalFileState: LocalFilesState = {}
    files.forEach(async (file) => {
      const localFilePresent = file.id in localFiles
      // const localFileValid = localFilePresent && await _localFileValid(localFiles[file.id]!, file)
      if (localFilePresent) {
        newLocalFileState[file.id] = localFiles[file.id]!
      } else {
        newLocalFileState[file.id] = {
          opfsKey: '',
          localHash: '',
          downloadStatus: 'pending',
          uploadStatus: 'done',
          lastSyncError: ''
        }
      }
    })
    store.commit(events.localFileStateSet({ localFiles: newLocalFileState }))
  }

  const _setLocalFileUploadStatus = (fileId: string, status: LocalFileInst['uploadStatus']) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({ ...localFiles, [fileId]: { ...localFiles[fileId], uploadStatus: status } }))
  }

  const _setLocalFileDownloadStatus = (fileId: string, status: LocalFileInst['downloadStatus']) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({ ...localFiles, [fileId]: { ...localFiles[fileId], downloadStatus: status } }))
  }

  const downloadRemoteFile = async (fileId: string): Promise<Record<string, LocalFileInst>> => {
    const fileInst = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    if (!fileInst) {
      throw new Error(`File: ${fileId} not found`)
    }
    const file = await downloadFile(fileInst.remoteUrl)
    _setLocalFileDownloadStatus(fileId, 'inProgress')
    await writeFile(file.name, file)
    return {
      [fileId]: {
        opfsKey: file.name,
        localHash: await hashFile(file),
        downloadStatus: 'done',
        uploadStatus: 'done',
        lastSyncError: ''
      }
    }
  }

  const uploadLocalFile = async (fileId: string, localFile: LocalFileInst): Promise<Record<string, LocalFileInst>> => {
    const file = await readFile(localFile.opfsKey)
    _setLocalFileUploadStatus(fileId, 'inProgress')
    const remoteUrl = await uploadFile(file)
    store.commit(events.fileUpdated({
      id: fileId,
      uploadState: 'done',
      remoteUrl: remoteUrl,
      localPath: localFile.opfsKey,
      contentHash: localFile.localHash,
      updatedAt: new Date(),
    }))
    return {
      [fileId]: {
        ...localFile,
        uploadStatus: 'done',
        lastSyncError: ''
      }
    }
  }

  const deleteLocalFile = async (fileId: string) => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    if (fileId in localFiles) {
      store.commit(events.localFileStateSet({
        localFiles: Object.fromEntries(Object.entries(localFiles).filter(([key]) => key !== fileId))
      }))
    }
    const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    return deleteFile(file.localPath)
  }

  const syncFiles = async () => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    const fileActionPromises = Object.entries(localFiles).map(async ([fileId, localFile]) => {
      if (localFile.downloadStatus === 'pending') {
        _setLocalFileDownloadStatus(fileId, 'queued')
        return downloadRemoteFile(fileId)
      } else if (localFile.uploadStatus === 'pending') {
        _setLocalFileUploadStatus(fileId, 'queued')
        return uploadLocalFile(fileId, localFile)
      }
    })

    const deletedFiles = store.query(queryDb(tables.files.where('deletedAt', '!=', null)))
    const deletedFilesPromises = deletedFiles.map(async (file) => {
      return deleteLocalFile(file.id)
    })
    await Promise.all(deletedFilesPromises)

    const fileActionResults = await Promise.all(fileActionPromises)
    store.commit(events.localFileStateSet({ localFiles: {
      ...localFiles,
      ...Object.assign({}, ...fileActionResults.filter(Boolean))
      }
    }))
  }

  return {
    updateLocalFileState,
    syncFiles
  }
}