import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'
const KEY = 'adl-theme'

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#18181B' : '#E9252A')
  try { localStorage.setItem(KEY, t) } catch { /* private mode: still switches for this visit */ }
  window.dispatchEvent(new CustomEvent('adl:theme', { detail: t }))
}

/** One-click light/dark switch. The choice is remembered on this browser. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(current)
  useEffect(() => {
    const sync = () => setTheme(current())
    window.addEventListener('adl:theme', sync)
    return () => window.removeEventListener('adl:theme', sync)
  }, [])
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className={`btn-ghost rounded-md p-1.5 ${className}`}
      onClick={() => apply(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
