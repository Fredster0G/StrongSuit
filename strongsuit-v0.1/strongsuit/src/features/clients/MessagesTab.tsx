import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, MessageSquare } from 'lucide-react'
import { Button, EmptyState, Dialog, Label } from '@/design'
import { messagesRepo } from '@/db/repo'
import type { CoachMessage, MessageDirection, MessageChannel } from '@/db/types'
import { nowIso, newId } from '@/lib/core'

interface MessagesTabProps {
  clientId: string
}

function LogMessageDialog({ clientId, open, onClose }: { clientId: string; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<{
    date: string
    direction: MessageDirection
    channel: MessageChannel
    content: string
  }>({
    date: new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
    direction: 'outbound',
    channel: 'sms',
    content: ''
  })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    
    const msg: CoachMessage = {
      id: newId(),
      clientId,
      date: new Date(form.date).toISOString(),
      direction: form.direction,
      channel: form.channel,
      content: form.content,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }

    await messagesRepo.create(msg)
    onClose()
    setForm(f => ({ ...f, content: '' }))
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log Message">
      <form onSubmit={save} className="space-y-4">
        <div><Label>Date & Time</Label><input 
          type="datetime-local" required className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
          value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} 
        /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Direction</Label>
            <select className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value as MessageDirection })}>
              <option value="outbound">Outbound (I sent)</option>
              <option value="inbound">Inbound (Client sent)</option>
            </select>
          </div>
          <div><Label>Channel</Label>
            <select className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1"
              value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as MessageChannel })}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="in-person">In-person</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        
        <div>
          <Label>Message Content</Label>
          <textarea 
            required
            className="w-full bg-surface border border-line rounded px-3 py-2 text-ink mt-1" 
            rows={4} 
            value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} 
          />
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Save Message</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function MessagesTab({ clientId }: MessagesTabProps) {
  const messages = useLiveQuery(
    () => messagesRepo.forClient(clientId),
    [clientId],
    []
  )

  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Message Log</h3>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="mr-1.5" /> Log Message
        </Button>
      </div>

      {(!messages || messages.length === 0) ? (
        <EmptyState 
          icon={<MessageSquare size={28} strokeWidth={1.5} />}
          title="No messages logged" 
          body="Keep track of asynchronous communication with this client." 
        />
      ) : (
        <div className="space-y-4">
          {messages.map(m => {
            const isOutbound = m.direction === 'outbound'
            const timeStr = new Date(m.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            return (
              <div key={m.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] rounded-xl p-3 ${isOutbound ? 'bg-verde-600 text-white rounded-br-none' : 'bg-surface border border-line rounded-bl-none'}`}>
                  <div className={`text-xs mb-1 ${isOutbound ? 'text-white/80' : 'text-faint'} flex items-center justify-between gap-4`}>
                    <span className="font-semibold uppercase tracking-wider">{m.channel}</span>
                    <span>{timeStr}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <LogMessageDialog clientId={clientId} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
