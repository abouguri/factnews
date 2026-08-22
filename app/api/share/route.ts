import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { AnalysisResult } from '@/types/analysis'

// A real report JSON runs a few KB. This is generous headroom, not a
// realistic size — it exists so the endpoint can't be used to stuff
// arbitrary large blobs into the database.
const MAX_RESULT_BYTES = 100_000

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    r.version === 2 &&
    (r.tier === 'free' || r.tier === 'paid') &&
    typeof r.overallScore === 'number' &&
    typeof r.structural === 'object' && r.structural !== null &&
    typeof r.metadata === 'object' && r.metadata !== null
  )
}

export async function POST(request: Request): Promise<Response> {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: 'Sharing is not available right now.' }, { status: 503 })
  }

  let body: { result?: unknown; url?: string | null }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { result, url } = body ?? {}
  if (!isAnalysisResult(result)) {
    return Response.json({ error: 'Not a recognizable analysis result.' }, { status: 400 })
  }
  if (JSON.stringify(result).length > MAX_RESULT_BYTES) {
    return Response.json({ error: 'Result too large to share.' }, { status: 413 })
  }
  if (url !== undefined && url !== null && typeof url !== 'string') {
    return Response.json({ error: 'url must be a string.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shared_reports')
    .insert({ url: url || null, result })
    .select('id')
    .single()

  if (error || !data) {
    console.error('Failed to create shared report:', error?.message)
    return Response.json({ error: 'Could not create the share link.' }, { status: 500 })
  }

  return Response.json({ id: data.id as string })
}
