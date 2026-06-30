'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import autoversaLogo from '@/assets/AutoVersa_logo_fav.png'

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
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0A0E1F',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes floatOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(60px, -40px) scale(1.1); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, 50px) scale(1.15); }
        }
        @keyframes floatOrb3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, 30px) scale(0.95); }
        }
        @keyframes gridPan {
          0% { background-position: 0 0; }
          100% { background-position: 60px 60px; }
        }
        @keyframes logoGlow {
          0%, 100% { filter: drop-shadow(0 0 12px rgba(0,116,189,0.5)); }
          50% { filter: drop-shadow(0 0 24px rgba(0,116,189,0.9)); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmerBorder {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        input:focus { border-color: #0074BD !important; box-shadow: 0 0 0 3px rgba(0,116,189,0.2) !important; }
      `}</style>

      {/* Animated grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(0,116,189,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,116,189,0.08) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        animation: 'gridPan 8s linear infinite',
        maskImage: 'radial-gradient(circle at center, rgba(0,0,0,0.6) 0%, transparent 75%)',
      }} />

      {/* Floating gradient orbs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,116,189,0.35) 0%, transparent 70%)',
        animation: 'floatOrb1 14s ease-in-out infinite',
        filter: 'blur(10px)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', right: '-5%',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(22,40,96,0.5) 0%, transparent 70%)',
        animation: 'floatOrb2 16s ease-in-out infinite',
        filter: 'blur(10px)',
      }} />
      <div style={{
        position: 'absolute', top: '40%', right: '15%',
        width: '300px', height: '300px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(208,2,27,0.18) 0%, transparent 70%)',
        animation: 'floatOrb3 12s ease-in-out infinite',
        filter: 'blur(10px)',
      }} />

      {/* Login card */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: '420px',
        margin: '0 24px',
        animation: 'fadeUp 0.6s ease',
      }}>
        <div style={{
          borderRadius: '24px',
          padding: '1.5px',
          background: 'linear-gradient(120deg, rgba(0,116,189,0.6), rgba(255,255,255,0.15), rgba(208,2,27,0.4), rgba(0,116,189,0.6))',
          backgroundSize: '200% 100%',
          animation: 'shimmerBorder 6s linear infinite',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            backgroundColor: 'rgba(13,18,38,0.85)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: '23px',
            padding: '44px 40px',
          }}>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
              <img
                src={autoversaLogo.src}
                alt="AutoVersa"
                style={{ height: '52px', objectFit: 'contain', animation: 'logoGlow 3s ease-in-out infinite', borderRadius: '8px' }}
              />
            </div>

            <h1 style={{
              fontSize: '22px', fontWeight: '700', color: '#FFFFFF',
              textAlign: 'center', margin: '0 0 6px', letterSpacing: '-0.3px',
            }}>
              Coupon Manager
            </h1>
            <p style={{
              fontSize: '14px', color: 'rgba(255,255,255,0.5)',
              textAlign: 'center', margin: '0 0 32px',
            }}>
              Sign in to continue
            </p>

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{
                  display: 'block', fontSize: '13px', fontWeight: '600',
                  color: 'rgba(255,255,255,0.8)', marginBottom: '8px',
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
                    width: '100%', padding: '13px 16px', fontSize: '15px',
                    border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '10px',
                    outline: 'none', backgroundColor: 'rgba(255,255,255,0.05)',
                    color: '#FFFFFF', boxSizing: 'border-box', transition: 'all 0.2s',
                  }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{
                  display: 'block', fontSize: '13px', fontWeight: '600',
                  color: 'rgba(255,255,255,0.8)', marginBottom: '8px',
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
                    width: '100%', padding: '13px 16px', fontSize: '15px',
                    border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '10px',
                    outline: 'none', backgroundColor: 'rgba(255,255,255,0.05)',
                    color: '#FFFFFF', boxSizing: 'border-box', transition: 'all 0.2s',
                  }}
                />
              </div>

              {error && (
                <div style={{
                  backgroundColor: 'rgba(208,2,27,0.12)',
                  border: '1px solid rgba(208,2,27,0.4)',
                  borderRadius: '10px', padding: '12px 14px',
                  marginTop: '12px', marginBottom: '8px',
                  color: '#FF6B6B', fontSize: '13px',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px', marginTop: '20px',
                  background: loading
                    ? 'rgba(0,116,189,0.4)'
                    : 'linear-gradient(135deg, #0074BD, #162860)',
                  color: '#FFFFFF', fontSize: '15px', fontWeight: '700',
                  border: 'none', borderRadius: '10px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 8px 24px rgba(0,116,189,0.4)',
                  transition: 'all 0.2s',
                }}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        <p style={{
          textAlign: 'center', marginTop: '24px',
          fontSize: '12px', color: 'rgba(255,255,255,0.3)',
        }}>
          © 2026 AutoVersa. Operated by Al Maraghi Motors L.L.C.
        </p>
      </div>
    </div>
  )
}
