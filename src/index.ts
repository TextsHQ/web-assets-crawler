import url from 'url'
import path from 'path'
import { promises as fs } from 'fs'
import puppeteer from 'puppeteer'
import chalk from 'chalk'
import bluebird from 'bluebird'
import execa from 'execa'
import got from 'got'
import { truncate } from 'lodash'

import config from './config'
import { Site } from './types'
import { writeFileCreatingDir, extractSourceMapURL } from './util'
import { extractSourceMapSources } from './source-map'
import { tryBeautify } from './beautify'

type Resource = {
  url: string
  body: Buffer
}

async function writeFile(site: Site, resURL: string, body: string) {
  const { hostname, pathname } = url.parse(resURL)

  const fileName = path.basename(pathname)
  const { normalizedDirName, normalizedFileName } = site.normalize({ hostname, pathname, body })

  const regularDirPath = path.join(config.outputNormalizedDirLocation, site.id, hostname, path.dirname(pathname))
  const gitDirPath = path.join(config.outputGitDirLocation, site.id, hostname, normalizedDirName)

  await writeFileCreatingDir(regularDirPath, fileName, body)
  await writeFileCreatingDir(gitDirPath, normalizedFileName, body)
  if (fileName !== normalizedFileName) await writeFileCreatingDir(gitDirPath, normalizedFileName + '.og-url.txt', resURL)

  console.log(resURL, chalk.green('→'), fileName, normalizedFileName)
}

function fetch(uri: string) {
  if (uri.startsWith('data:')) {
    const b64 = uri.split(',')?.[1]
    if (!b64) return null
    return Buffer.from(b64, 'base64').toString()
  }
  console.log(chalk`Fetching source map at {gray ${uri}}`)
  return got(uri, { responseType: 'text', resolveBodyOnly: true, throwHttpErrors: false })
}

async function processSourceMap(site: Site, resURL: string, sourceMapURL: string) {
  const { hostname } = url.parse(resURL)
  const sourceMap = await fetch(sourceMapURL)
  if (!sourceMap) return
  console.log(chalk`{green Source map found} for ${resURL}`, sourceMapURL.startsWith('data:') ? null : `at ${sourceMapURL}`)
  const sources = await extractSourceMapSources(sourceMap)
  for (const { originalURL, filePath, source } of sources) {
    const dirPath = path.join(config.outputGitDirLocation, site.id, hostname + '_sources', path.dirname(filePath))
    console.log('[source map]', originalURL.href, chalk.green('→'), filePath, `[${source.length} bytes]`)
    await writeFileCreatingDir(dirPath, path.basename(filePath), source)
  }
}

async function processResource(site: Site, res: Resource) {
  const { hostname, pathname } = url.parse(res.url)

  const isJS = pathname.endsWith('.js')
  const isCSS = pathname.endsWith('.css')
  if ((!isJS && !isCSS) || (site.ignoreURLList || []).includes(hostname + pathname)) {
    console.log(chalk.gray('ignoring'), truncate(res.url, { length: 100 }))
    return
  }

  const sourceMapURL = extractSourceMapURL(res.body.toString(), res.url) || res.url + '.map'
  if (sourceMapURL) {
    await processSourceMap(site, res.url, sourceMapURL)
  }

  const beautified = tryBeautify(res.body, isJS, isCSS)
  await writeFile(site, res.url, beautified)
}

const gitExec = (...args: string[]) => execa('git', args, { cwd: config.outputGitDirLocation, stdio: 'inherit' })

async function gitCommit(site: Site) {
  console.log(chalk`{green Committing} ${site.id}`)
  const gitDirPath = path.join(config.outputGitDirLocation, site.id)
  try {
    await gitExec('add', gitDirPath)
    await gitExec('commit', '-m', site.id)
  } catch (err) {
    console.error(err)
  }
}

async function processSite(site: Site) {
  const browser = await puppeteer.launch({
    // headless: false,
    defaultViewport: {
      width: 1200,
      height: 800,
      deviceScaleFactor: 2,
    },
  })
  const page = await browser.newPage()
  await page.setUserAgent(config.userAgent)
  await page.setRequestInterception(true)
  // @ts-expect-error
  await page._client.send('Network.setBypassServiceWorker', { bypass: true })

  // from https://stackoverflow.com/questions/52969381/how-can-i-capture-all-network-requests-and-full-response-data-when-loading-a-pag

  let paused = false
  const pausedRequests: Array<() => any> = []

  const nextRequest = () => { // continue the next request or "unpause"
    if (pausedRequests.length === 0) {
      paused = false
    } else {
      // continue first request in "queue"
      (pausedRequests.shift())?.() // calls the request.continue function
    }
  }

  page.on('request', request => {
    if (paused) {
      pausedRequests.push(() => request.continue())
    } else {
      paused = true // pause, as we are processing a request now
      request.continue()
    }
  })

  page.on('requestfinished', async request => {
    const response = request.response()

    let body: Buffer = undefined
    if (request.redirectChain().length === 0) {
      try {
        body = await response?.buffer()
      } catch (err) { console.error(err) }
    }

    const resource: Resource = {
      url: request.url(),
      body,
      // requestHeaders: request.headers(),
      // responseHeaders: response.headers(),
      // requestPostData: request.postData(),
      // responseSize: responseHeaders['content-length'],
    }
    await processResource(site, resource)

    nextRequest()
  })

  page.on('requestfailed', request => {
    console.log(chalk`{red [Error]} request`, request.failure(), request.url())
    nextRequest()
  })

  await page.goto(site.pageURL, { waitUntil: 'networkidle2' })

  console.log(chalk`{yellow Waiting} ${config.waitAfterIdleMs / 1000}s`)
  await bluebird.delay(config.waitAfterIdleMs)

  if (site.screenshot) {
    const screenshotPath = path.join(config.outputGitDirLocation, site.id, 'screenshot.png')
    await fs.writeFile(screenshotPath, await page.screenshot())
  }

  await browser.close()
}

async function main() {
  const [,, ...args] = process.argv
  try {
    await fs.access(path.join(config.outputGitDirLocation, '.git'))
  } catch (err) {
    console.error('Creating git repository at', config.outputGitDirLocation)
    await gitExec('init')
  }
  const only = args[0] === 'only'
  await bluebird.map(config.sites, async site => {
    if ((only && args[1] === site.id) || !only) {
      console.log(chalk`{green Processing} ${site.id} {gray from} ${site.pageURL}`)
      await processSite(site)
      await gitCommit(site)
    }
  }, { concurrency: 1 })
}

main().catch(console.error)
