'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function TopLoader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    bar.style.transition = 'none'
    bar.style.width = '0%'
    bar.style.opacity = '1'
    requestAnimationFrame(() => {
      bar.style.transition = 'width 0.3s ease'
      bar.style.width = '80%'
      const finish = setTimeout(() => {
        bar.style.transition = 'width 0.2s ease, opacity 0.3s ease'
        bar.style.width = '100%'
        setTimeout(() => { bar.style.opacity = '0' }, 200)
      }, 300)
      return () => clearTimeout(finish)
    })
  }, [pathname, searchParams])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <div
        ref={barRef}
        style={{
          height: '100%',
          width: '0%',
          background: 'linear-gradient(to right, #0074BD, #00a8ff)',
          boxShadow: '0 0 8px #0074BD',
          opacity: 0,
        }}
      />
    </div>
  )
}