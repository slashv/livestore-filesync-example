import { useStore } from 'vue-livestore'
import { hashFile, makeStoredFilePath } from '../utils/file.utils'
import { localFileStorage } from './local-file-storage'
import { remoteFileStorage } from './remote-file-storage'
import { queryDb } from '@livestore/livestore'
import { tables, events } from '../livestore/schema'

export const fileStorage = () => {
  const { store } = useStore()
  const { writeFile, deleteFile: deleteLocalFile } = localFileStorage()
  const { deleteFile: deleteRemoteFile } = remoteFileStorage()

  const saveFile = async (file: File): Promise<string> => {
    const { id: fileId, path } = makeStoredFilePath(file.name)
    const fileHash = await hashFile(file)

    await writeFile(path, file)

    store.commit(events.fileCreated({
      id: fileId,
      localPath: path,
      contentHash: fileHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    const { localFiles } = store.query(queryDb(tables.localFileState.get()))
    store.commit(events.localFileStateSet({
      localFiles: {
        ...localFiles,
        [fileId]: {
          path: path,
          localHash: fileHash,
          downloadStatus: 'done',
          uploadStatus: 'pending',
          lastSyncError: '',
        }
      }
    }))
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
    try {
      await deleteLocalFile(file.localPath)
    } catch(e) {
      console.error('Error deleting local file', e)
    }
    try {
      await deleteRemoteFile(file.remoteUrl)
    } catch(e) {
      console.error('Error deleting remote file', e)
    }
  }

  const fileUrl = async (fileId: string): Promise<string> => {
    const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    if (!file) throw new Error(`File not found: ${fileId}`)
    return `/${file.localPath}`
  }

  return {
    saveFile,
    fileUrl,
    deleteFile
  }
}