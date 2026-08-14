import { useRouteError, useNavigate, isRouteErrorResponse } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/design'
import { useTranslation } from '@/lib/i18n'

/** Per-route error boundary (Phase 9). Mounted as each route's `errorElement`,
 *  so a crash inside one page renders here *inside the Shell outlet* — the
 *  sidebar and command palette keep working and the coach can navigate away.
 *  Without this, any render-time throw blanked the whole app to a white screen.
 *
 *  Nothing here touches the database: a page that crashed on read must not get
 *  a "reset your data" button, which would turn a display bug into data loss. */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const { title, detail } = describe(error, t)

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <AlertTriangle size={32} className="text-ember-600" />
      <h1 className="mt-3 font-display text-lg font-bold text-ink">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-muted">
        {t('routeError.body')}
      </p>
      {detail && (
        <pre className="mt-3 max-w-full overflow-x-auto rounded-ctl border border-line bg-surface2 px-3 py-2 text-start font-mono text-2xs text-faint">
          {detail}
        </pre>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => navigate(0)}>{t('routeError.reload')}</Button>
        <Button onClick={() => navigate('/')}>{t('routeError.home')}</Button>
      </div>
    </div>
  )
}

function describe(error: unknown, t: (k: keyof typeof import('@/lib/i18n/locales/en').en) => string): { title: string; detail: string | null } {
  if (isRouteErrorResponse(error)) {
    // The guard doesn't narrow `unknown` here — react-router-dom v7 and
    // react-router v8 are both installed and their type predicates disagree.
    const res = error as { status: number; statusText?: string }
    return {
      title: res.status === 404 ? t('routeError.notFound') : `Error ${res.status}`,
      detail: res.statusText || null,
    }
  }
  if (error instanceof Error) {
    // The stack is the useful half when a coach sends a screenshot, but the
    // message alone is what's readable — lead with it.
    return { title: t('routeError.title'), detail: error.message }
  }
  return { title: t('routeError.title'), detail: null }
}

export default RouteError
