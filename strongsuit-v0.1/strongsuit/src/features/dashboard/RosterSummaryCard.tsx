import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, ChevronRight } from 'lucide-react'
import { Card, Button } from '@/design'
import { generateReply, isAssistantModelInstalled } from '@/lib/assistant'
import { buildRosterCheckInContext } from '@/lib/rosterSummary'
import { useLiveQuery } from 'dexie-react-hooks'
import { checkInsRepo } from '@/db/repo'
import { useTranslation } from '@/lib/i18n'
import { Link } from 'react-router-dom'

const PROMPT = "Review the provided roster check-in summary. Write a very brief 2-4 sentence digest for the coach. Highlight any clients who have poor readiness (red/amber) or bad sleep/energy. If everyone is green, just say so. Do not invent anything."

export function RosterSummaryCard() {
  const [isOpen, setIsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { t } = useTranslation()

  // Only show if we actually have some check-ins at all
  const hasCheckIns = useLiveQuery(async () => (await checkInsRepo.table.count()) > 0, [], false)
  // Gate on the assistant model actually being installed — generateReply()
  // calls the same @huggingface/transformers pipeline() the Assistant page
  // uses, and if the model isn't cached that call SILENTLY starts a ~1.1GB
  // download with no progress UI wired here (generateReply exposes no
  // onProgress hook, unlike installAssistantModel). Without this check, a
  // coach clicking "Generate" from the Dashboard — never having opened
  // Settings → Local AI — would trigger a multi-gigabyte background
  // download behind a spinner that just says "thinking".
  const modelReady = useLiveQuery(() => isAssistantModelInstalled(), [], null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function handleGenerate() {
    if (isGenerating || !modelReady) return
    setIsOpen(true)
    setIsGenerating(true)
    setSummaryText('')

    abortRef.current = new AbortController()

    try {
      const context = await buildRosterCheckInContext()
      await generateReply(
        [{ role: 'user', content: PROMPT }],
        (text) => setSummaryText(text),
        { context, signal: abortRef.current.signal }
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setSummaryText(t('dashboard.rosterSummary.error'))
      }
    } finally {
      setIsGenerating(false)
    }
  }

  function handleClose() {
    abortRef.current?.abort()
    setIsOpen(false)
    setIsGenerating(false)
    setSummaryText(null)
  }

  if (!hasCheckIns) return null

  if (!isOpen) {
    return (
      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-verde-600/30 bg-verde-100/40 hover:border-verde-600/50 transition-colors">
        <div>
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Sparkles size={16} className="text-verde-600" /> {t('dashboard.rosterSummary.title')}
          </h3>
          <p className="text-xs text-muted mt-1">
            {modelReady === false
              ? t('dashboard.rosterSummary.needsModel')
              : t('dashboard.rosterSummary.body')}
          </p>
        </div>
        {modelReady === false ? (
          <Link to="/settings">
            <Button variant="secondary" size="sm" className="whitespace-nowrap">
              {t('dashboard.rosterSummary.installModel')} <ChevronRight size={14} />
            </Button>
          </Link>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={!modelReady} className="whitespace-nowrap">
            {t('dashboard.rosterSummary.generate')} <ChevronRight size={14} />
          </Button>
        )}
      </Card>
    )
  }

  return (
    <Card className="border-verde-600/30 bg-verde-100/40 relative">
      <button
        onClick={handleClose}
        className="absolute top-3 right-3 text-faint hover:text-ink transition-colors"
        aria-label="Close"
      >
        <X size={16} />
      </button>
      <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-verde-600" /> {t('dashboard.rosterSummary.title')}
      </h3>
      
      <div className="text-sm prose prose-sm prose-p:my-1 prose-ul:my-1 max-w-none min-h-[4rem]">
        {summaryText ? (
          <p className="whitespace-pre-wrap">{summaryText}</p>
        ) : (
          <p className="text-muted animate-pulse">{t('dashboard.rosterSummary.loading')}</p>
        )}
      </div>
    </Card>
  )
}
