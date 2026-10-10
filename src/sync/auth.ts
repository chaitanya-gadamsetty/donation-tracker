// Google sign-in for Drive sync, using the OAuth "token in redirect" flow.
// A full-page redirect (rather than a popup) works the same in Safari, Chrome and an installed
// Home Screen app on iPhone, where popups are unreliable.
//
// The app only ever asks for drive.appdata: a hidden folder that only this app can see.

export const CLIENT_ID = '99253073247-2ulvegjnh39aou0h8589lnq1cg3ecsjf.apps.googleusercontent.com'
export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

const TOKEN_KEY = 'dt.sync.token'
const STATE_KEY = 'dt.sync.state'
const CONNECTED_KEY = 'dt.sync.connected'
const RETURN_KEY = 'dt.sync.return'

interface StoredToken {
  accessToken: string
  expiresAt: number
}

const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* private mode: sync just asks again */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

export function redirectUri(): string {
  return location.origin + import.meta.env.BASE_URL
}

/** True once the user has connected Drive on this device (until they disconnect). */
export function isConnected(): boolean {
  return storage.get(CONNECTED_KEY) === '1'
}

/** A token with at least a minute left, or null. */
export function getToken(): string | null {
  const raw = storage.get(TOKEN_KEY)
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as StoredToken
    return t.expiresAt - Date.now() > 60_000 ? t.accessToken : null
  } catch {
    return null
  }
}

export function forgetToken() {
  storage.remove(TOKEN_KEY)
}

/** Sends the browser to Google's sign-in page; it comes back to the app with a token. */
export function startSignIn() {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
  storage.set(STATE_KEY, state)
  storage.set(RETURN_KEY, location.hash || '#/')
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'false',
  })
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

/**
 * Call once at startup. If the page was opened by Google's redirect, stores the token, cleans the URL
 * and returns 'signed-in' (or an error message).
 */
export function consumeRedirect(): 'signed-in' | 'none' | { error: string } {
  const hash = location.hash.replace(/^#/, '')
  if (!/(^|&)(access_token|error)=/.test(hash)) return 'none'
  const params = new URLSearchParams(hash)
  const expected = storage.get(STATE_KEY)
  storage.remove(STATE_KEY)
  const back = storage.get(RETURN_KEY) || '#/'
  storage.remove(RETURN_KEY)
  history.replaceState(null, '', location.pathname + location.search + back)

  if (params.get('error')) {
    return { error: params.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed: ${params.get('error')}` }
  }
  if (!expected || params.get('state') !== expected) return { error: 'Sign-in response did not match. Please try again.' }
  if (!(params.get('scope') ?? '').includes('drive.appdata')) {
    return { error: 'Google did not grant access to the app folder. Please try again and allow access.' }
  }
  const token: StoredToken = {
    accessToken: params.get('access_token')!,
    expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000,
  }
  storage.set(TOKEN_KEY, JSON.stringify(token))
  storage.set(CONNECTED_KEY, '1')
  return 'signed-in'
}

/** Disconnect this device: revoke the token with Google and forget it. Data on the device and in Drive stay. */
export async function disconnect() {
  const token = getToken()
  forgetToken()
  storage.remove(CONNECTED_KEY)
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {})
  }
}
