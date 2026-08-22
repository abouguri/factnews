import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { AnalysisResult } from '@/types/analysis'
import { PublicReport } from '@/components/PublicReport'

interface SharedReportRow {
  id: string
  url: string | null
  result: AnalysisResult
}

async function getSharedReport(id: string): Promise<SharedReportRow | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('shared_reports')
    .select('id, url, result')
    .eq('id', id)
    .single()
  return (data as SharedReportRow | null) ?? null
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const row = await getSharedReport(params.id)
  if (!row) return { title: 'Report not found — Quanta' }

  const title = row.result.metadata.title || 'Article analysis'
  const description = `Scored ${row.result.overallScore}/100 by Quanta — Truth, measured.`

  return {
    title: `${title} — Quanta`,
    description,
    openGraph: { title, description, url: `/report/${row.id}`, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
    // Individual shared reports are unlisted links, not canonical site
    // content — indexable pages should be the ones a visitor would
    // actually want to land on from a search result.
    robots: { index: false, follow: true },
  }
}

export default async function SharedReportPage({ params }: { params: { id: string } }) {
  const row = await getSharedReport(params.id)
  if (!row) notFound()

  return <PublicReport result={row.result} url={row.url} />
}
