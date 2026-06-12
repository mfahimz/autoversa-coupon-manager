'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Breadcrumb from '@/components/layout/Breadcrumb'
import Navbar from '@/components/layout/Navbar'

interface VariableConfig {
    key: string
    label: string
    description: string | null
}

interface VariablePosition {
    key: string
    x: number
    y: number
    font_size: number
    font_color: string
    font_weight: string
}

interface SubOffer {
    id?: string
    name: string
    is_active: boolean
    sort_order: number
}

interface OfferStage {
    id?: string
    stage_number: number
    bmw_visits_required: number
    reward_label: string
    reward_description: string
}

interface WhatsAppTemplate {
    id?: string
    trigger_type: 'SA_INVOICE' | 'STAGE_1' | 'STAGE_2' | 'STAGE_3'
    message_body: string
}

interface OfferFormProps {
    mode: 'create' | 'edit'
    initialData?: {
        id: string
        title: string
        description: string | null
        valid_days: number
        commission_amount: number | null
        coupon_code_structure: string | null
        offer_variables: string[] | null
        is_active: boolean
        coupon_cap: number | null
        first_batch_target: number | null
        vehicle_config: string | null
        issuance_window_type: string | null
        issuance_start_date: string | null
        issuance_end_date: string | null
        issuance_window_days: number | null
        m_redemption_window_type: string | null
        m_redemption_start_date: string | null
        m_redemption_end_date: string | null
        b_valid_days: number | null
        b_redemption_window_type: string | null
        b_redemption_start_date: string | null
        b_redemption_end_date: string | null
        activated_at: string | null
        publish_start_date: string | null
        publish_end_date: string | null
    }
}

const SAMPLE_VALUES: Record<string, string> = {
    coupon_code: '001_A12345_AUTOVERSA_M_ADHA12345',
    expiry_date: '30 September 2026',
    customer_name: 'Ahmed Al Mansoori',
    plate_number: 'AUH · A · 12345',
    mobile_number: '+971501234567',
}

const TABS = ['Details', 'Windows', 'Coupon Setup', 'Template', 'Sub-offers & Stages', 'WhatsApp'] as const
type Tab = typeof TABS[number]

const WA_TRIGGER_LABELS: Record<string, string> = {
    SA_INVOICE: 'SA Invoice Trigger (sent at checkout)',
    STAGE_1: 'Stage 1 Milestone (1 BMW visit)',
    STAGE_2: 'Stage 2 Milestone (2 BMW visits)',
    STAGE_3: 'Stage 3 Milestone (3 BMW visits)',
}

const WA_TRIGGER_VARIABLES: Record<string, string[]> = {
    SA_INVOICE: ['[PLATE_NO]', '[M_COUPON_CODE]', '[B_COUPON_CODE]', '[INVOICE_NO]'],
    STAGE_1: ['[PLATE_NO]', '[M_COUPON_CODE]', '[STAGE]', '[REWARD_LABEL]'],
    STAGE_2: ['[PLATE_NO]', '[M_COUPON_CODE]', '[STAGE]', '[REWARD_LABEL]'],
    STAGE_3: ['[PLATE_NO]', '[M_COUPON_CODE]', '[STAGE]', '[REWARD_LABEL]'],
}

// Required fields per tab for validation
const REQUIRED_BY_TAB: Record<Tab, string[]> = {
    'Details': ['title', 'first_batch_target'],
    'Windows': [
        'issuance_start', 'issuance_end',
        'm_redemption_start', 'm_redemption_end',
        'b_redemption_start', 'b_redemption_end',
    ],
    'Coupon Setup': [],
    'Template': [],
    'Sub-offers & Stages': [],
    'WhatsApp': [],
}

const OPTIONAL_LABELS: Record<string, string> = {
    description: 'Offer description',
    commission_amount: 'Commission per redemption',
    coupon_code_structure: 'Coupon code structure',
    offer_variables: 'Coupon print variables',
    template: 'Coupon template image',
    sub_offers: 'Sub-offers',
    stages: 'Mercedes loyalty stages',
    wa_templates: 'WhatsApp message templates',
}

export default function OfferForm({ mode, initialData }: OfferFormProps) {
    const router = useRouter()
    const supabase = createClient()
    const imageContainerRef = useRef<HTMLDivElement>(null)

    const [activeTab, setActiveTab] = useState<Tab>('Details')
    const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set<Tab>(['Details']))
    const [availableVariables, setAvailableVariables] = useState<VariableConfig[]>([])
    const [subOffers, setSubOffers] = useState<SubOffer[]>([])
    const [stages, setStages] = useState<OfferStage[]>([])
    const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([
        { trigger_type: 'SA_INVOICE', message_body: '' },
        { trigger_type: 'STAGE_1', message_body: '' },
        { trigger_type: 'STAGE_2', message_body: '' },
        { trigger_type: 'STAGE_3', message_body: '' },
    ])
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [showOptionalConfirm, setShowOptionalConfirm] = useState(false)
    const [missingOptionals, setMissingOptionals] = useState<string[]>([])

    const parsedVehicleConfig = (() => {
        try { return initialData?.vehicle_config ? JSON.parse(initialData.vehicle_config) : null }
        catch { return null }
    })()

    const [form, setForm] = useState({
        title: initialData?.title || '',
        description: initialData?.description || '',
        commission_amount: initialData?.commission_amount?.toString() || '',
        coupon_code_structure: initialData?.coupon_code_structure || '',
        offer_variables: (initialData?.offer_variables || []) as string[],
        is_active: initialData?.is_active ?? true,
        coupon_cap: initialData?.coupon_cap?.toString() || '800',
        first_batch_target: initialData?.first_batch_target?.toString() || '',
        vehicle_make: parsedVehicleConfig?.make || 'BMW',

        publish_start_date: initialData?.publish_start_date || '',
        publish_end_date: initialData?.publish_end_date || '',

        issuance_window_type: (initialData?.issuance_window_type || 'date_range') as 'date_range' | 'days',
        issuance_start_date: initialData?.issuance_start_date || '',
        issuance_end_date: initialData?.issuance_end_date || '',
        issuance_window_days: initialData?.issuance_window_days?.toString() || '',

        m_redemption_window_type: (initialData?.m_redemption_window_type || 'date_range') as 'date_range' | 'days',
        m_redemption_start_date: initialData?.m_redemption_start_date || '',
        m_redemption_end_date: initialData?.m_redemption_end_date || '',
        valid_days: initialData?.valid_days?.toString() || '',

        b_redemption_window_type: (initialData?.b_redemption_window_type || 'date_range') as 'date_range' | 'days',
        b_redemption_start_date: initialData?.b_redemption_start_date || '',
        b_redemption_end_date: initialData?.b_redemption_end_date || '',
        b_valid_days: initialData?.b_valid_days?.toString() || '',
    })

    const [templateImageFile, setTemplateImageFile] = useState<File | null>(null)
    const [templateImagePreview, setTemplateImagePreview] = useState<string | null>(null)
    const [templateImageDimensions, setTemplateImageDimensions] = useState<{ width: number; height: number } | null>(null)
    const [variablePositions, setVariablePositions] = useState<VariablePosition[]>([])
    const [selectedVariableKey, setSelectedVariableKey] = useState<string | null>(null)
    const [draggingKey, setDraggingKey] = useState<string | null>(null)
    const [existingTemplateId, setExistingTemplateId] = useState<string | null>(null)
    const [existingTemplateUrl, setExistingTemplateUrl] = useState<string | null>(null)
    const [previewMode, setPreviewMode] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const currentTabIndex = TABS.indexOf(activeTab)
    const isLastTab = currentTabIndex === TABS.length - 1
    const progressPct = Math.round(((currentTabIndex + 1) / TABS.length) * 100)

    useEffect(() => { loadVariables() }, [])

    useEffect(() => {
        if (mode === 'edit' && initialData?.id) {
            loadExistingTemplate(initialData.id)
            loadSubOffers(initialData.id)
            loadStages(initialData.id)
            loadWaTemplates(initialData.id)
            // Mark all tabs visited in edit mode
            setVisitedTabs(new Set(TABS))
        }
    }, [mode, initialData?.id])

    useEffect(() => {
        const vars = Array.isArray(form.offer_variables) ? form.offer_variables : []
        setVariablePositions(prev => prev.filter(p => vars.includes(p.key)))
    }, [form.offer_variables])

    async function loadVariables() {
        const { data } = await supabase
            .from('admin_variable_config')
            .select('key, label, description')
            .eq('is_enabled', true)
            .order('sort_order', { ascending: true })
        if (data) setAvailableVariables(data)
    }

    async function loadExistingTemplate(offerId: string) {
        const { data: template } = await supabase
            .from('templates')
            .select('id, file_url, image_width, image_height, storage_path')
            .eq('offer_id', offerId)
            .eq('is_active', true)
            .single()
        if (!template) return
        setExistingTemplateId(template.id)
        setExistingTemplateUrl(template.file_url)
        setTemplateImagePreview(template.file_url)
        if (template.image_width && template.image_height) {
            setTemplateImageDimensions({ width: template.image_width, height: template.image_height })
        }
        const { data: positions } = await supabase
            .from('template_variable_positions')
            .select('*')
            .eq('template_id', template.id)
        if (positions) {
            setVariablePositions(positions.map((p: any) => ({
                key: p.variable_key,
                x: Number(p.x_coordinate),
                y: Number(p.y_coordinate),
                font_size: p.font_size || 16,
                font_color: p.font_color || '#000000',
                font_weight: p.font_weight || 'normal',
            })))
        }
    }

    async function loadSubOffers(offerId: string) {
        const { data } = await supabase.from('sub_offers').select('*').eq('offer_id', offerId).order('sort_order')
        if (data) setSubOffers(data.map((s: any) => ({ id: s.id, name: s.name, is_active: s.is_active, sort_order: s.sort_order })))
    }

    async function loadStages(offerId: string) {
        const { data } = await supabase.from('offer_stages').select('*').eq('offer_id', offerId).order('stage_number')
        if (data) setStages(data.map((s: any) => ({
            id: s.id, stage_number: s.stage_number,
            bmw_visits_required: s.bmw_visits_required,
            reward_label: s.reward_label, reward_description: s.reward_description || '',
        })))
    }

    async function loadWaTemplates(offerId: string) {
        const { data } = await supabase.from('offer_whatsapp_templates').select('*').eq('offer_id', offerId)
        if (data && data.length > 0) {
            setWaTemplates(prev => prev.map(t => {
                const found = data.find((d: any) => d.trigger_type === t.trigger_type)
                return found ? { ...t, id: found.id, message_body: found.message_body } : t
            }))
        }
    }

    function showToast(message: string, type: 'success' | 'error' = 'success') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    function goToTab(tab: Tab) {
        setActiveTab(tab)
        setVisitedTabs(prev => { const s = new Set<Tab>(prev); s.add(tab); return s })
    }

    function toggleVariable(key: string) {
        setForm(f => {
            const current = Array.isArray(f.offer_variables) ? f.offer_variables : []
            return { ...f, offer_variables: current.includes(key) ? current.filter(v => v !== key) : [...current, key] }
        })
    }

    function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return }
        setTemplateImageFile(file)
        const url = URL.createObjectURL(file)
        setTemplateImagePreview(url)
        const img = new Image()
        img.onload = () => setTemplateImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
        img.src = url
    }

    function getPositionForKey(key: string): VariablePosition | null {
        return variablePositions.find(p => p.key === key) || null
    }

    function updatePosition(key: string, updates: Partial<VariablePosition>) {
        setVariablePositions(prev => {
            const existing = prev.find(p => p.key === key)
            if (existing) return prev.map(p => p.key === key ? { ...p, ...updates } : p)
            return [...prev, { key, x: 50, y: 50, font_size: 16, font_color: '#000000', font_weight: 'normal', ...updates }]
        })
    }

    const handleImageDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        if (!draggingKey || !imageContainerRef.current) return
        const rect = imageContainerRef.current.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        updatePosition(draggingKey, { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
        setDraggingKey(null)
    }, [draggingKey])

    const handlePlacedChipDrag = useCallback((e: React.DragEvent<HTMLDivElement>, key: string) => {
        e.stopPropagation()
        setDraggingKey(key)
    }, [])

    function addSubOffer() {
        setSubOffers(prev => [...prev, { name: '', is_active: true, sort_order: prev.length }])
    }
    function updateSubOffer(i: number, u: Partial<SubOffer>) {
        setSubOffers(prev => prev.map((s, idx) => idx === i ? { ...s, ...u } : s))
    }
    function removeSubOffer(i: number) {
        setSubOffers(prev => prev.filter((_, idx) => idx !== i))
    }

    function addStage() {
        const n = stages.length + 1
        setStages(prev => [...prev, { stage_number: n, bmw_visits_required: n, reward_label: '', reward_description: '' }])
    }
    function updateStage(i: number, u: Partial<OfferStage>) {
        setStages(prev => prev.map((s, idx) => idx === i ? { ...s, ...u } : s))
    }
    function removeStage(i: number) {
        setStages(prev => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stage_number: idx + 1 })))
    }

    function updateWaTemplate(triggerType: string, message_body: string) {
        setWaTemplates(prev => prev.map(t => t.trigger_type === triggerType ? { ...t, message_body } : t))
    }

    function validateRequired(): { valid: boolean; errors: Record<string, string>; firstErrorTab: Tab | null } {
        const errors: Record<string, string> = {}

        if (!form.title.trim()) errors.title = 'Title is required'
        if (!form.first_batch_target) errors.first_batch_target = 'Visit target is required'

        if (!form.publish_start_date) errors.publish_start_date = 'Publish start date is required'
        if (!form.publish_end_date) errors.publish_end_date = 'Publish end date is required'

        if (form.issuance_window_type === 'date_range') {
            if (!form.issuance_start_date) errors.issuance_start = 'Issuance start date is required'
            if (!form.issuance_end_date) errors.issuance_end = 'Issuance end date is required'
        } else {
            if (!form.issuance_window_days) errors.issuance_days = 'Issuance window days is required'
        }

        if (form.m_redemption_window_type === 'date_range') {
            if (!form.m_redemption_start_date) errors.m_redemption_start = 'M redemption start date is required'
            if (!form.m_redemption_end_date) errors.m_redemption_end = 'M redemption end date is required'
        } else {
            if (!form.valid_days) errors.m_redemption_days = 'M redemption days is required'
        }

        if (form.b_redemption_window_type === 'date_range') {
            if (!form.b_redemption_start_date) errors.b_redemption_start = 'B redemption start date is required'
            if (!form.b_redemption_end_date) errors.b_redemption_end = 'B redemption end date is required'
        } else {
            if (!form.b_valid_days) errors.b_redemption_days = 'B redemption days is required'
        }

        const detailsErrors = ['title', 'first_batch_target']
        const windowErrors = ['activated_at', 'publish_start_date', 'publish_end_date',
            'issuance_start', 'issuance_end', 'issuance_days',
            'm_redemption_start', 'm_redemption_end', 'm_redemption_days',
            'b_redemption_start', 'b_redemption_end', 'b_redemption_days']

        let firstErrorTab: Tab | null = null
        for (const key of Object.keys(errors)) {
            if (detailsErrors.includes(key)) { firstErrorTab = 'Details'; break }
            if (windowErrors.includes(key)) { firstErrorTab = firstErrorTab || 'Windows' }
        }

        return { valid: Object.keys(errors).length === 0, errors, firstErrorTab }
    }

    function collectMissingOptionals(): string[] {
        const missing: string[] = []
        if (!form.description.trim()) missing.push('description')
        if (!form.commission_amount) missing.push('commission_amount')
        if (!form.coupon_code_structure.trim()) missing.push('coupon_code_structure')
        if (!form.offer_variables.length) missing.push('offer_variables')
        if (!templateImagePreview) missing.push('template')
        if (subOffers.filter(s => s.name.trim()).length === 0) missing.push('sub_offers')
        if (stages.filter(s => s.reward_label.trim()).length === 0) missing.push('stages')
        if (waTemplates.every(t => !t.message_body.trim())) missing.push('wa_templates')
        return missing
    }

    async function handleSave() {
        const { valid, errors, firstErrorTab } = validateRequired()
        if (!valid) {
            setFieldErrors(errors)
            if (firstErrorTab) goToTab(firstErrorTab)
            showToast('Please fill in all required fields', 'error')
            return
        }
        setFieldErrors({})

        const missing = collectMissingOptionals()
        if (missing.length > 0 && !showOptionalConfirm) {
            setMissingOptionals(missing)
            setShowOptionalConfirm(true)
            return
        }

        setShowOptionalConfirm(false)
        await doSave()
    }

    async function doSave() {
        setSaving(true)

        const payload: Record<string, any> = {
            title: form.title.trim(),
            description: form.description.trim() || null,
            valid_days: form.valid_days ? Number(form.valid_days) : null,
            b_valid_days: form.b_valid_days ? Number(form.b_valid_days) : null,
            commission_amount: form.commission_amount ? Number(form.commission_amount) : null,
            coupon_code_structure: form.coupon_code_structure.trim() || null,
            offer_variables: form.offer_variables.length > 0 ? form.offer_variables : null,
            is_active: form.is_active,
            coupon_cap: Number(form.coupon_cap) || 800,
            first_batch_target: Number(form.first_batch_target),
            vehicle_config: JSON.stringify({ make: form.vehicle_make }),
            publish_start_date: form.issuance_window_type === 'date_range' ? (form.issuance_start_date || null) : null,
            publish_end_date: form.issuance_window_type === 'date_range' ? (form.issuance_end_date || null) : null,
            issuance_window_type: form.issuance_window_type,
            issuance_start_date: form.issuance_window_type === 'date_range' ? (form.issuance_start_date || null) : null,
            issuance_end_date: form.issuance_window_type === 'date_range' ? (form.issuance_end_date || null) : null,
            issuance_window_days: form.issuance_window_type === 'days' ? (Number(form.issuance_window_days) || null) : null,
            m_redemption_window_type: form.m_redemption_window_type,
            m_redemption_start_date: form.m_redemption_window_type === 'date_range' ? (form.m_redemption_start_date || null) : null,
            m_redemption_end_date: form.m_redemption_window_type === 'date_range' ? (form.m_redemption_end_date || null) : null,
            b_redemption_window_type: form.b_redemption_window_type,
            b_redemption_start_date: form.b_redemption_window_type === 'date_range' ? (form.b_redemption_start_date || null) : null,
            b_redemption_end_date: form.b_redemption_window_type === 'date_range' ? (form.b_redemption_end_date || null) : null,
        }

        let offerId = initialData?.id

        if (mode === 'edit' && initialData) {
            const { error } = await supabase.from('offers').update(payload).eq('id', initialData.id)
            if (error) { showToast('Failed to update offer', 'error'); setSaving(false); return }
        } else {
            const { data, error } = await supabase.from('offers').insert(payload).select('id').single()
            if (error || !data) { showToast('Failed to create offer', 'error'); setSaving(false); return }
            offerId = data.id
        }

        if (!offerId) { setSaving(false); return }

        if (templateImageFile || existingTemplateId) await saveTemplate(offerId)
        await saveSubOffers(offerId)
        await saveStages(offerId)
        await saveWaTemplates(offerId)

        showToast(mode === 'create' ? 'Offer created successfully' : 'Offer updated successfully')
        setSaving(false)
        setTimeout(() => router.push('/offers'), 1000)
    }

    async function saveTemplate(offerId: string) {
        let fileUrl = existingTemplateUrl
        let storagePath = null
        if (templateImageFile) {
            const ext = templateImageFile.name.split('.').pop()
            const path = `templates/${offerId}/template.${ext}`
            const { error: uploadError } = await supabase.storage.from('templates').upload(path, templateImageFile, { upsert: true })
            if (uploadError) { showToast('Failed to upload template image', 'error'); return }
            const { data: urlData } = supabase.storage.from('templates').getPublicUrl(path)
            fileUrl = urlData.publicUrl
            storagePath = path
        }
        if (!fileUrl) return
        const templatePayload = {
            offer_id: offerId, name: `${form.title} Template`,
            file_url: fileUrl, image_width: templateImageDimensions?.width || null,
            image_height: templateImageDimensions?.height || null,
            is_active: true, is_default: true, updated_at: new Date().toISOString(),
            ...(storagePath && { storage_path: storagePath }),
        }
        let templateId = existingTemplateId
        if (existingTemplateId) {
            await supabase.from('templates').update(templatePayload).eq('id', existingTemplateId)
        } else {
            const { data } = await supabase.from('templates').insert(templatePayload).select('id').single()
            if (data) templateId = data.id
        }
        if (!templateId) return
        await supabase.from('template_variable_positions').delete().eq('template_id', templateId)
        if (variablePositions.length > 0) {
            await supabase.from('template_variable_positions').insert(
                variablePositions.map(p => ({
                    template_id: templateId!, variable_key: p.key,
                    x_coordinate: p.x, y_coordinate: p.y,
                    font_size: p.font_size, font_color: p.font_color, font_weight: p.font_weight,
                }))
            )
        }
    }

    async function saveSubOffers(offerId: string) {
        await supabase.from('sub_offers').delete().eq('offer_id', offerId)
        const valid = subOffers.filter(s => s.name.trim())
        if (!valid.length) return
        await supabase.from('sub_offers').insert(valid.map((s, i) => ({
            offer_id: offerId, name: s.name.trim(), is_active: s.is_active, sort_order: i,
        })))
    }

    async function saveStages(offerId: string) {
        await supabase.from('offer_stages').delete().eq('offer_id', offerId)
        const valid = stages.filter(s => s.reward_label.trim())
        if (!valid.length) return
        await supabase.from('offer_stages').insert(valid.map(s => ({
            offer_id: offerId, stage_number: s.stage_number,
            bmw_visits_required: s.bmw_visits_required,
            reward_label: s.reward_label.trim(),
            reward_description: s.reward_description.trim() || null,
        })))
    }

    async function saveWaTemplates(offerId: string) {
        for (const t of waTemplates) {
            if (!t.message_body.trim()) continue
            await supabase.from('offer_whatsapp_templates').upsert({
                offer_id: offerId, trigger_type: t.trigger_type, message_body: t.message_body.trim(),
            }, { onConflict: 'offer_id,trigger_type' })
        }
    }

    const offerVars = Array.isArray(form.offer_variables) ? form.offer_variables : []
    const selectedVarConfig = selectedVariableKey ? availableVariables.find(v => v.key === selectedVariableKey) : null
    const selectedVarPosition = selectedVariableKey ? getPositionForKey(selectedVariableKey) : null

    function err(key: string) {
        return fieldErrors[key] ? (
            <p style={{ fontSize: '12px', color: '#D0021B', marginTop: '4px' }}>{fieldErrors[key]}</p>
        ) : null
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F7F7', paddingTop: '16px' }}>
            <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, textarea:focus, select:focus { border-color: #0074BD !important; outline: none; }
        .var-chip:hover { opacity: 0.85; }
      `}</style>

            {toast && (
                <div style={{
                    position: 'fixed', top: '24px', right: '24px', zIndex: 1000,
                    backgroundColor: toast.type === 'success' ? '#162860' : '#D0021B',
                    color: '#FFFFFF', padding: '14px 20px', borderRadius: '12px',
                    fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    animation: 'slideIn 0.2s ease',
                }}>
                    {toast.message}
                </div>
            )}

            {/* Optional fields confirmation popup */}
            {showOptionalConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '24px',
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '16px',
                        padding: '32px', maxWidth: '480px', width: '100%',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
                    }}>
                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1A1A1A', margin: '0 0 8px' }}>
                            Some optional fields are empty
                        </h2>
                        <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px' }}>
                            The following fields have not been filled in. Are you sure you want to continue without them?
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            {missingOptionals.map(key => (
                                <div key={key} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 12px', backgroundColor: '#FFF8E7',
                                    borderRadius: '8px', border: '1px solid #FFE0A0',
                                }}>
                                    <span style={{ fontSize: '14px' }}>⚠️</span>
                                    <span style={{ fontSize: '13px', color: '#1A1A1A', fontWeight: '500' }}>
                                        {OPTIONAL_LABELS[key] || key}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => setShowOptionalConfirm(false)}
                                style={{
                                    flex: 1, padding: '12px', backgroundColor: '#F0F0F0', color: '#444',
                                    border: 'none', borderRadius: '10px', fontSize: '14px',
                                    fontWeight: '600', cursor: 'pointer',
                                }}
                            >
                                Go Back & Fill
                            </button>
                            <button
                                onClick={doSave}
                                style={{
                                    flex: 1, padding: '12px', backgroundColor: '#162860', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontSize: '14px',
                                    fontWeight: '700', cursor: 'pointer',
                                }}
                            >
                                Continue Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Navbar />

            <main style={{ padding: '0 32px 48px' }}>
                <Breadcrumb items={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Offers', href: '/offers' },
                    { label: mode === 'create' ? 'New Offer' : `Edit — ${initialData?.title || ''}` },
                ]} />

                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1A1A1A', margin: 0 }}>
                        {mode === 'create' ? 'New Offer' : 'Edit Offer'}
                    </h1>
                    <p style={{ color: '#666666', fontSize: '14px', marginTop: '4px' }}>
                        {mode === 'create' ? 'Step through each tab to configure the offer.' : 'Update offer details. Save button available on every tab.'}
                    </p>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>
                            Step {currentTabIndex + 1} of {TABS.length} — {activeTab}
                        </span>
                        <span style={{ fontSize: '12px', color: '#0074BD', fontWeight: '600' }}>
                            {progressPct}%
                        </span>
                    </div>
                    <div style={{ height: '4px', backgroundColor: '#E0E0E0', borderRadius: '100px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: '100px',
                            backgroundColor: '#0074BD',
                            width: `${progressPct}%`,
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                </div>

                {/* Tab bar */}
                <div style={{
                    display: 'flex', gap: '4px', marginBottom: '24px',
                    backgroundColor: '#FFFFFF', padding: '6px',
                    borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    overflowX: 'auto',
                }}>
                    {TABS.map((tab, i) => {
                        const isActive = activeTab === tab
                        const hasError = Object.keys(fieldErrors).some(k => {
                            if (tab === 'Details') return ['title', 'first_batch_target'].includes(k)
                            if (tab === 'Windows') return ['issuance_start', 'issuance_end',
                                'issuance_start', 'issuance_end', 'issuance_days',
                                'm_redemption_start', 'm_redemption_end', 'm_redemption_days',
                                'b_redemption_start', 'b_redemption_end', 'b_redemption_days'].includes(k)
                            return false
                        })
                        return (
                            <button
                                key={tab}
                                onClick={() => goToTab(tab)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '8px 14px', border: 'none', borderRadius: '8px',
                                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                                    backgroundColor: isActive ? '#162860' : hasError ? '#FFF0F0' : 'transparent',
                                    color: isActive ? '#FFFFFF' : hasError ? '#D0021B' : '#666',
                                }}
                            >
                                {hasError && <span style={{ fontSize: '11px' }}>⚠</span>}
                                <span>{i + 1}. {tab}</span>
                            </button>
                        )
                    })}
                </div>

                <div style={{
                    backgroundColor: '#FFFFFF', borderRadius: '16px',
                    padding: '32px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    display: 'flex', flexDirection: 'column', gap: '28px',
                }}>

                    {/* ── DETAILS TAB ── */}
                    {activeTab === 'Details' && (
                        <>
                            <SectionHeader title="Basic Info" />

                            <div>
                                <label style={labelStyle}>Title *</label>
                                <input
                                    style={{ ...inputStyle, ...(fieldErrors.title ? { borderColor: '#D0021B' } : {}) }}
                                    value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Pre-Launch Offer 2026"
                                />
                                {err('title')}
                            </div>

                            <div>
                                <label style={labelStyle}>Description</label>
                                <textarea
                                    style={{ ...inputStyle, height: '80px', resize: 'vertical' }}
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="Brief description of this offer"
                                />
                            </div>

                            <Divider />
                            <SectionHeader title="Rules" />

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>Coupon Cap</label>
                                    <input style={inputStyle} type="number" value={form.coupon_cap} min="1"
                                        onChange={e => setForm(f => ({ ...f, coupon_cap: e.target.value }))} />
                                    <p style={hintStyle}>Max coupons issuable.</p>
                                </div>
                                <div>
                                    <label style={labelStyle}>Visit Target *</label>
                                    <input
                                        style={{ ...inputStyle, ...(fieldErrors.first_batch_target ? { borderColor: '#D0021B' } : {}) }}
                                        type="number" value={form.first_batch_target} min="1"
                                        onChange={e => setForm(f => ({ ...f, first_batch_target: e.target.value }))}
                                        placeholder="e.g. 100"
                                    />
                                    {err('first_batch_target')}
                                    <p style={hintStyle}>Visits before switching to next offer.</p>
                                </div>
                                <div>
                                    <label style={labelStyle}>Commission per Redemption (AED)</label>
                                    <input style={inputStyle} type="number" value={form.commission_amount}
                                        onChange={e => setForm(f => ({ ...f, commission_amount: e.target.value }))}
                                        placeholder="e.g. 50" min="0" />
                                </div>
                            </div>

                            <Divider />
                            <SectionHeader title="Vehicle Eligibility" />

                            <div>
                                <label style={labelStyle}>Make</label>
                                <input style={{ ...inputStyle, backgroundColor: '#F7F7F7', color: '#888' }}
                                    value={form.vehicle_make} readOnly />
                                <p style={hintStyle}>Currently BMW only.</p>
                            </div>

                            <Divider />

                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px', backgroundColor: '#F7F7F7', borderRadius: '10px',
                            }}>
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>Active</p>
                                    <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>
                                        Master switch — overrides publish window if turned off
                                    </p>
                                </div>
                                <div
                                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                    style={{
                                        width: '44px', height: '24px', borderRadius: '100px',
                                        backgroundColor: form.is_active ? '#0074BD' : '#CCCCCC',
                                        cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', top: '2px', left: form.is_active ? '22px' : '2px',
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        backgroundColor: '#FFFFFF', transition: 'left 0.2s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    }} />
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── WINDOWS TAB ── */}
                    {activeTab === 'Windows' && (
                        <>
                            <SectionHeader title="Publish & Issuance Window" />
                            <p style={hintStyle}>
                                When this offer appears in the SA dropdown and coupons can be issued. These are the same window.
                            </p>

                            <WindowToggle
                                value={form.issuance_window_type}
                                onChange={v => setForm(f => ({ ...f, issuance_window_type: v }))}
                            />

                            {form.issuance_window_type === 'date_range' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={labelStyle}>From *</label>
                                        <input
                                            style={{ ...inputStyle, ...(fieldErrors.issuance_start ? { borderColor: '#D0021B' } : {}) }}
                                            type="date" value={form.issuance_start_date}
                                            onChange={e => setForm(f => ({ ...f, issuance_start_date: e.target.value }))}
                                        />
                                        {err('issuance_start')}
                                        <p style={hintStyle}>Offer appears in SA dropdown from this date.</p>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>To *</label>
                                        <input
                                            style={{ ...inputStyle, ...(fieldErrors.issuance_end ? { borderColor: '#D0021B' } : {}) }}
                                            type="date" value={form.issuance_end_date}
                                            onChange={e => setForm(f => ({ ...f, issuance_end_date: e.target.value }))}
                                        />
                                        {err('issuance_end')}
                                        <p style={hintStyle}>Auto-removed from dropdown after this date.</p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ maxWidth: '220px' }}>
                                    <label style={labelStyle}>Number of Days from Creation *</label>
                                    <input
                                        style={{ ...inputStyle, ...(fieldErrors.issuance_days ? { borderColor: '#D0021B' } : {}) }}
                                        type="number" min="1" value={form.issuance_window_days}
                                        onChange={e => setForm(f => ({ ...f, issuance_window_days: e.target.value }))}
                                    />
                                    {err('issuance_days')}
                                </div>
                            )}

                            <Divider />
                            <SectionHeader title="M Coupon Redemption Window (Mercedes Loyalty)" />
                            <p style={hintStyle}>From when to when the Mercedes customer can redeem their loyalty reward.</p>

                            <WindowToggle
                                value={form.m_redemption_window_type}
                                onChange={v => setForm(f => ({ ...f, m_redemption_window_type: v }))}
                            />

                            {form.m_redemption_window_type === 'date_range' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={labelStyle}>From *</label>
                                        <input
                                            style={{ ...inputStyle, ...(fieldErrors.m_redemption_start ? { borderColor: '#D0021B' } : {}) }}
                                            type="date" value={form.m_redemption_start_date}
                                            onChange={e => setForm(f => ({ ...f, m_redemption_start_date: e.target.value }))}
                                        />
                                        {err('m_redemption_start')}
                                    </div>
                                    <div>
                                        <label style={labelStyle}>To *</label>
                                        <input
                                            style={{ ...inputStyle, ...(fieldErrors.m_redemption_end ? { borderColor: '#D0021B' } : {}) }}
                                            type="date" value={form.m_redemption_end_date}
                                            onChange={e => setForm(f => ({ ...f, m_redemption_end_date: e.target.value }))}
                                        />
                                        {err('m_redemption_end')}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ maxWidth: '220px' }}>
                                    <label style={labelStyle}>Days from Issue Date *</label>
                                    <input
                                        style={{ ...inputStyle, ...(fieldErrors.m_redemption_days ? { borderColor: '#D0021B' } : {}) }}
                                        type="number" min="1" value={form.valid_days}
                                        onChange={e => setForm(f => ({ ...f, valid_days: e.target.value }))}
                                    />
                                    {err('m_redemption_days')}
                                </div>
                            )}

                            <Divider />
                            <SectionHeader title="B Coupon Redemption Window (BMW Referral)" />
                            <p style={hintStyle}>From when to when the BMW customer can redeem the referral coupon.</p>

                            <WindowToggle
                                value={form.b_redemption_window_type}
                                onChange={v => setForm(f => ({ ...f, b_redemption_window_type: v }))}
                            />

                            {form.b_redemption_window_type === 'date_range' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={labelStyle}>From *</label>
                                        <input
                                            style={{ ...inputStyle, ...(fieldErrors.b_redemption_start ? { borderColor: '#D0021B' } : {}) }}
                                            type="date" value={form.b_redemption_start_date}
                                            onChange={e => setForm(f => ({ ...f, b_redemption_start_date: e.target.value }))}
                                        />
                                        {err('b_redemption_start')}
                                    </div>
                                    <div>
                                        <label style={labelStyle}>To *</label>
                                        <input
                                            style={{ ...inputStyle, ...(fieldErrors.b_redemption_end ? { borderColor: '#D0021B' } : {}) }}
                                            type="date" value={form.b_redemption_end_date}
                                            onChange={e => setForm(f => ({ ...f, b_redemption_end_date: e.target.value }))}
                                        />
                                        {err('b_redemption_end')}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ maxWidth: '220px' }}>
                                    <label style={labelStyle}>Days from Issue Date *</label>
                                    <input
                                        style={{ ...inputStyle, ...(fieldErrors.b_redemption_days ? { borderColor: '#D0021B' } : {}) }}
                                        type="number" min="1" value={form.b_valid_days}
                                        onChange={e => setForm(f => ({ ...f, b_valid_days: e.target.value }))}
                                    />
                                    {err('b_redemption_days')}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── COUPON SETUP TAB ── */}
                    {activeTab === 'Coupon Setup' && (
                        <>
                            <SectionHeader title="Coupon Code Structure" />
                            <p style={hintStyle}>Define the format for M and B coupons. M/B substituted automatically.</p>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                                {['[SEQ]', '[INVOICE]', '[OFFER_ID]', '[PLATE]', '[M_OR_B]'].map(ph => (
                                    <span key={ph}
                                        onClick={() => setForm(f => ({ ...f, coupon_code_structure: f.coupon_code_structure + ph }))}
                                        style={{
                                            padding: '4px 10px', backgroundColor: '#EEF2FF', color: '#162860',
                                            borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                                            cursor: 'pointer', fontFamily: 'monospace',
                                        }}
                                    >{ph}</span>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                                    value={form.coupon_code_structure}
                                    onChange={e => setForm(f => ({ ...f, coupon_code_structure: e.target.value }))}
                                    placeholder="e.g. [SEQ]_[INVOICE]_AUTOVERSA_[M_OR_B]_[PLATE]"
                                />
                                <button
                                    onClick={() => setForm(f => ({ ...f, coupon_code_structure: '[SEQ]_[INVOICE]_AUTOVERSA_[M_OR_B]_[PLATE]' }))}
                                    style={{
                                        padding: '0 16px', backgroundColor: '#F0F4FF', color: '#162860',
                                        border: 'none', borderRadius: '8px', fontSize: '13px',
                                        fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                >Use Default</button>
                            </div>

                            {form.coupon_code_structure && (
                                <div style={{ padding: '12px 16px', backgroundColor: '#F0F7FF', borderRadius: '8px', border: '1px solid #C7DCFF' }}>
                                    <p style={{ fontSize: '11px', color: '#666', margin: '0 0 4px' }}>Preview (M):</p>
                                    <code style={{ fontSize: '13px', color: '#162860', fontWeight: '700' }}>
                                        {form.coupon_code_structure.replace('[SEQ]', '001').replace('[INVOICE]', 'A12345').replace('[OFFER_ID]', 'PRELAUNCH').replace('[PLATE]', 'ADHA12345').replace('[M_OR_B]', 'M')}
                                    </code>
                                    <p style={{ fontSize: '11px', color: '#666', margin: '8px 0 4px' }}>Preview (B):</p>
                                    <code style={{ fontSize: '13px', color: '#0074BD', fontWeight: '700' }}>
                                        {form.coupon_code_structure.replace('[SEQ]', '001').replace('[INVOICE]', 'A12345').replace('[OFFER_ID]', 'PRELAUNCH').replace('[PLATE]', 'ADHA12345').replace('[M_OR_B]', 'B')}
                                    </code>
                                </div>
                            )}

                            <Divider />
                            <SectionHeader title="Coupon Print Variables" />
                            <p style={{ ...hintStyle, marginBottom: '14px' }}>
                                Select what information gets printed on the coupon design. Manage variables in{' '}
                                <span onClick={() => router.push('/admin/settings')} style={{ color: '#0074BD', cursor: 'pointer' }}>Admin Settings</span>.
                            </p>

                            {availableVariables.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#F7F7F7', borderRadius: '10px', color: '#888', fontSize: '13px' }}>
                                    No variables configured.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {availableVariables.map(v => {
                                        const selected = offerVars.includes(v.key)
                                        return (
                                            <div key={v.key} onClick={() => toggleVariable(v.key)} style={{
                                                display: 'flex', alignItems: 'center', gap: '14px',
                                                padding: '14px 16px', borderRadius: '10px',
                                                border: `1.5px solid ${selected ? '#0074BD' : '#E0E0E0'}`,
                                                backgroundColor: selected ? '#F0F7FF' : '#FFFFFF',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                            }}>
                                                <div style={{
                                                    width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0,
                                                    border: `2px solid ${selected ? '#0074BD' : '#CCCCCC'}`,
                                                    backgroundColor: selected ? '#0074BD' : 'transparent',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {selected && <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: '700', lineHeight: 1 }}>✓</span>}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#1A1A1A', margin: 0 }}>{v.label}</p>
                                                    {v.description && <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0' }}>{v.description}</p>}
                                                </div>
                                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#888', backgroundColor: '#F0F0F0', padding: '3px 8px', borderRadius: '4px', flexShrink: 0 }}>
                                                    {v.key}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── TEMPLATE TAB ── */}
                    {activeTab === 'Template' && (
                        <>
                            <SectionHeader title="Coupon Template" />
                            <p style={{ ...hintStyle, marginBottom: '16px' }}>
                                Upload a background image. Drag variable chips onto it to set positions. Click a pin to adjust font settings.
                            </p>

                            <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '10px 20px', backgroundColor: '#F0F4FF', color: '#162860',
                                borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                                cursor: 'pointer', border: '1.5px dashed #0074BD',
                            }}>
                                <span>⬆ {templateImagePreview ? 'Replace Image' : 'Upload Template Image'}</span>
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                            </label>

                            {templateImagePreview && (
                                <p style={{ ...hintStyle, marginTop: '8px' }}>
                                    {templateImageDimensions ? `${templateImageDimensions.width} × ${templateImageDimensions.height}px` : 'Image loaded'}
                                    {!templateImageFile && existingTemplateUrl && ' (existing)'}
                                </p>
                            )}

                            {templateImagePreview && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', flex: 1 }}>
                                            {offerVars.length === 0 && (
                                                <p style={{ ...hintStyle, margin: 0 }}>Select print variables in Coupon Setup tab first.</p>
                                            )}
                                            {offerVars.filter(key => !getPositionForKey(key)).map(key => {
                                                const varConfig = availableVariables.find(v => v.key === key)
                                                if (!varConfig) return null
                                                return (
                                                    <div key={key} className="var-chip" draggable onDragStart={() => setDraggingKey(key)}
                                                        style={{
                                                            padding: '5px 10px', backgroundColor: '#162860', color: '#FFFFFF',
                                                            borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                                                            cursor: 'grab', userSelect: 'none',
                                                        }}>
                                                        ⠿ {varConfig.label}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        <button
                                            onClick={() => { setPreviewMode(p => !p); setSelectedVariableKey(null) }}
                                            style={{
                                                padding: '6px 14px', flexShrink: 0,
                                                backgroundColor: previewMode ? '#0074BD' : '#F0F4FF',
                                                color: previewMode ? '#FFFFFF' : '#162860',
                                                border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                                            }}
                                        >
                                            {previewMode ? '✕ Exit Preview' : '👁 Preview'}
                                        </button>
                                    </div>

                                    <div
                                        ref={imageContainerRef}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={handleImageDrop}
                                        style={{
                                            position: 'relative', display: 'block', width: '100%',
                                            maxWidth: '900px', margin: '0 auto', borderRadius: '10px', overflow: 'hidden',
                                            border: `2px solid ${previewMode ? '#0074BD' : '#E0E0E0'}`,
                                            cursor: previewMode ? 'default' : 'crosshair',
                                        }}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={templateImagePreview} alt="Template"
                                            style={{ display: 'block', width: '100%', height: 'auto' }} draggable={false} />

                                        {!previewMode && variablePositions.map(pos => {
                                            const varConfig = availableVariables.find(v => v.key === pos.key)
                                            if (!varConfig) return null
                                            const isSelected = selectedVariableKey === pos.key
                                            return (
                                                <div key={pos.key} draggable
                                                    onDragStart={e => handlePlacedChipDrag(e, pos.key)}
                                                    onClick={e => { e.stopPropagation(); setSelectedVariableKey(isSelected ? null : pos.key) }}
                                                    style={{
                                                        position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
                                                        transform: 'translate(-50%, -50%)', cursor: 'grab',
                                                        userSelect: 'none', zIndex: 10,
                                                        display: 'flex', alignItems: 'center', gap: '3px',
                                                    }}>
                                                    <div style={{
                                                        width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                                        backgroundColor: isSelected ? '#0074BD' : '#D0021B',
                                                        boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
                                                    }} />
                                                    <span style={{
                                                        fontSize: '10px', fontWeight: '700',
                                                        color: isSelected ? '#0074BD' : '#D0021B',
                                                        backgroundColor: 'rgba(255,255,255,0.92)',
                                                        padding: '1px 4px', borderRadius: '3px',
                                                        whiteSpace: 'nowrap', lineHeight: 1.4,
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                                    }}>
                                                        {pos.x.toFixed(0)},{pos.y.toFixed(0)}
                                                        <span
                                                            onClick={e => {
                                                                e.stopPropagation()
                                                                setVariablePositions(prev => prev.filter(p => p.key !== pos.key))
                                                                if (selectedVariableKey === pos.key) setSelectedVariableKey(null)
                                                            }}
                                                            style={{ marginLeft: '3px', opacity: 0.6, cursor: 'pointer' }}
                                                        >×</span>
                                                    </span>
                                                </div>
                                            )
                                        })}

                                        {previewMode && variablePositions.map(pos => (
                                            <div key={`preview-${pos.key}`} style={{
                                                position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
                                                transform: 'translate(-50%, -50%)',
                                                fontSize: `${pos.font_size}px`, fontWeight: pos.font_weight,
                                                color: pos.font_color, whiteSpace: 'nowrap',
                                                pointerEvents: 'none', fontFamily: 'Arial, sans-serif', lineHeight: 1,
                                            }}>
                                                {SAMPLE_VALUES[pos.key] || pos.key}
                                            </div>
                                        ))}
                                    </div>

                                    {!previewMode && selectedVariableKey && selectedVarConfig && (
                                        <div style={{
                                            marginTop: '16px', padding: '20px',
                                            backgroundColor: '#F0F7FF', borderRadius: '12px', border: '1.5px solid #0074BD',
                                        }}>
                                            <p style={{ fontSize: '13px', fontWeight: '700', color: '#0074BD', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Editing: {selectedVarConfig.label}
                                            </p>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                                                <div>
                                                    <label style={labelStyle}>X (%)</label>
                                                    <input style={inputStyle} type="number" min="0" max="100" step="0.1"
                                                        value={selectedVarPosition?.x?.toFixed(1) || '50'}
                                                        onChange={e => updatePosition(selectedVariableKey, { x: Number(e.target.value) })} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Y (%)</label>
                                                    <input style={inputStyle} type="number" min="0" max="100" step="0.1"
                                                        value={selectedVarPosition?.y?.toFixed(1) || '50'}
                                                        onChange={e => updatePosition(selectedVariableKey, { y: Number(e.target.value) })} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Font Size (px)</label>
                                                    <input style={inputStyle} type="number" min="8" max="120"
                                                        value={selectedVarPosition?.font_size || 16}
                                                        onChange={e => updatePosition(selectedVariableKey, { font_size: Number(e.target.value) })} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Font Color</label>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <input type="color"
                                                            value={selectedVarPosition?.font_color || '#000000'}
                                                            onChange={e => updatePosition(selectedVariableKey, { font_color: e.target.value })}
                                                            style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer', borderRadius: '6px' }} />
                                                        <input style={{ ...inputStyle, flex: 1 }}
                                                            value={selectedVarPosition?.font_color || '#000000'}
                                                            onChange={e => updatePosition(selectedVariableKey, { font_color: e.target.value })}
                                                            placeholder="#000000" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Font Weight</label>
                                                    <select style={inputStyle}
                                                        value={selectedVarPosition?.font_weight || 'normal'}
                                                        onChange={e => updatePosition(selectedVariableKey, { font_weight: e.target.value })}>
                                                        <option value="normal">Normal</option>
                                                        <option value="bold">Bold</option>
                                                        <option value="600">Semi-bold</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!templateImagePreview && offerVars.length > 0 && (
                                <div style={{
                                    padding: '24px', textAlign: 'center', backgroundColor: '#F7F7F7',
                                    borderRadius: '10px', color: '#888', fontSize: '13px', border: '1.5px dashed #E0E0E0',
                                }}>
                                    Upload a template image above to start positioning variables.
                                </div>
                            )}
                        </>
                    )}

                    {/* ── SUB-OFFERS & STAGES TAB ── */}
                    {activeTab === 'Sub-offers & Stages' && (
                        <>
                            <SectionHeader title="Sub-offers" />
                            <p style={hintStyle}>Service options a BMW customer picks at appointment booking.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {subOffers.map((s, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '12px 16px', backgroundColor: '#F7F9FF',
                                        borderRadius: '10px', border: '1px solid #E0E8FF',
                                    }}>
                                        <input style={{ ...inputStyle, flex: 1 }} value={s.name}
                                            onChange={e => updateSubOffer(i, { name: e.target.value })}
                                            placeholder="e.g. Free Minor Service Including Parts" />
                                        <div onClick={() => updateSubOffer(i, { is_active: !s.is_active })}
                                            title={s.is_active ? 'Active' : 'Inactive'}
                                            style={{
                                                width: '36px', height: '20px', borderRadius: '100px', flexShrink: 0,
                                                backgroundColor: s.is_active ? '#0074BD' : '#CCCCCC',
                                                cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s',
                                            }}>
                                            <div style={{
                                                position: 'absolute', top: '2px', left: s.is_active ? '18px' : '2px',
                                                width: '16px', height: '16px', borderRadius: '50%',
                                                backgroundColor: '#FFFFFF', transition: 'left 0.2s',
                                            }} />
                                        </div>
                                        <button onClick={() => removeSubOffer(i)} style={{
                                            padding: '6px 10px', backgroundColor: '#FFF0F0', color: '#D0021B',
                                            border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flexShrink: 0,
                                        }}>✕</button>
                                    </div>
                                ))}
                                <button onClick={addSubOffer} style={{
                                    padding: '10px', backgroundColor: '#F0F4FF', color: '#162860',
                                    border: '1.5px dashed #0074BD', borderRadius: '10px',
                                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                                }}>+ Add Sub-offer</button>
                            </div>

                            <Divider />
                            <SectionHeader title="Mercedes Loyalty Stages" />
                            <p style={hintStyle}>Reward tiers unlocked as BMW referrals complete visits.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {stages.map((s, i) => (
                                    <div key={i} style={{
                                        padding: '16px', backgroundColor: '#F7F9FF',
                                        borderRadius: '12px', border: '1px solid #E0E8FF',
                                        display: 'flex', flexDirection: 'column', gap: '10px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#162860', backgroundColor: '#E0E8FF', padding: '3px 10px', borderRadius: '20px' }}>
                                                Stage {s.stage_number}
                                            </span>
                                            <button onClick={() => removeStage(i)} style={{
                                                padding: '4px 8px', backgroundColor: '#FFF0F0', color: '#D0021B',
                                                border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                                            }}>✕ Remove</button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                                            <div>
                                                <label style={labelStyle}>BMW Visits Required</label>
                                                <input style={inputStyle} type="number" min="1" value={s.bmw_visits_required}
                                                    onChange={e => updateStage(i, { bmw_visits_required: Number(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Reward Label</label>
                                                <input style={inputStyle} value={s.reward_label}
                                                    onChange={e => updateStage(i, { reward_label: e.target.value })}
                                                    placeholder="e.g. 20% Labour Discount" />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Reward Description (optional)</label>
                                            <input style={inputStyle} value={s.reward_description}
                                                onChange={e => updateStage(i, { reward_description: e.target.value })}
                                                placeholder="Additional details about this reward" />
                                        </div>
                                    </div>
                                ))}
                                <button onClick={addStage} style={{
                                    padding: '10px', backgroundColor: '#F0F4FF', color: '#162860',
                                    border: '1.5px dashed #0074BD', borderRadius: '10px',
                                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                                }}>+ Add Stage</button>
                            </div>
                        </>
                    )}

                    {/* ── WHATSAPP TAB ── */}
                    {activeTab === 'WhatsApp' && (
                        <>
                            <SectionHeader title="WhatsApp Message Templates" />
                            <p style={hintStyle}>Pre-filled messages sent at each trigger point. Click placeholders to insert at cursor.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {waTemplates.map(t => (
                                    <div key={t.trigger_type} style={{
                                        padding: '20px', backgroundColor: '#F7F9FF',
                                        borderRadius: '12px', border: '1px solid #E0E8FF',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '18px' }}>📲</span>
                                            <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', margin: 0 }}>
                                                {WA_TRIGGER_LABELS[t.trigger_type]}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                            {WA_TRIGGER_VARIABLES[t.trigger_type].map(ph => (
                                                <span key={ph}
                                                    onClick={() => {
                                                        const textarea = document.getElementById(`wa-${t.trigger_type}`) as HTMLTextAreaElement
                                                        if (!textarea) return
                                                        const start = textarea.selectionStart
                                                        const end = textarea.selectionEnd
                                                        const updated = t.message_body.substring(0, start) + ph + t.message_body.substring(end)
                                                        updateWaTemplate(t.trigger_type, updated)
                                                        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + ph.length, start + ph.length) }, 0)
                                                    }}
                                                    style={{
                                                        padding: '3px 8px', backgroundColor: '#EEF2FF', color: '#162860',
                                                        borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                                                        cursor: 'pointer', fontFamily: 'monospace',
                                                    }}
                                                >{ph}</span>
                                            ))}
                                        </div>
                                        <textarea
                                            id={`wa-${t.trigger_type}`}
                                            style={{ ...inputStyle, height: '140px', resize: 'vertical', fontFamily: 'inherit', fontSize: '13px' }}
                                            value={t.message_body}
                                            onChange={e => updateWaTemplate(t.trigger_type, e.target.value)}
                                            placeholder="Type your WhatsApp message here."
                                        />
                                        <p style={{ ...hintStyle, marginTop: '6px' }}>{t.message_body.length} characters</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── Navigation ── */}
                    <Divider />
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => router.push('/offers')} style={{
                                padding: '12px 20px', backgroundColor: '#F0F0F0', color: '#444',
                                border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                            }}>Cancel</button>
                            {currentTabIndex > 0 && (
                                <button onClick={() => goToTab(TABS[currentTabIndex - 1])} style={{
                                    padding: '12px 20px', backgroundColor: '#F0F4FF', color: '#162860',
                                    border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                                }}>← Back</button>
                            )}
                        </div>

                        <div>
                            {mode === 'edit' ? (
                                <button onClick={handleSave} disabled={saving} style={{
                                    padding: '12px 32px',
                                    backgroundColor: saving ? '#93C5E8' : '#0074BD',
                                    color: '#FFFFFF', border: 'none', borderRadius: '10px',
                                    fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer',
                                }}>
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            ) : isLastTab ? (
                                <button onClick={handleSave} disabled={saving} style={{
                                    padding: '12px 32px',
                                    backgroundColor: saving ? '#93C5E8' : '#162860',
                                    color: '#FFFFFF', border: 'none', borderRadius: '10px',
                                    fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer',
                                }}>
                                    {saving ? 'Creating...' : '✓ Create Offer'}
                                </button>
                            ) : (
                                <button onClick={() => goToTab(TABS[currentTabIndex + 1])} style={{
                                    padding: '12px 32px', backgroundColor: '#0074BD',
                                    color: '#FFFFFF', border: 'none', borderRadius: '10px',
                                    fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                                }}>Next →</button>
                            )}
                        </div>
                    </div>

                </div>
            </main>
        </div>
    )
}

function WindowToggle({ value, onChange }: {
    value: 'date_range' | 'days'
    onChange: (v: 'date_range' | 'days') => void
}) {
    return (
        <div style={{ display: 'flex', gap: '8px' }}>
            {(['date_range', 'days'] as const).map(opt => (
                <button key={opt} onClick={() => onChange(opt)} style={{
                    padding: '7px 16px', border: 'none', borderRadius: '8px',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    backgroundColor: value === opt ? '#162860' : '#F0F0F0',
                    color: value === opt ? '#FFFFFF' : '#666',
                    transition: 'all 0.15s',
                }}>
                    {opt === 'date_range' ? '📅 Date Range' : '⏱ Number of Days'}
                </button>
            ))}
        </div>
    )
}

function SectionHeader({ title }: { title: string }) {
    return (
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#162860', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            {title}
        </p>
    )
}

function Divider() {
    return <div style={{ borderTop: '1px solid #F0F0F0', margin: '4px 0' }} />
}

const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: '600', color: '#1A1A1A', marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: '14px',
    border: '1.5px solid #E0E0E0', borderRadius: '8px', outline: 'none',
    backgroundColor: '#FFFFFF', color: '#1A1A1A',
    boxSizing: 'border-box', fontFamily: 'inherit',
}

const hintStyle: React.CSSProperties = {
    fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: 0,
}