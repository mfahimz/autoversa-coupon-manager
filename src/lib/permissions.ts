import { createClient } from '@/lib/supabase/client'

export interface PermissionsMap {
    [resource: string]: {
        [action: string]: boolean
    }
}

// ─── Registry — single source of truth ────────────────────────────────────────
// Add new actions here and they automatically appear in the permissions UI

export interface ActionDef {
    resource: string
    label: string
}

export interface PageDef {
    resource: string
    label: string
    actions: ActionDef[]
}

export const PERMISSIONS_REGISTRY: PageDef[] = [
    {
        resource: 'page:dashboard',
        label: 'Dashboard',
        actions: [
            { resource: 'action:coupon:notify', label: 'Send WhatsApp loyalty notifications' },
        ],
    },
    {
        resource: 'page:coupons',
        label: 'Coupons',
        actions: [
            { resource: 'action:coupon:cancel', label: 'Cancel coupons' },
            { resource: 'action:coupon:download', label: 'Download coupon JPG' },
        ],
    },
    {
        resource: 'page:create-coupon',
        label: 'Create Coupon',
        actions: [
            { resource: 'action:coupon:create', label: 'Generate Loyalty+Referral coupon pair' },
            { resource: 'action:coupon:download', label: 'Download coupon JPG' },
            { resource: 'action:coupon:share_whatsapp', label: 'Share coupon via WhatsApp' },
        ],
    },
    {
        resource: 'page:appointments',
        label: 'Appointments',
        actions: [
            { resource: 'action:coupon:verify', label: 'Verify coupon at booking' },
            { resource: 'action:appointment:create', label: 'Book new appointment' },
            { resource: 'action:appointment:update_status', label: 'Update appointment status' },
        ],
    },
    {
        resource: 'page:offers',
        label: 'Offers',
        actions: [
            { resource: 'action:offer:toggle_status', label: 'Activate / deactivate offer' },
            { resource: 'action:offer:create', label: 'Create new offer' },
            { resource: 'action:offer:edit', label: 'Edit existing offer' },
            { resource: 'action:template:upload', label: 'Upload template image' },
            { resource: 'action:template:configure', label: 'Configure template variables' },
            { resource: 'action:sub_offer:manage', label: 'Manage sub-offers' },
            { resource: 'action:stage:manage', label: 'Manage loyalty stages' },
            { resource: 'action:whatsapp_template:manage', label: 'Manage WhatsApp templates' },
        ],
    },
    {
        resource: 'page:reporting',
        label: 'Reports',
        actions: [],
    },
    {
        resource: 'page:customers',
        label: 'Customers',
        actions: [
            { resource: 'action:customer:edit', label: 'Edit customer profile (name, email, car model)' },
        ],
    },
    {
        resource: 'page:users',
        label: 'Users & Permissions',
        actions: [
            { resource: 'action:user:update_role', label: 'Change user role' },
            { resource: 'action:user:update_advisor_code', label: 'Assign / update advisor code' },
            { resource: 'action:user:toggle_active', label: 'Activate / deactivate user' },
            { resource: 'action:permission:update', label: 'Save role permissions' },
        ],
    },
    {
        resource: 'page:admin',
        label: 'Admin Settings',
        actions: [
            { resource: 'action:admin_variable:create', label: 'Add print variable' },
            { resource: 'action:admin_variable:toggle_status', label: 'Enable / disable variable' },
            { resource: 'action:admin_variable:update', label: 'Rename variable' },
            { resource: 'action:admin_variable:delete', label: 'Delete variable' },
            { resource: 'action:emirate_config:toggle_status', label: 'Enable / disable emirate' },
            { resource: 'action:emirate_config:update', label: 'Update emirate categories' },
        ],
    },
]

// All resources flat — used for seeding/saving
export const ALL_RESOURCES: { resource: string; action: string }[] = PERMISSIONS_REGISTRY.flatMap(page => [
    { resource: page.resource, action: 'view' },
    ...page.actions.map(a => ({ resource: a.resource, action: 'action' })),
])

export function isAdmin(role: string) {
    return role === 'ADMIN'
}

export function checkPermission(
    permissions: PermissionsMap,
    role: string,
    resource: string,
    action: string = 'view'
): boolean {
    if (isAdmin(role)) return true
    return permissions?.[resource]?.[action] ?? false
}

export async function loadPermissionsForRole(role: string): Promise<PermissionsMap> {
    if (isAdmin(role)) return {}
    const supabase = createClient()
    const { data } = await supabase
        .from('role_permissions')
        .select('resource, action, is_allowed')
        .eq('role', role)

    const map: PermissionsMap = {}
        ; (data || []).forEach((p: any) => {
            if (!map[p.resource]) map[p.resource] = {}
            map[p.resource][p.action] = p.is_allowed
        })
    return map
}