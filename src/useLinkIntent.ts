import { useEffect, useRef } from 'react'
import { LINK_DAMAGED_ERROR } from './packages/link/errors'
import { LINK_INTENTS } from './packages/link/intents'
import { routeFragment } from './packages/link/router'
import type { FragmentRoute } from './packages/link/router'
import { SHARE_CONFIG } from './packages/share/config'

export type LinkRoute = Extract<FragmentRoute, { kind: 'open' | 'error' }>

// Keeps history.state: useNavigationHistory stores the screen there, and Back depends on it.
export function clearFragment(): void {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', pathname + search)
}

/** Routes the link fragment on load and on every later fragment change, clears it, and hands an open or error route to the app. */
export function useLinkIntent(onRoute: (route: LinkRoute) => void): void {
  const handler = useRef(onRoute)
  useEffect(() => { handler.current = onRoute })
  useEffect(() => {
    let cancelled = false
    const handle = () => {
      const hash = window.location.hash
      if (!hash) return
      void routeFragment(hash, LINK_INTENTS, SHARE_CONFIG).then(route => {
        if (route.kind !== 'none') clearFragment()
        if (!cancelled && (route.kind === 'open' || route.kind === 'error')) handler.current(route)
      }).catch(() => {
        clearFragment()
        if (!cancelled) handler.current({ kind: 'error', error: LINK_DAMAGED_ERROR })
      })
    }
    handle()
    // A share URL opened in a tab that already runs the app is a same-document navigation: no remount.
    window.addEventListener('hashchange', handle)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', handle)
    }
  }, [])
}
