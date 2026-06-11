import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: number
  thickness?: number
  className?: string
}

export function Spinner({ size = 28, thickness = 3, className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin rounded-full', className)}
      style={{
        width: size,
        height: size,
        borderWidth: thickness,
        borderStyle: 'solid',
        borderColor: '#0074BD',
        borderTopColor: 'transparent',
      }}
    />
  )
}