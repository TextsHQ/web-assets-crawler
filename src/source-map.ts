import url from 'url'
import { SourceMapConsumer } from 'source-map'

export function extractSourceMapSources(sourceMapTxt: string) {
  return SourceMapConsumer.with(sourceMapTxt, null, consumer =>
    consumer.sources.map((sourceRef) => {
      const originalURL = url.parse(sourceRef)
      const filePath = originalURL.path + (originalURL.hash ?? '')
      const source = consumer.sourceContentFor(sourceRef, true)
      if (!source) return null
      return { originalURL, filePath, source }
    }).filter(Boolean)
  )
}
