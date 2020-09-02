export type NormalizeArgs = {
  pathname: string
  hostname: string
  body: string
}

export type Site = {
  id: string
  pageURL: string
  ignoreURLList?: string[]
  screenshot?: boolean
  normalize: (args: NormalizeArgs) => {
    normalizedDirName: string
    normalizedFileName: string
  }
}
