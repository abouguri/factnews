'use client'

import { useState } from 'react'
import { AnalysisResult } from '@/types/analysis'
import { useTranslation } from '@/lib/i18n'

interface ShareButtonProps {
  result: AnalysisResult
  url: string | null
}

type ShareState = 'idle' | 'sharing' | 'copied' | 'failed'

export function ShareButton({ result, url }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle')
  const { t } = useTranslation()

  const handleShare = async () => {
    setState('sharing')
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, url }),
      })
      if (!res.ok) throw new Error('share failed')
      const { id } = await res.json() as { id: string }
      await navigator.clipboard.writeText(`${window.location.origin}/report/${id}`)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2500)
  }

  const accent = state === 'copied' ? 'var(--verified)'
    : state === 'failed' ? 'var(--disputed)'
    : null

  return (
    <button
      onClick={handleShare}
      disabled={state === 'sharing'}
      className="mono"
      style={{
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        padding: '6px 12px',
        borderRadius: 6,
        cursor: state === 'sharing' ? 'not-allowed' : 'pointer',
        border: '0.5px solid var(--fog)',
        color: accent ?? 'var(--ink-2)',
        borderColor: accent ?? 'var(--fog)',
        background: 'transparent',
        whiteSpace: 'nowrap',
        opacity: state === 'sharing' ? 0.6 : 1,
      }}
    >
      {state === 'sharing' ? t('report.shareStarting')
        : state === 'copied' ? t('report.shareCopied')
        : state === 'failed' ? t('report.shareFailed')
        : t('report.shareButton')}
    </button>
  )
}
