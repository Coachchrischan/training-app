import { useState } from 'react'
import { BRANDS, activeBrandId, setBrand, type BrandId } from '../../brands'
import { useBrand } from '../../App'

export default function Settings() {
  const brand = useBrand()
  const [active, setActive] = useState<BrandId>(activeBrandId())

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl">Settings</h1>

      <section className="card p-4">
        <h2 className="mb-1 text-lg">Brand</h2>
        <p className="mb-4 text-sm text-muted">
          Dev switcher. A deployed version pins one brand; this is for previewing all three skins on the same data.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(BRANDS) as BrandId[]).map(id => {
            const b = BRANDS[id]
            return (
              <button
                key={id}
                className={`tile p-4 text-left ${active === id ? 'outline outline-2 outline-primary' : ''}`}
                onClick={() => { setBrand(id); setActive(id); location.reload() }}
              >
                <div className="font-semibold">{b.appName}</div>
                <div className="text-xs text-muted">{b.tagline}</div>
                {b.placeholder && <div className="mt-1 text-[10px] font-bold uppercase text-danger">Placeholder palette</div>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-lg">Modules on for {brand.shortName}</h2>
        <p className="mb-3 text-sm text-muted">Per-brand feature gating keeps every version clean. Flags live in <code>web/src/brands/index.ts</code>.</p>
        <ul className="grid grid-cols-2 gap-1 text-sm">
          {Object.entries(brand.flags).map(([k, v]) => (
            <li key={k} className="flex items-center gap-2">
              <span className={v ? 'text-ok' : 'text-muted'}>{v ? '●' : '○'}</span>
              {k}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
