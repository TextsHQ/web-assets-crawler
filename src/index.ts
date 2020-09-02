import puppeteer from 'puppeteer'
import chalk from 'chalk'
import bluebird from 'bluebird'
import url from 'url'
import path from 'path'
import execa from 'execa'
import jsBeautify from 'js-beautify'
import prettier from 'prettier'
import { promises as fs } from 'fs'

import config from './config'
import { Site } from './types'
import { writeFileCreatingDir } from './util'

function tryBeautify(body: Buffer, isJS: boolean, isCSS: boolean) {
  try {
    const txt = body.toString('utf-8')
    if (isJS) {
      const beautified = jsBeautify.js(txt)
      return prettier.format(beautified, { parser: 'babel' })
    }
    if (isCSS) return jsBeautify.css(txt)
  } catch (err) {
    console.error(chalk.red('[error] beautify'), err)
  }
}

async function processResource(site: Site, res) {
  const { hostname, pathname } = url.parse(res.url)
  const isJS = pathname.endsWith('.js')
  const isCSS = pathname.endsWith('.css')
  if ((!isJS && !isCSS) || (site.ignoreURLList || []).includes(res.url)) {
    console.log(chalk.gray('ignoring'), res.url)
    return
  }
  const body = tryBeautify(res.body, isJS, isCSS)
  const fileName = path.basename(pathname)
  const { normalizedDirName, normalizedFileName } = site.normalize({ hostname, pathname, body })
  const regularDirPath = path.join(config.outputNormalizedDirLocation, site.id, hostname, path.dirname(pathname))
  const gitDirPath = path.join(config.outputGitDirLocation, site.id, hostname, normalizedDirName)
  await writeFileCreatingDir(regularDirPath, fileName, body)
  await writeFileCreatingDir(gitDirPath, normalizedFileName, body)
  if (fileName !== normalizedFileName) await writeFileCreatingDir(gitDirPath, normalizedFileName + '.og-url.txt', res.url)
  console.log(res.url, chalk.green('→'), fileName, normalizedFileName)
}

async function gitCommit(site: Site) {
  console.log(chalk`{green Committing} ${site.id}`)
  const gitDirPath = path.join(config.outputGitDirLocation, site.id)
  try {
    await execa('git', ['add', gitDirPath], { cwd: config.outputGitDirLocation, stdio: 'inherit' })
    await execa('git', ['commit', '-m', site.id], { cwd: config.outputGitDirLocation, stdio: 'inherit' })
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
  const pausedRequests = []

  const nextRequest = () => { // continue the next request or "unpause"
    if (pausedRequests.length === 0) {
      paused = false
    } else {
      // continue first request in "queue"
      (pausedRequests.shift())() // calls the request.continue function
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

    let body: Buffer
    if (request.redirectChain().length === 0) {
      try {
        body = await response.buffer()
      } catch (err) { console.error(err) }
    }

    const resource = {
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
    fs.access(path.join(config.outputGitDirLocation, '.git'))
  } catch (err) {
    console.error(err)
    console.error('Make sure git repository exists at', config.outputGitDirLocation)
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
