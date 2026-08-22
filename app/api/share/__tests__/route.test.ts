import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisResult } from '@/types/analysis'

const select = vi.hoisted(() => vi.fn())
const insert = vi.hoisted(() => vi.fn())
const from = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))

import { POST } from '../route'

const VALID_RESULT: AnalysisResult = {
  version: 2,
  tier: 'paid',
  overallScore: 77,
  structural: {
    score: 80,
    flags: [],
    metrics: { hasAuthor: true, hasDate: true, capsRatio: 0, exclamationDensity: 0, suspiciousDomain: false, articleLength: 1200 },
  },
  claims: [],
  metadata: { title: 'A real article', source: 'example.com' },
}

function post(body: unknown): Request {
  return new Request('https://quanta.test/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/share', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    select.mockReset().mockReturnValue({ single: vi.fn(() => Promise.resolve({ data: { id: 'new-id-123' }, error: null })) })
    insert.mockReset().mockReturnValue({ select })
    from.mockReset().mockReturnValue({ insert })
  })

  it('creates a share row and returns its id', async () => {
    const response = await POST(post({ result: VALID_RESULT, url: 'https://example.com/article' }))
    expect(response.status).toBe(200)
    const body = await response.json() as { id: string }
    expect(body.id).toBe('new-id-123')
    expect(from).toHaveBeenCalledWith('shared_reports')
    expect(insert).toHaveBeenCalledWith({ url: 'https://example.com/article', result: VALID_RESULT })
  })

  it('stores a null url when none is provided', async () => {
    await POST(post({ result: VALID_RESULT }))
    expect(insert).toHaveBeenCalledWith({ url: null, result: VALID_RESULT })
  })

  it('503s when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const response = await POST(post({ result: VALID_RESULT }))
    expect(response.status).toBe(503)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON', async () => {
    const response = await POST(post('not json'))
    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a payload missing a recognizable result shape', async () => {
    const response = await POST(post({ result: { foo: 'bar' } }))
    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a result missing version 2', async () => {
    const response = await POST(post({ result: { ...VALID_RESULT, version: 1 } }))
    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects an oversized result', async () => {
    const huge: AnalysisResult = { ...VALID_RESULT, metadata: { ...VALID_RESULT.metadata, title: 'x'.repeat(200_000) } }
    const response = await POST(post({ result: huge }))
    expect(response.status).toBe(413)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a non-string url', async () => {
    const response = await POST(post({ result: VALID_RESULT, url: 12345 }))
    expect(response.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('surfaces a database error as a 500', async () => {
    select.mockReturnValue({ single: vi.fn(() => Promise.resolve({ data: null, error: new Error('connection reset') })) })
    const response = await POST(post({ result: VALID_RESULT }))
    expect(response.status).toBe(500)
  })
})
