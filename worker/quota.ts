export interface UsageStore {
  used(bucket: string): Promise<number>
  increment(bucket: string, now: number): Promise<number>
  reserve(global: string, ip: string, estimate: number, globalLimit: number, ipLimit: number, now: number): Promise<boolean>
  adjust(global: string, ip: string, delta: number, now: number): Promise<void>
}
export function quotaDecision(global: number, ip: number, estimate: number, globalLimit: number, ipLimit: number, requests = 0, requestLimit = Infinity) {
  if (requests > requestLimit) return 'rate_limited'
  if (global + estimate > globalLimit) return 'global'
  if (ip + estimate > ipLimit) return 'ip'
  return null
}
export class D1Store implements UsageStore {
  constructor(private db: D1Database) {}
  async used(bucket: string) { return (await this.db.prepare('SELECT neurons FROM usage WHERE bucket = ?').bind(bucket).first<{ neurons: number }>())?.neurons ?? 0 }
  async increment(bucket: string, now: number) {
    const row = await this.db.prepare('INSERT INTO usage(bucket, requests, updated_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET requests = requests + 1, updated_at = excluded.updated_at RETURNING requests').bind(bucket, now).first<{ requests: number }>()
    return row!.requests
  }
  async reserve(global: string, ip: string, estimate: number, globalLimit: number, ipLimit: number, now: number) {
    // One SQLite statement checks both budgets and reserves both buckets atomically.
    const result = await this.db.prepare(`INSERT INTO usage(bucket, neurons, updated_at)
      SELECT bucket, ?, ? FROM (SELECT ? AS bucket UNION ALL SELECT ? AS bucket)
      WHERE COALESCE((SELECT neurons FROM usage WHERE bucket = ?), 0) + ? <= ?
        AND COALESCE((SELECT neurons FROM usage WHERE bucket = ?), 0) + ? <= ?
      ON CONFLICT(bucket) DO UPDATE SET neurons = neurons + excluded.neurons, updated_at = excluded.updated_at`)
      .bind(estimate, now, global, ip, global, estimate, globalLimit, ip, estimate, ipLimit).run()
    return result.meta.changes === 2
  }
  async adjust(global: string, ip: string, delta: number, now: number) {
    await this.db.prepare('UPDATE usage SET neurons = MAX(0, neurons + ?), updated_at = ? WHERE bucket IN (?, ?)').bind(delta, now, global, ip).run()
  }
}
export async function buckets(ip: string, date = new Date()) {
  const day = date.toISOString().slice(0, 10)
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}:${day}`))), b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  const minute = date.toISOString().slice(0, 16).replace(/[-T:]/g, '')
  return { day, global: `g:${day}`, ip: `ip:${day}:${hash}`, minute: `m:${minute}:${hash}`, evidence: `e:${minute}:${hash}`, resetsAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString(), retryAfter: 60 - date.getUTCSeconds() }
}
