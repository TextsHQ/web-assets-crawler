import os from 'os'
import path from 'path'

import { Site, NormalizeArgs } from './types'

const ignoreURLList = [
  'www.google-analytics.com/analytics.js',
  'connect.facebook.net/en_US/sdk.js',
]

const genericNormalize = ({ pathname }: NormalizeArgs) => ({
  normalizedDirName: path.dirname(pathname),
  normalizedFileName: path.basename(pathname).replace(/(.+[._]).+(\.[a-z]+$)/, '$1omittedhash$2'),
})

const igNormalize = ({ pathname }: NormalizeArgs) => ({
  normalizedDirName: path.dirname(pathname),
  normalizedFileName: path.basename(pathname).replace(/[a-f0-9]{12}(\.[a-z]+$)/, 'omittedhash$1'),
})

const messengerNormalize = ({ body, pathname }: NormalizeArgs) => {
  const { base: basename, dir: dirname } = path.parse(pathname)
  if (pathname.endsWith('.js')) {
    if (body.includes('CavalryLogger.start_js')) {
      const [, match] = /start_js\(\[(.+)\]\)/.exec(body)
      if (match) {
        const b64 = JSON.parse(match)
        return {
          normalizedDirName: dirname.includes('/rsrc.php/') ? '/rsrc.php/' : dirname,
          normalizedFileName: Buffer.from(b64, 'base64').toString('hex').replace(/[=/+]/g, '') + '.js',
        }
      }
    }
  }
  return { normalizedDirName: dirname, normalizedFileName: basename }
}

export default {
  waitAfterIdleMs: 20_000,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4182.0 Safari/537.36',
  outputGitDirLocation: path.join(os.homedir(), 'Documents/wac/git'),
  outputNormalizedDirLocation: path.join(os.homedir(), 'Documents/wac/regular'),
  sites: [
    {
      id: 'whatsapp-web',
      pageURL: 'https://web.whatsapp.com/',
      normalize: genericNormalize,
    },
    {
      id: 'twitter',
      pageURL: 'https://twitter.com/messages',
      normalize: genericNormalize,
      ignoreURLList,
    },
    {
      id: 'instagram',
      pageURL: 'https://www.instagram.com/',
      normalize: igNormalize,
      ignoreURLList,
    },
    {
      id: 'messenger',
      pageURL: 'https://www.messenger.com/',
      normalize: messengerNormalize,
    },
    {
      id: 'discord',
      pageURL: 'https://discord.com/login',
      normalize: genericNormalize,
    }
  ] as Site[],
}
