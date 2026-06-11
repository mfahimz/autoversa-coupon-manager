import { Spinner } from '@/components/ui/Spinner'

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <Spinner size={36} />
    </div>
  )
}