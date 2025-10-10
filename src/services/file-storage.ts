import { useStore } from 'vue-livestore'
import { hashFile, makeStoredFilePath } from '../utils/file.utils'
import { localFileStorage } from './local-file-storage'
import { remoteFileStorage } from './remote-file-storage'
import { queryDb } from '@livestore/livestore'
import { tables, events } from '../livestore/schema'
import { fileSync } from './file-sync'

export const fileStorage = () => {
  const { store } = useStore()
  const { writeFile: writeLocalFile, deleteFile: deleteLocalFile } = localFileStorage()
  const { deleteFile: deleteRemoteFile } = remoteFileStorage()
  const { markLocalFileChanged } = fileSync()

  const saveFile = async (file: File): Promise<string> => {
    const { id: fileId, path } = makeStoredFilePath(file.name)
    const fileHash = await hashFile(file)
    await writeLocalFile(path, file)
    store.commit(events.fileCreated({
      id: fileId,
      path: path,
      contentHash: fileHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    return fileId
  }

  const updateFile = async (fileId: string, file: File) => {
    const fileInstance = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    await writeLocalFile(fileInstance.path, file)
    await markLocalFileChanged(fileId)
  }

  const deleteFile = async (fileId: string) => {
    const file = store.query(queryDb(tables.files.where({ id: fileId }).first()))
    store.commit(events.fileDeleted({ id: fileId, deletedAt: new Date() }))
    try { await deleteLocalFile(file.path) } catch(e) { console.error('Error deleting local file', e) }
    try { await deleteRemoteFile(file.remoteUrl) } catch(e) { console.error('Error deleting remote file', e)
    }
  }

  return {
    saveFile,
    updateFile,
    deleteFile
  }
}