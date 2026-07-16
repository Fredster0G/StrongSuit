import { useState } from 'react'
import { Check, Upload, Save, Play } from 'lucide-react'
import { Button, Input, Label, Card } from '@/design'
import { trainerRepo, clientsRepo } from '@/db/repo'
import type { Trainer, Client } from '@/db/types'
import { newId, nowIso } from '@/lib/core'

interface Props {
  trainer: Trainer
}

export default function OnboardingWizard({ trainer }: Props) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    trainerName: trainer.trainerName || '',
    businessName: trainer.businessName || '',
    units: trainer.units || 'lb',
    brandColor: trainer.brandColor || '#3b82f6',
    logoDataUrl: trainer.logoDataUrl || ''
  })
  const [seeding, setSeeding] = useState(false)

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, logoDataUrl: ev.target?.result as string }))
    }
    reader.readAsDataURL(file)
  }

  async function seedDemoData() {
    setSeeding(true)
    const t = nowIso()
    
    const demoClients: Client[] = [
      { id: newId(), createdAt: t, updatedAt: t, status: 'active', firstName: 'Alex', lastName: 'Demo', isDemo: true, email: 'alex@example.com', startDate: t, tags: [], goals: '', injuries: '', parqNotes: '' },
      { id: newId(), createdAt: t, updatedAt: t, status: 'active', firstName: 'Sam', lastName: 'Sample', isDemo: true, email: 'sam@example.com', startDate: t, tags: [], goals: '', injuries: '', parqNotes: '' },
      { id: newId(), createdAt: t, updatedAt: t, status: 'active', firstName: 'Jordan', lastName: 'Test', isDemo: true, email: 'jordan@example.com', startDate: t, tags: [], goals: '', injuries: '', parqNotes: '' }
    ]

    for (const c of demoClients) {
      await clientsRepo.create(c)
    }

    setSeeding(false)
    setStep(4)
  }

  async function complete() {
    await trainerRepo.patch({
      trainerName: form.trainerName,
      businessName: form.businessName,
      units: form.units as 'lb' | 'kg',
      brandColor: form.brandColor,
      logoDataUrl: form.logoDataUrl,
      onboardingComplete: true
    })
    
    // Attempt storage persist
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist() } catch (e) { /* ignore */ }
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <Card className="max-w-xl w-full p-8 shadow-2xl border-line">
        
        {step === 1 && (
          <div className="text-center space-y-6">
            <h1 className="text-3xl font-display font-bold text-ink">Welcome to Strongsuit</h1>
            <p className="text-muted text-lg">
              The professional workshop instrument for coaches. Let's get your workspace set up in about 60 seconds.
            </p>
            <div className="pt-4">
              <Button variant="primary" className="w-full text-lg py-3" onClick={() => setStep(2)}>
                Get Started
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">Your Identity</h2>
              <p className="text-faint text-sm">This powers the Companion app that clients will see.</p>
            </div>

            <div className="space-y-4">
              <div><Label>Your Name</Label><Input 
                value={form.trainerName} onChange={e => setForm({ ...form, trainerName: e.target.value })} 
                autoFocus
              /></div>
              <div><Label>Business Name</Label><Input 
                value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} 
              /></div>
              
              <div>
                <Label>Units</Label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="units" value="lb" checked={form.units === 'lb'} onChange={() => setForm({ ...form, units: 'lb' })} />
                    <span className="text-ink font-medium">Pounds (lb)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="units" value="kg" checked={form.units === 'kg'} onChange={() => setForm({ ...form, units: 'kg' })} />
                    <span className="text-ink font-medium">Kilograms (kg)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <Label>Brand Color</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <input 
                      type="color" 
                      value={form.brandColor} onChange={e => setForm({ ...form, brandColor: e.target.value })}
                      className="h-10 w-16 p-1 cursor-pointer bg-surface border border-line rounded"
                    />
                    <span className="text-sm font-mono text-faint">{form.brandColor}</span>
                  </div>
                </div>
                <div>
                  <Label>Logo</Label>
                  <div className="mt-1 flex items-center gap-3">
                    {form.logoDataUrl ? (
                      <img src={form.logoDataUrl} className="w-10 h-10 rounded bg-white object-contain border border-line" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-surface border border-line flex items-center justify-center text-muted">
                        <Upload size={16} />
                      </div>
                    )}
                    <label className="cursor-pointer text-sm font-medium text-brand hover:underline">
                      Upload
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">Demo Data</h2>
              <p className="text-faint text-sm">Would you like to explore with sample clients?</p>
            </div>

            <div className="bg-surface2 p-6 rounded-xl border border-line text-center">
              <Play size={32} className="mx-auto text-verde-500 mb-4" />
              <h3 className="font-semibold text-lg text-ink mb-2">Explore with 3 sample clients</h3>
              <p className="text-muted text-sm mb-6 max-w-sm mx-auto">
                Includes sample history, check-ins, and active programs so you can see how the analytics and logger work. Remove them anytime in one click.
              </p>
              <Button variant="primary" className="w-full justify-center" onClick={seedDemoData} disabled={seeding}>
                {seeding ? 'Loading...' : 'Add Demo Data'}
              </Button>
              <div className="mt-4">
                <Button variant="ghost" className="w-full justify-center" onClick={() => setStep(4)}>
                  Skip, start with an empty roster
                </Button>
              </div>
            </div>

            <div className="pt-4 flex justify-start border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-ink mb-1">Data Ownership</h2>
              <p className="text-faint text-sm">Strongsuit is local-first software.</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 p-5 rounded-xl border border-amber-200 dark:border-amber-900/50">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-500 rounded-lg shrink-0">
                  <Save size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-900 dark:text-amber-500 mb-1">Your data lives on your device</h3>
                  <p className="text-amber-800/80 dark:text-amber-500/80 text-sm leading-relaxed mb-4">
                    There are no cloud servers. All client data, programs, and history are saved directly in your browser. This makes the app blisteringly fast and extremely private.
                  </p>
                  <p className="text-amber-800/80 dark:text-amber-500/80 text-sm font-semibold">
                    You are responsible for your own backups. We will remind you to export a backup file every 7 days.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-line mt-6">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button variant="primary" onClick={complete}><Check size={16} className="mr-2" /> I understand, let's go</Button>
            </div>
          </div>
        )}

      </Card>
    </div>
  )
}
