'use client'

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'CEO']

interface ExportButtonProps {
  userRole: string | null | undefined
  exportUrl: string
  label?: string
}

export default function ExportButton({ userRole, exportUrl, label = 'Export to Excel' }: ExportButtonProps) {
  if (!userRole || !ALLOWED_ROLES.includes(userRole)) return null

  return (
    <a
      href={exportUrl}
      style={{
        padding: '10px 18px',
        backgroundColor: '#16a34a',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: 'pointer',
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
      }}
    >
      📊 {label}
    </a>
  )
}
