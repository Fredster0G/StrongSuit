import templateHtml from './template.html?raw'
import type { Client, Program, Trainer, Exercise } from '@/db/types'

export function generateCompanionFile(
  client: Client,
  program: Program,
  trainer: Trainer,
  exercises: Exercise[]
) {
  const payload = {
    client: {
      id: client.id,
      name: client.firstName || 'Client',
    },
    program,
    trainer: {
      name: trainer.businessName || 'Trainer',
      logo: trainer.logoDataUrl,
    },
    exercises: exercises.map(e => ({ id: e.id, name: e.name }))
  }

  const json = JSON.stringify(payload)
  
  // Replace the placeholder strings inside the HTML template
  const finalHtml = templateHtml
    .replace('/*__SS_PAYLOAD__*/', `<script>window.__SS_PAYLOAD = ${json};</script>`)
    .replace('/*__SS_BRAND_COLOR__*/', trainer.brandColor || '#3b82f6')

  // Trigger download
  const blob = new Blob([finalHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${client.firstName || 'client'}_companion.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
