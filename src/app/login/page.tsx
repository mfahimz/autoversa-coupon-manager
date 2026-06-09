'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: '#F7F7F7',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* Left Panel — Brand */}
      <div style={{
        width: '45%',
        backgroundColor: '#162860',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px',
      }}>
        <div>
          <img
            src="/autoversa_temp_logo.jpeg"
            alt="AutoVersa"
            style={{ height: '56px', objectFit: 'contain' }}
          />
        </div>

        <div>
          <h1 style={{
            color: '#FFFFFF',
            fontSize: '36px',
            fontWeight: '700',
            lineHeight: '1.2',
            marginBottom: '16px',
            letterSpacing: '-0.5px',
          }}>
            Coupon Manager
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '16px',
            lineHeight: '1.6',
            maxWidth: '320px',
          }}>
            Issue, track, and manage service coupons across your AutoVersa team.
          </p>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
          © 2026 AutoVersa. All rights reserved.
        </p>
      </div>

      {/* Right Panel — Login Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          <h2 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#1A1A1A',
            marginBottom: '8px',
          }}>
            Sign in
          </h2>
          <p style={{
            color: '#666666',
            fontSize: '15px',
            marginBottom: '36px',
          }}>
            Enter your credentials to access the dashboard.
          </p>

          <form onSubmit={handleLogin}>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#1A1A1A',
                marginBottom: '8px',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@autoversa.com"
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '15px',
                  border: '1.5px solid #E0E0E0',
                  borderRadius: '8px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#1A1A1A',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#0074BD'}
                onBlur={e => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#1A1A1A',
                marginBottom: '8px',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '15px',
                  border: '1.5px solid #E0E0E0',
                  borderRadius: '8px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#1A1A1A',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#0074BD'}
                onBlur={e => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            {error && (
              <div style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '20px',
                color: '#D0021B',
                fontSize: '14px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                backgroundColor: loading ? '#93C5E8' : '#0074BD',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: '600',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: error ? '0' : '20px',
                transition: 'background-color 0.2s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

          </form>
        </div>
      </div>
    </div>
  )
}