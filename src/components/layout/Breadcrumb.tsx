import { useRouter } from 'next/navigation'

interface BreadcrumbItem {
    label: string
    href?: string
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
    const router = useRouter()

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '24px',
            flexWrap: 'wrap',
        }}>
            {items.map((item, i) => {
                const isLast = i === items.length - 1
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {i > 0 && (
                            <span style={{ color: '#CCCCCC', fontSize: '14px' }}>›</span>
                        )}
                        {isLast || !item.href ? (
                            <span style={{
                                fontSize: '14px',
                                color: isLast ? '#1A1A1A' : '#666666',
                                fontWeight: isLast ? '600' : '400',
                            }}>
                                {item.label}
                            </span>
                        ) : (
                            <span
                                onClick={() => router.push(item.href!)}
                                style={{
                                    fontSize: '14px',
                                    color: '#0074BD',
                                    cursor: 'pointer',
                                    fontWeight: '400',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                                onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                            >
                                {item.label}
                            </span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}