import path from 'path'
import { promises as fs } from 'fs'

export async function writeFileCreatingDir(dirPath: string, fileName: string, data: string | Buffer) {
  await fs.mkdir(dirPath, { recursive: true })
  await fs.writeFile(path.join(dirPath, fileName), data)
}
