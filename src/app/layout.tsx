import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AppSplash } from '@/components/layout/AppSplash'
import { TopLoaderWrapper } from '@/components/layout/TopLoaderWrapper'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AutoVersa Coupon Manager',
  description: 'AutoVersa Coupon Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppSplash />
        <TopLoaderWrapper />
        {children}
        <div style={{ textAlign: 'center', padding: '20px 32px', fontSize: '11px', color: '#AAAAAA' }}>
          © 2026 Autoversa. Operated by Al Maraghi Motors L.L.C. All Rights Reserved.
        </div>
      </body>
    </html>
  )
}