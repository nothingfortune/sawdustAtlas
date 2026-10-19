import { useEffect, useRef } from 'react'
import { toHistoryState } from './navigation'
import type { NavAction, NavState } from './navigation'

// Mirrors screen changes into browser history so Back moves between screens instead of leaving the app.
export function useNavigationHistory(nav: NavState, dispatch: (action: NavAction) => void): void {
  const flags = useRef({ skip: false, first: true })
  const navRef = useRef(nav)
  useEffect(() => { navRef.current = nav })
  const { view, boardsMode, activeBoard, activeComposite, furnitureMode, activeFurniture } = nav
  useEffect(() => {
    const state = toHistoryState(nav)
    if (flags.current.skip) { flags.current.skip = false; return }
    if (flags.current.first) { flags.current.first = false; window.history.replaceState(state, ''); return }
    window.history.pushState(state, '')
    // Only the mirrored fields drive history; nav itself changes on every focus or open count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, boardsMode, activeBoard, activeComposite, furnitureMode, activeFurniture])
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      // A fragment navigation (a share link) adds an entry without app state; give it the current screen instead of resetting to Home.
      if (event.state === null) { window.history.replaceState(toHistoryState(navRef.current), ''); return }
      flags.current.skip = true
      dispatch({ type: 'restoreFromHistory', state: event.state })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [dispatch])
}
