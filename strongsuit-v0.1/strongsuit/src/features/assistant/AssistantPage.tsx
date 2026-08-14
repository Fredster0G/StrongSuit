import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Bot, Send, Lock } from 'lucide-react'
import { Button, Card, SectionHeader, EmptyState, LogoSpinner, Textarea } from '@/design'
import { isAssistantModelInstalled, generateReply, type ChatMessage } from '@/lib/assistant'
import { buildClientContext } from '@/lib/assistantContext'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * A plain chat surface, not a full agent — it answers from the context it's
 * given (see `lib/assistant.ts`'s system prompt) and general knowledge, it
 * doesn't take actions on the coach's data or call other app functions.
 * Opened with `?clientId=` (e.g. from a client's page), it grounds every
 * answer in that client's real readiness/session data via
 * `lib/assistantContext.ts` — opened bare, it's a general coaching Q&A with
 * no client data attached at all.
 */
export default function AssistantPage() {
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId')

  const [ready, setReady] = useState<boolean | null>(null)
  const [context, setContext] = useState<string | null>(null)
  const [contextName, setContextName] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    isAssistantModelInstalled().then(setReady)
  }, [])

  useEffect(() => {
    if (!clientId) { setContext(null); setContextName(null); return }
    let cancelled = false
    buildClientContext(clientId).then(ctx => {
      if (cancelled) return
      setContext(ctx)
      setContextName(ctx ? ctx.split('\n')[0].replace('Client: ', '') : null)
    })
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || generating) return
    setInput('')
    const withUser: DisplayMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...withUser, { role: 'assistant', content: '' }])
    setGenerating(true)
    try {
      const history: ChatMessage[] = withUser.map(m => ({ role: m.role, content: m.content }))
      await generateReply(history, token => {
        setMessages(prev => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content + token }
          return copy
        })
      }, { context: context ?? undefined })
    } catch {
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: "Couldn't generate a reply — try again." }
        return copy
      })
    } finally {
      setGenerating(false)
    }
  }

  if (ready === null) {
    return (
      <div className="mx-auto max-w-2xl">
        <SectionHeader title="Assistant" />
        <Card className="animate-pulse text-sm text-faint">Checking…</Card>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-2xl">
        <SectionHeader title="Assistant" />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock size={28} className="text-faint" strokeWidth={1.5} />
          <p className="max-w-md text-sm text-muted">
            Download the assistant model in Settings → On-device AI to turn this on. It runs entirely on this
            machine — no account, no internet, nothing sent anywhere.
          </p>
          <Link to="/settings"><Button variant="primary">Go to Settings</Button></Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col">
      <SectionHeader title="Assistant" />
      <p className="mb-1 text-2xs text-faint">
        Runs on this device only, offline. Small local models can still get things wrong — check anything
        that matters against the real numbers elsewhere in the app.
      </p>
      {contextName && (
        <p className="mb-3 text-2xs text-verde-600">Grounded in {contextName}'s real readiness and recent sessions.</p>
      )}

      <div className="panel-scroll min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
        {messages.length === 0 && (
          <EmptyState
            icon={<Bot size={28} strokeWidth={1.25} />}
            title="Ask a question"
            body={contextName
              ? `Ask about ${contextName}'s recent training, or anything else.`
              : "General coaching questions, or open this from a client's page for answers grounded in their real data."}
          />
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-2 text-sm ${
              m.role === 'user' ? 'bg-verde-600 text-white' : 'border border-line bg-surface text-ink'
            }`}>
              {m.content || (generating && i === messages.length - 1 ? <LogoSpinner size={14} /> : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line pt-3">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask a question…"
          rows={1}
          className="flex-1 resize-none"
          disabled={generating}
        />
        <Button variant="primary" onClick={send} disabled={generating || !input.trim()}>
          <Send size={14} />
        </Button>
      </div>
    </div>
  )
}
