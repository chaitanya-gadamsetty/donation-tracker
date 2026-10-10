// Minimal Google Drive v3 client for the hidden appDataFolder.

export interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
  appProperties?: Record<string, string>
}

/** The operations sync needs — an interface so tests can use an in-memory fake. */
export interface DriveApi {
  list(): Promise<DriveFile[]>
  readText(id: string): Promise<string>
  readBlob(id: string): Promise<Blob>
  create(name: string, body: Blob, appProperties?: Record<string, string>): Promise<DriveFile>
  update(id: string, body: Blob): Promise<void>
  copy(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
}

export class DriveAuthError extends Error {
  constructor() {
    super('Google sign-in has expired.')
  }
}

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

export function googleDrive(token: string): DriveApi {
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) } })
    if (res.status === 401) throw new DriveAuthError()
    if (!res.ok && !(init.method === 'DELETE' && res.status === 404)) {
      let detail = ''
      try { detail = (await res.json())?.error?.message ?? '' } catch { /* ignore */ }
      throw new Error(`Google Drive error ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    return res
  }

  return {
    async list() {
      const files: DriveFile[] = []
      let pageToken = ''
      do {
        const q = new URLSearchParams({
          spaces: 'appDataFolder',
          fields: 'nextPageToken, files(id, name, modifiedTime, appProperties)',
          pageSize: '1000',
          ...(pageToken ? { pageToken } : {}),
        })
        const data = await (await call(`${API}/files?${q}`)).json()
        files.push(...(data.files ?? []))
        pageToken = data.nextPageToken ?? ''
      } while (pageToken)
      return files
    },
    async readText(id) {
      return (await call(`${API}/files/${id}?alt=media`)).text()
    },
    async readBlob(id) {
      return (await call(`${API}/files/${id}?alt=media`)).blob()
    },
    async create(name, body, appProperties) {
      const boundary = 'dt' + Math.random().toString(36).slice(2)
      const meta = JSON.stringify({ name, parents: ['appDataFolder'], ...(appProperties ? { appProperties } : {}) })
      const multipart = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
        `--${boundary}\r\nContent-Type: ${body.type || 'application/octet-stream'}\r\n\r\n`,
        body,
        `\r\n--${boundary}--`,
      ])
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      })
      return res.json()
    },
    async update(id, body) {
      await call(`${UPLOAD}/files/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': body.type || 'application/octet-stream' },
        body,
      })
    },
    async copy(id, name) {
      await call(`${API}/files/${id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: ['appDataFolder'] }),
      })
    },
    async remove(id) {
      await call(`${API}/files/${id}`, { method: 'DELETE' })
    },
  }
}
