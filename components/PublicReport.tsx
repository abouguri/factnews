'use client'

import { useRouter } from 'next/navigation'
import { AnalysisResult } from '@/types/analysis'
import { CredibilityReport } from '@/components/CredibilityReport'
import { QuantaNav } from '@/components/QuantaSections'

interface PublicReportProps {
  result: AnalysisResult
  url: string | null
}

/**
 * Thin client wrapper around CredibilityReport for a shared, read-only
 * report page. The report component's onReset is built for the stateful
 * input→analyzing→report flow on the homepage; here there's no state
 * machine to reset, so it just sends the visitor home instead.
 */
export function PublicReport({ result, url }: PublicReportProps) {
  const router = useRouter()

  return (
    <div style={{ background: 'var(--bone)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 14px 0' }}>
        <QuantaNav onHome={() => router.push('/')} onOpenHistory={() => router.push('/')} />
      </div>
      <main className="q-container" style={{ paddingTop: 24 }}>
        <CredibilityReport result={result} currentUrl={url} onReset={() => router.push('/')} />
      </main>
    </div>
  )
}
