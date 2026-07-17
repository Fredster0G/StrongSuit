// ===== Exercise video — in-app playback (spec §4.3b) =====
// Pure URL classification so the player component just switches on a kind.
// This is the one deliberate, spec-sanctioned network exception: a trainer's
// OWN video link, played where they're using it instead of forcing a new-tab
// context switch. Nothing here is fetched by Coachwright itself — the browser
// loads the trainer-provided URL exactly as it would if they'd pasted it into
// any other tab.

import type { Exercise, ExerciseVideoLink } from '@/db/types'

export type EmbedKind = 'youtube' | 'vimeo' | 'direct' | 'link'
export interface EmbedTarget { kind: EmbedKind; src: string; original: string }

function youTubeId(url: URL): string | null {
  if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname === '/watch') return url.searchParams.get('v')
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] ?? null
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] ?? null
  }
  return null
}

function vimeoId(url: URL): string | null {
  if (!url.hostname.includes('vimeo.com')) return null
  const m = url.pathname.match(/(\d+)/)
  return m ? m[1] : null
}

/** Classify a video URL into how it should be shown in-app. */
export function classifyVideoUrl(rawUrl: string): EmbedTarget {
  try {
    const url = new URL(rawUrl)
    const yt = youTubeId(url)
    if (yt) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}`, original: rawUrl }
    const vm = vimeoId(url)
    if (vm) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${vm}`, original: rawUrl }
    if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url.pathname)) {
      return { kind: 'direct', src: rawUrl, original: rawUrl }
    }
    return { kind: 'link', src: rawUrl, original: rawUrl }
  } catch {
    return { kind: 'link', src: rawUrl, original: rawUrl }
  }
}

/** Merge the legacy single `videoUrl` with the new `videoLinks[]` into one
 *  list, so every UI surface reads from a single source without caring which
 *  schema generation produced the row. */
export function exerciseVideos(ex: Pick<Exercise, 'videoUrl' | 'videoLinks'>): ExerciseVideoLink[] {
  const links = ex.videoLinks ? [...ex.videoLinks] : []
  if (ex.videoUrl && !links.some(l => l.url === ex.videoUrl)) {
    links.unshift({ label: 'Video', url: ex.videoUrl })
  }
  return links
}
