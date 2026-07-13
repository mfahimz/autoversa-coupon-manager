import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AppSplash } from '@/components/layout/AppSplash'
import { TopLoaderWrapper } from '@/components/layout/TopLoaderWrapper'
import { Toaster } from 'sonner'
import './globals.css'
import autoversaLogo from '@/assets/AutoVersa_logo_fav.png'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AutoVersa Coupon Manager',
  description: 'AutoVersa Coupon Management System',
  icons: {
    icon: autoversaLogo.src,
    apple: autoversaLogo.src,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppSplash />
        <TopLoaderWrapper />
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '500',
            },
          }}
        />
        <div style={{ textAlign: 'center', padding: '20px 32px', fontSize: '11px', color: '#AAAAAA' }}>
          © 2026 Autoversa. Operated by Al Maraghi Motors L.L.C. All Rights Reserved.
        </div>
      </body>
    </html>
  )
}