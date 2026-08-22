'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/supabase/auth-context'
import { AnalysisResult, StructuralFlag, FactCheckResult } from '@/types/analysis'
import { getSourceCredibility } from '@/lib/sourceDatabase'
import { useTranslation } from '@/lib/i18n'
import { ClaimCard } from '@/components/ClaimCard'
import { CopyButton } from '@/components/CopyButton'
import { ShareButton } from '@/components/ShareButton'

interface CredibilityReportProps {
  result: AnalysisResult
  currentUrl: string | null
  onReset: () => void
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--verified)'
  if (score >= 60) return 'var(--signal)'
  if (score >= 40) return 'var(--mixed)'
  return 'var(--disputed)'
}

/**
 * A stable, human-quotable ID for a report. Derived from the analysis itself so
 * the same report always carries the same number — including one reopened from
 * history.
 */
function reportIdFor(result: AnalysisResult): string {
  const seed = `${result.analyzedAt ?? 0}|${result.metadata.title ?? ''}|${result.metadata.source ?? ''}|${result.overallScore}`
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)
}

function biasIndex(bias: string): number {
  const map: Record<string, number> = { left: -2, 'center-left': -1, center: 0, 'center-right': 1, right: 2 }
  return map[bias] ?? 0
}

/**
 * Backs out the claims-pass average from the published formula
 * (overallScore = structural×0.3 + claims×0.7) instead of recomputing the
 * verdict penalties here — one scoring formula, in lib/analyze.ts, stays the
 * only place that owns it.
 */
function claimsScoreFrom(result: AnalysisResult): number | null {
  if (result.tier !== 'paid') return null
  return Math.round((result.overallScore - result.structural.score * 0.3) / 0.7)
}

type Confidence = 'high' | 'medium' | 'low'

/** A read heuristic over the same structural signals the score already used — not a new claim about the article. */
function confidenceFrom(result: AnalysisResult): Confidence {
  const { hasAuthor, hasDate, articleLength } = result.structural.metrics
  const signals = [hasAuthor, hasDate, articleLength > 1200].filter(Boolean).length
  if (signals === 3) return 'high'
  if (signals >= 1) return 'medium'
  return 'low'
}

export function CredibilityReport({ result, currentUrl, onReset }: CredibilityReportProps) {
  const { t } = useTranslation()
  const v = {
    color: scoreColor(result.overallScore),
    label: result.overallScore >= 80 ? t('report.reliable')
      : result.overallScore >= 60 ? t('report.moderate')
      : result.overallScore >= 40 ? t('report.questionable')
      : result.overallScore >= 20 ? t('report.low')
      : t('report.highRisk'),
    tone: result.overallScore >= 80 ? t('report.reliableTone')
      : result.overallScore >= 60 ? t('report.moderateTone')
      : result.overallScore >= 40 ? t('report.questionableTone')
      : result.overallScore >= 20 ? t('report.lowTone')
      : t('report.highRiskTone'),
  }

  const analyzedAt = result.analyzedAt ?? null
  const reportId = useMemo(() => reportIdFor(result), [result])
  const reportDate = (analyzedAt ? new Date(analyzedAt) : new Date())
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()

  const sourceLookupUrl = currentUrl || (result.metadata.source ? `https://${result.metadata.source}` : '')
  const source = sourceLookupUrl ? getSourceCredibility(sourceLookupUrl) : null

  const flagCount = result.structural.flags.length
  const flagText = flagCount === 1
    ? t('report.redFlagCount', { n: flagCount })
    : t('report.redFlagCountPlural', { n: flagCount })

  const claimsScore = claimsScoreFrom(result)
  const confidence = confidenceFrom(result)
  const dbHits = result.claims?.filter(c => c.source === 'factcheck_db').length ?? 0
  const structuralPenalty = 100 - result.structural.score

  return (
    <section className="animate-fadeInUp">
      <div style={{ background: 'var(--bone)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button
            onClick={onReset}
            className="mono"
            style={{ fontSize: 11, color: 'var(--grey)', textTransform: 'uppercase', letterSpacing: '0.14em', cursor: 'pointer' }}
          >
            {t('report.analyzeAnother')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--grey)', letterSpacing: '0.14em' }}>
              #{reportId} · {reportDate}
            </div>
            <ShareButton result={result} url={currentUrl} />
            <CopyButton result={result} />
          </div>
        </div>

        {/* Hero verdict */}
        <div style={{
          borderTop: '1px solid var(--ghost)',
          borderBottom: '1px solid var(--ghost)',
          padding: '40px 0',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 56,
          alignItems: 'center',
        }}>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: v.color, marginBottom: 16 }}>
              {t('report.theVerdict')} · {v.label.toLowerCase()}
            </div>
            <h1 style={{
              fontFamily: 'var(--sans)',
              fontWeight: 700,
              fontSize: 'clamp(32px, 4vw, 58px)',
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
              margin: 0,
              maxWidth: '26ch',
              color: 'var(--ink)',
            }}>
              {result.metadata.title || t('report.defaultTitle')}
            </h1>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 26, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--grey)' }}>
              {result.metadata.source && <span>{result.metadata.source}</span>}
              {result.metadata.author && <span>{result.metadata.author}</span>}
              {result.metadata.publishedDate && <span>{result.metadata.publishedDate}</span>}
              {flagCount > 0 && <span style={{ color: 'var(--contested)' }}>{flagText}</span>}
            </div>
          </div>

          <ScoreOdometer score={result.overallScore} color={v.color} label={t('report.overallCredibility')} />
        </div>

        {/* Readouts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'var(--ghost)', borderBottom: '1px solid var(--ghost)' }}>
          <Readout
            label={t('report.readoutStructural')}
            value={String(result.structural.score)}
            tone={scoreColor(result.structural.score)}
            note={flagCount === 0
              ? t('report.readoutStructuralNoteClean')
              : t(flagCount === 1 ? 'report.readoutStructuralNote' : 'report.readoutStructuralNotePlural', { n: flagCount, penalty: structuralPenalty })}
          />
          <Readout
            label={t('report.readoutClaims')}
            value={claimsScore === null ? t('report.readoutClaimsNoScore') : String(claimsScore)}
            tone={claimsScore === null ? 'var(--grey)' : scoreColor(claimsScore)}
            note={claimsScore === null
              ? t('report.readoutClaimsNoteFree')
              : t('report.readoutClaimsNote', { n: result.claims?.length ?? 0, m: dbHits })}
          />
          <Readout
            label={t('report.readoutConfidence')}
            value={t(`report.readoutConfidence${confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low'}`)}
            tone="var(--ink)"
            note={t('report.readoutConfidenceNote')}
          />
          <Readout
            label={t('report.readoutWeighting')}
            value={t('report.readoutWeightingValue')}
            tone="var(--grey)"
            note={t('report.readoutWeightingNote')}
          />
        </div>
      </div>

      {/* Claims */}
      {result.tier === 'paid' && result.claims && result.claims.length > 0 && (
        <ClaimsSection claims={result.claims} dbHits={dbHits} />
      )}
      {result.tier === 'free' && <FreeTierPrompt />}

      {/* Structural flags + source dossier */}
      <section style={{ background: 'var(--bone)', padding: '80px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 64, alignItems: 'start' }}>
          {result.structural.flags.length > 0 ? (
            <StructuralFlagsSection flags={result.structural.flags} structuralScore={result.structural.score} />
          ) : (
            <div style={{ fontFamily: 'var(--sans)', fontSize: 16, color: 'var(--grey)', maxWidth: '40ch' }}>
              {t('report.noStructuralFlags')}
            </div>
          )}
          {source ? (
            <SourceDossier source={source} domain={result.metadata.source || ''} />
          ) : (
            <div style={{ border: '1px solid var(--ghost)', borderRadius: 26, padding: '20px 22px', background: 'var(--white)' }}>
              <p className="smcap" style={{ color: 'var(--grey)', margin: 0 }}>{t('report.sourceOnFile')}</p>
              <p style={{ fontFamily: 'var(--sans)', color: 'var(--ink-2)', marginTop: 10, fontSize: 15 }}>
                {t('report.noSourceUrl')}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Colophon */}
      <div style={{
        borderTop: '1px solid var(--ghost)',
        paddingTop: 20,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 24,
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.14em',
        color: 'var(--grey)',
        textTransform: 'uppercase',
        flexWrap: 'wrap',
      }}>
        <span>{t('report.method')}</span>
        <span>{t('report.endOfReport')}</span>
      </div>
    </section>
  )
}

const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Rolls each digit to the score like a mechanical counter. Re-plays whenever the score changes. */
function ScoreOdometer({ score, color, label }: { score: number; color: string; label: string }) {
  const digits = String(Math.round(score)).padStart(2, '0').split('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {digits.map((d, i) => (
          <span
            key={i}
            style={{
              display: 'block',
              overflow: 'hidden',
              height: '1em',
              fontFamily: 'var(--mono)',
              fontSize: 100,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              color,
            }}
          >
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                transform: mounted ? `translateY(-${GLYPHS.indexOf(d)}em)` : 'translateY(0)',
                transition: `transform 520ms cubic-bezier(.23,1,.32,1) ${(digits.length - 1 - i) * 45}ms`,
              }}
            >
              {GLYPHS.map(g => <span key={g} style={{ display: 'block', height: '1em', lineHeight: 1 }}>{g}</span>)}
            </span>
          </span>
        ))}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--grey)', marginLeft: 6, marginTop: 6 }}>/100</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--grey)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function Readout({ label, value, tone, note }: { label: string; value: string; tone: string; note: string }) {
  return (
    <div style={{ background: 'var(--bone)', padding: '20px 22px' }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey)' }}>{label}</div>
      <div className="mono" style={{ fontSize: 30, letterSpacing: '-0.02em', marginTop: 8, color: tone }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--grey)', marginTop: 4 }}>{note}</div>
    </div>
  )
}

function SourceDossier({ source, domain }: { source: ReturnType<typeof getSourceCredibility>; domain: string }) {
  const { t } = useTranslation()
  const credColor = scoreColor(source.credibilityScore)
  const biasIdx = biasIndex(source.bias)
  const biasLabelMap: Record<string, string> = {
    '-2': t('report.biasLeft'),
    '-1': t('report.biasCenterLeft'),
    '0':  t('report.biasCenter'),
    '1':  t('report.biasCenterRight'),
    '2':  t('report.biasRight'),
  }

  return (
    <div style={{ border: '1px solid var(--ghost)', background: 'var(--white)', position: 'relative', borderRadius: 26, overflow: 'hidden', boxShadow: '0 18px 60px rgba(3,79,70,.10)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--ghost)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey)' }}>
        <span>{t('report.sourceOnFile')}</span>
        <span>{t('report.dossierLabel')}</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 26, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{source.name}</div>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--grey)', marginTop: 4 }}>{domain}</div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 20 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 44, lineHeight: 1, color: credColor }}>{source.credibilityScore}</span>
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey)' }}>
            {t('report.credibilityOnRecord')}
          </span>
        </div>
        <div style={{ display: 'flex', height: 6, marginTop: 16, background: 'var(--bone)', border: '1px solid var(--ghost)' }}>
          <div style={{ width: `${source.credibilityScore}%`, background: credColor }} />
        </div>

        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--grey)', marginTop: 22 }}>
          {t('report.editorialBias')}
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 10 }}>
          {([-2, -1, 0, 1, 2] as const).map(b => (
            <div key={b} style={{ flex: 1, height: 20, border: '1px solid var(--ghost)', background: b === biasIdx ? 'var(--ink)' : 'transparent' }} />
          ))}
        </div>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--grey)', marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('report.biasLeft')}</span>
          <span>{t('report.biasCenterLeft')}</span>
          <span>{t('report.biasCenter')}</span>
          <span>{t('report.biasCenterRight')}</span>
          <span>{t('report.biasRight')}</span>
        </div>

        {(source.strengths?.length || source.notableIssues?.length) ? (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px dashed var(--ghost)', display: 'grid', gap: 14 }}>
            {source.strengths && source.strengths.length > 0 && (
              <div>
                <div className="smcap" style={{ color: 'var(--grey)' }}>{t('report.onItsRecord')}</div>
                <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                  {source.strengths.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--verified)', fontFamily: 'var(--mono)', fontWeight: 700 }}>+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {source.notableIssues && source.notableIssues.length > 0 && (
              <div>
                <div className="smcap" style={{ color: 'var(--grey)' }}>{t('report.onItsRapSheet')}</div>
                <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                  {source.notableIssues.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--unsupported)', fontFamily: 'var(--mono)', fontWeight: 700 }}>!</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {source.factCheckerRating && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--ghost)' }}>
            <div className="smcap" style={{ color: 'var(--grey)' }}>{t('report.factCheckerNote')}</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 15, marginTop: 4, color: 'var(--ink-2)' }}>
              &ldquo;{source.factCheckerRating}.&rdquo;
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClaimsSection({ claims, dbHits }: { claims: FactCheckResult[]; dbHits: number }) {
  const { t } = useTranslation()
  const [openClaim, setOpenClaim] = useState(0)

  return (
    <section style={{
      backgroundColor: 'var(--deep)',
      backgroundImage: [
        'radial-gradient(circle at 14% 31%, var(--lilac) 0 4px, transparent 5px)',
        'radial-gradient(circle at 42% 68%, #FFFFEB 0 4px, transparent 5px)',
        'radial-gradient(circle at 77% 28%, var(--lilac) 0 4px, transparent 5px)',
        'radial-gradient(circle at 86% 78%, #FFFFEB 0 3px, transparent 4px)',
        'linear-gradient(rgba(255,255,235,.09) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,235,.09) 1px, transparent 1px)',
      ].join(', '),
      backgroundSize: 'auto, auto, auto, auto, 40px 40px, 40px 40px',
      color: 'var(--on-deep)', padding: '80px 0', margin: '24px 14px 0', borderRadius: 36,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20, fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        <span>{t('report.ledgerTitle')}</span>
        <span style={{ color: 'var(--on-deep-3)' }}>{t('report.claimsSummary', { n: claims.length, m: dbHits })}</span>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.24)' }}>
        {claims.map((c, i) => (
          <ClaimCard
            key={i}
            result={c}
            index={i}
            open={openClaim === i}
            onToggle={() => setOpenClaim(openClaim === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  )
}

function FreeTierPrompt() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [starting, setStarting] = useState(false)

  const upgrade = async () => {
    if (!user) {
      window.location.href = '/auth/sign-up'
      return
    }
    setStarting(true)
    try {
      const res = await fetch('/api/checkout', { method: 'POST' })
      const body = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (body.url) {
        window.location.href = body.url
      } else {
        setStarting(false)
      }
    } catch {
      setStarting(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bone)',
      padding: '0 0 44px',
    }}>
      <div style={{
        border: '1px solid var(--ghost)',
        borderLeft: '3px solid var(--grey)',
        padding: '22px 24px',
        background: 'var(--white)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 20,
        alignItems: 'center',
      }}>
        <div>
          <p className="smcap" style={{ color: 'var(--grey)', margin: 0 }}>{t('report.claimVerificationPaid')}</p>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 18, margin: '8px 0 0', lineHeight: 1.4, color: 'var(--ink)' }}>
            {t('report.freeTierUpsell')}
          </p>
        </div>
        <button
          onClick={upgrade}
          disabled={starting}
          className="mono"
          style={{
            fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            background: 'var(--ink)', color: 'var(--paper)', padding: '12px 18px', border: 0,
            cursor: starting ? 'not-allowed' : 'pointer', opacity: starting ? 0.6 : 1,
          }}
        >
          {starting ? t('report.freeTierUpgrading') : t('report.freeTierUpgrade')}
        </button>
      </div>
    </div>
  )
}

function StructuralFlagsSection({ flags, structuralScore }: { flags: StructuralFlag[]; structuralScore: number }) {
  const { t } = useTranslation()
  const sevWeight = { high: 3, medium: 2, low: 1 }
  const sorted = [...flags].sort((a, b) => sevWeight[b.severity] - sevWeight[a.severity])
  const sevColor = (s: string) => s === 'high' ? 'var(--unsupported)' : s === 'medium' ? 'var(--misleading)' : 'var(--grey)'
  const sevLabel = (s: string) => s === 'high' ? t('report.severityHigh') : s === 'medium' ? t('report.severityMedium') : t('report.severityLow')
  const penalty = { high: 20, medium: 10, low: 5 } as const

  return (
    <div>
      <div className="mono" style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--grey)', marginBottom: 20 }}>
        {t('report.flagsTitle')}
      </div>
      <div style={{ borderTop: '1px solid var(--ghost)' }}>
        {sorted.map((flag, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 110px minmax(0,1fr) 50px', gap: 18, alignItems: 'baseline', padding: '20px 0', borderBottom: '1px dashed var(--ghost)' }}>
            <span className="mono" style={{ fontSize: 12, letterSpacing: '0.14em', color: 'var(--grey)' }}>{String(i + 1).padStart(2, '0')}</span>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: sevColor(flag.severity), display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: sevColor(flag.severity), flexShrink: 0 }} />
              {sevLabel(flag.severity)}
            </span>
            <div>
              <div style={{ fontSize: 19, lineHeight: 1.3, color: 'var(--ink)' }}>{flag.type}</div>
              <div style={{ fontSize: 15, color: 'var(--grey)', marginTop: 4 }}>{flag.description}</div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--grey)', textAlign: 'right' }}>−{penalty[flag.severity]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 18, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--grey)' }}>
        <span>{t('report.flagsFormula')}</span>
        <span style={{ color: scoreColor(structuralScore) }}>{structuralScore}</span>
      </div>
    </div>
  )
}
