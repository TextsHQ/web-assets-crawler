import path from 'path'
import url from 'url'
import { promises as fs } from 'fs'
import { trimEnd } from 'lodash'

export async function writeFileCreatingDir(dirPath: string, fileName: string, data: string | Buffer) {
  await fs.mkdir(dirPath, { recursive: true })
  await fs.writeFile(path.join(dirPath, fileName), data)
}

/*
https://developers.google.com/web/updates/2013/06/sourceMappingURL-and-sourceURL-syntax-changed

//@ sourceMappingURL=https://example.com/client.hash.js.map
//# sourceMappingURL=client.hash.js.map
/*@ sourceMappingURL=client.hash.js.map
/*# sourceMappingURL=https://example.com/client.hash.js.map
/*# sourceMappingURL=bundle.hash.css.map *\/
*/
export function extractSourceMapURL(assetTxt: string, ogURL: string) {
  const [, smURL] = /\s[@#](?:\s+)?sourceMappingURL=(.+)/.exec(assetTxt) || []
  if (!smURL) return
  return url.resolve(ogURL, trimEnd(trimEnd(smURL, ' '), '*/'))
}
