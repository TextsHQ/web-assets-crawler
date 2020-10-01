import chalk from 'chalk'
import jsBeautify from 'js-beautify'
import prettier from 'prettier'

export function tryBeautify(body: Buffer, isJS: boolean, isCSS: boolean) {
  try {
    if (!body) return
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
