import { useStore } from 'vue-livestore'
import { hashFile } from '../utils/file.utils'
import { localFileStorage } from './local-file-storage'
import { queryDb } from '@livestore/livestore'
import { tables, events } from '../livestore/schema'
import { fileSync } from '../services/file-sync'

export const fileStorage = () => {
  const { store } = useStore()
  const { writeFile } = localFileStorage()
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

  return {
    saveFile
  }
}