import { useState, useRef, useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import SeasonSelector from './SeasonSelector'
const SCHEDULE_STEPS = [
  { path: '/', label: 'Home', end: true },
  { path: '/season-settings', label: '1. Season Settings' },
  { path: '/teams', label: '2. Teams' },
  { path: '/matchups', label: '3. Matchups' },
  { path: '/slots-networks', label: '4. Slots & Networks' },
  { path: '/weekmap', label: '5. Weekmap' },
  { path: '/ruleset', label: '6. Ruleset' },
  { path: '/run', label: '7. Run' },
  { path: '/history', label: '8. History' },
]

const ML_STEPS = [
  { path: '/ml-model', label: 'Sunday Model' },
  { path: '/ml-primetime', label: 'PrimeTime Model' },
  { path: '/ml-rematches', label: 'Rematches' },
  { path: '/ml-futures', label: 'Futures' },
]

const NavBar = () => {
  const [gearOpen, setGearOpen] = useState(false)
  const gearRef = useRef<HTMLDivElement>(null)

  // Close gear dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <nav className="bg-slate-900 text-white shadow-lg">
      <div className="max-w-screen-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <span className="text-base font-bold tracking-wider uppercase text-slate-100">
            Schedule Optimizer
          </span>
          <div className="flex items-center gap-3">
            <SeasonSelector />
            {/* ── Gear / Settings ── */}
            <div ref={gearRef} className="relative">
              <button
                onClick={() => setGearOpen((o) => !o)}
                title="Settings"
                className="text-slate-400 hover:text-white p-1.5 rounded transition-colors text-base leading-none"
              >
                ⚙
              </button>
              {gearOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 min-w-[200px] z-50 py-1">
                  <Link
                    to="/net-cats"
                    onClick={() => setGearOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Network Categories
                  </Link>
                  <Link
                    to="/color-policy"
                    onClick={() => setGearOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Color Policy
                  </Link>
                  <div className="my-1 border-t border-slate-100" />
                  <Link
                    to="/solver-config"
                    onClick={() => setGearOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Solver Config
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-0.5 pb-1 overflow-x-auto items-end">
          {/* ── Schedule workflow tabs ── */}
          {SCHEDULE_STEPS.map((step) => (
            <NavLink
              key={step.path}
              to={step.path}
              end={step.end}
              className={({ isActive }) =>
                `px-3 py-1.5 text-xs font-medium rounded-t whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-white text-slate-900'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`
              }
            >
              {step.label}
            </NavLink>
          ))}

          {/* ── Section separator ── */}
          <div className="flex items-center self-stretch px-2 gap-1.5 flex-shrink-0">
            <div className="w-px bg-slate-600 self-stretch my-1" />
            <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest leading-none select-none">
              ML
            </span>
            <div className="w-px bg-slate-600 self-stretch my-1" />
          </div>

          {/* ── ML input tabs ── */}
          {ML_STEPS.map((step) => (
            <NavLink
              key={step.path}
              to={step.path}
              className={({ isActive }) =>
                `px-3 py-1.5 text-xs font-medium rounded-t whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-sky-400 text-slate-900'
                    : 'text-sky-400 hover:text-sky-200 hover:bg-sky-950/60'
                }`
              }
            >
              {step.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default NavBar
