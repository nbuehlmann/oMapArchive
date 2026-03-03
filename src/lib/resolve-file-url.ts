export const resolveFileUrl = (url: string): string => {
  if (url.startsWith('local:')) {
    return `/api/local-file?path=${encodeURIComponent(url.slice('local:'.length))}`
  }
  return url
}
