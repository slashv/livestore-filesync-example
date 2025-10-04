import { useStore } from 'vue-livestore'
import { hashFile } from '../utils/file.utils'
import { localFileStorage } from './local-file-storage'
import { remoteFileStorage } from './remote-file-storage'
import { queryDb } from '@livestore/livestore'
import { tables, events } from '../livestore/schema'
import { fileSync } from '../services/file-sync'

export const fileStorage = () => {
  const { store } = useStore()
  const { writeFile, getFileUrl, deleteFile: deleteLocalFile } = localFileStorage()
  const { deleteFile: deleteRemoteFile } = remoteFileStorage()
  const { syncFiles } = fileSync()

  const saveFile = async (file: File): Promise<string> => {
    const path = file.name
    const fileHash = await hashFile(file)
    const fileId = crypto.randomUUID()

    console.log('saveFile', fileId, path)

    // Write file to local storage
    await writeFile(path, file)

    // Create file instance in DB
    store.commit(events.fileCreated({
      id: fileId,
      uploadState: 'pending',
      localPath: path,
      contentHash: fileHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    // Update local state with new file
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({
      localFiles: {
        ...localFiles,
        [fileId]: {
          opfsKey: path,
          localHash: fileHash,
          downloadStatus: 'done',
          uploadStatus: 'pending',
          lastSyncError: '',
        }
      }
    }))

    syncFiles()
    return fileId
  }

  const deleteFile = async (fileId: string) => {
    const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    // Delete file from DB
    store.commit(events.fileDeleted({ id: fileId, deletedAt: new Date() }))
    // Remove file from local state
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({
      localFiles: Object.fromEntries(Object.entries(localFiles).filter(([key]) => key !== fileId))
    }))
    // Delete file from local and remote storage
    await deleteLocalFile(file.localPath)
    await deleteRemoteFile(file.remoteUrl)
  }

  const fileUrl = async (fileId: string): Promise<string> => {
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    const localFile = localFiles[fileId]
    if (localFile && localFile.downloadStatus === 'done') {
      return await getFileUrl(localFile.opfsKey)
    } else {
      return file.remoteUrl
    }
  }

  return {
    saveFile,
    fileUrl,
    deleteFile
  }
}