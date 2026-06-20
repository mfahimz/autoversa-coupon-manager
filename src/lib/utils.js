import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}


export const isIframe = typeof window !== 'undefined' && window.self !== window.top;

/**
 * Masks a mobile number using ****.
 * For example, a mobile number like '+971501234567' or '501234567'
 * will be shown as '+971******567'.
 * Specifically, the format is '+971******XXX', keeping the last 3 digits.
 */
export function maskMobileNumber(mobile) {
  if (!mobile) return '—'
  const cleaned = mobile.replace(/\D/g, '')
  const baseNumber = cleaned.startsWith('971') ? cleaned.slice(3) : cleaned
  if (baseNumber.length >= 3) {
    const lastThree = baseNumber.slice(-3)
    return `+971******${lastThree}`
  }
  return mobile
}