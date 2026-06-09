import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines Tailwind classes conditionally and merges them safely.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
