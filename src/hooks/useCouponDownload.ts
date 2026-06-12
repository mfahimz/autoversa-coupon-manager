import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface VariablePosition {
    variable_key: string
    x_coordinate: number
    y_coordinate: number
    font_size: number
    font_color: string
    font_weight: string
}

interface CouponData {
    coupon_code: string
    expiry_date: string
    customer_name?: string | null
    plate_combined_string?: string | null
    mobile_number?: string | null
    offer_id?: string | null
    advisor_name?: string | null
    offer_title?: string | null
}

const VARIABLE_VALUES: Record<string, (data: CouponData) => string> = {
    coupon_code: d => d.coupon_code,
    expiry_date: d => {
        try {
            return new Date(d.expiry_date).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
            })
        } catch { return d.expiry_date }
    },
    customer_name: d => d.customer_name || '',
    plate_number: d => d.plate_combined_string || '',
    mobile_number: d => d.mobile_number ? `+971${d.mobile_number}` : '',
    advisor_name: d => d.advisor_name || '',
    offer_title: d => d.offer_title || '',
}

export function useCouponDownload() {
    const supabase = createClient()

    const downloadCoupon = useCallback(async (
        couponData: CouponData,
        filename: string = 'autoversa-coupon'
    ): Promise<void> => {
        try {
            if (!couponData.offer_id) {
                throw new Error('No offer ID on coupon')
            }

            // Fetch template for this offer
            const { data: template, error: templateError } = await supabase
                .from('templates')
                .select('id, file_url, image_width, image_height')
                .eq('offer_id', couponData.offer_id)
                .eq('is_active', true)
                .single()

            if (templateError || !template) {
                throw new Error('No active template found for this offer')
            }

            // Fetch variable positions
            const { data: positions } = await supabase
                .from('template_variable_positions')
                .select('variable_key, x_coordinate, y_coordinate, font_size, font_color, font_weight')
                .eq('template_id', template.id)

            // Load background image
            const bgImage = await loadImage(template.file_url)

            // Create canvas at natural image size (2x for retina)
            const scale = 2
            const canvas = document.createElement('canvas')
            canvas.width = bgImage.naturalWidth * scale
            canvas.height = bgImage.naturalHeight * scale

            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Canvas context unavailable')

            ctx.scale(scale, scale)

            // Draw background
            ctx.drawImage(bgImage, 0, 0, bgImage.naturalWidth, bgImage.naturalHeight)

            // Draw each variable
            if (positions && positions.length > 0) {
                for (const pos of positions as VariablePosition[]) {
                    const value = VARIABLE_VALUES[pos.variable_key.toLowerCase()]?.(couponData)
                    if (!value) continue

                    const x = (Number(pos.x_coordinate) / 100) * bgImage.naturalWidth
                    const y = (Number(pos.y_coordinate) / 100) * bgImage.naturalHeight

                    ctx.font = `${pos.font_weight || 'normal'} ${pos.font_size || 16}px Arial`
                    ctx.fillStyle = pos.font_color || '#000000'
                    ctx.textAlign = 'left'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(value, x, y)
                }
            }

            // Download
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
            const link = document.createElement('a')
            link.download = `${filename}.jpg`
            link.href = dataUrl
            link.click()

        } catch (err: any) {
            console.error('Coupon download failed:', err)
            alert(err.message || 'Failed to generate coupon image. Make sure a template is configured for this offer.')
        }
    }, [])

    return { downloadCoupon }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
        img.src = src
    })
}