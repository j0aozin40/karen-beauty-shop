import type { SupabaseClient } from '@supabase/supabase-js'
import session from 'express-session'

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000

type GetCallback = (err: any, session?: session.SessionData | null) => void
type WriteCallback = (err?: any) => void

function sessionExpiry(value: session.SessionData) {
  const expires = value.cookie?.expires
  if (expires) {
    const date = expires instanceof Date ? expires : new Date(expires)
    if (Number.isFinite(date.getTime())) return date.toISOString()
  }

  const maxAge = value.cookie?.originalMaxAge
  const ttl = typeof maxAge === 'number' && maxAge > 0 ? maxAge : DEFAULT_SESSION_TTL_MS
  return new Date(Date.now() + ttl).toISOString()
}

export class SupabaseSessionStore extends session.Store {
  private lastCleanupAt = 0

  private readonly client: SupabaseClient

constructor(client: SupabaseClient) {
  super()
  this.client = client
}

  get(sid: string, callback: GetCallback): void {
    void (async () => {
      try {
        const { data, error } = await this.client
          .from('admin_sessions')
          .select('session_data,expires_at')
          .eq('sid', sid)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()
        if (error) return callback(error)
        return callback(null, (data?.session_data as session.SessionData | undefined) ?? null)
      } catch (error) {
        callback(error)
      }
    })()
  }

  set(sid: string, value: session.SessionData, callback?: WriteCallback): void {
    void this.persist(sid, value)
      .then(() => callback?.())
      .catch(error => callback?.(error))
  }

  destroy(sid: string, callback?: WriteCallback): void {
    void (async () => {
      try {
        const { error } = await this.client
          .from('admin_sessions')
          .delete()
          .eq('sid', sid)
        callback?.(error ?? undefined)
      } catch (error) {
        callback?.(error)
      }
    })()
  }

  touch(sid: string, value: session.SessionData, callback?: () => void): void {
    void this.persist(sid, value)
      .then(() => callback?.())
      .catch(() => {
        console.error('Falha ao atualizar a validade da sessão administrativa.')
        callback?.()
      })
  }

  private async persist(sid: string, value: session.SessionData) {
    const now = Date.now()
    if (now - this.lastCleanupAt >= CLEANUP_INTERVAL_MS) {
      this.lastCleanupAt = now
      const { error: cleanupError } = await this.client
        .from('admin_sessions')
        .delete()
        .lte('expires_at', new Date(now).toISOString())
      if (cleanupError) this.lastCleanupAt = 0
    }

    const { error } = await this.client.from('admin_sessions').upsert({
      sid,
      session_data: value,
      expires_at: sessionExpiry(value),
    }, { onConflict: 'sid' })
    if (error) throw error
  }
}
