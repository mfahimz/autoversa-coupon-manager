import { createClient } from './client'

/**
 * Fetches the current authenticated user's profile.
 * Returns the profile object or null if not authenticated.
 */
export const getCurrentUser = async () => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return data
}

/**
 * Fetches all offers sorted by creation date descending.
 */
export const getOffers = async () => {
  const supabase = createClient()
  const { data } = await supabase.from('offers').select('*').order('created_at', { ascending: false })
  return data || []
}

/**
 * Fetches a single offer by its ID.
 */
export const getOffer = async (id: string) => {
  const supabase = createClient()
  const { data } = await supabase.from('offers').select('*').eq('id', id).single()
  return data
}

/**
 * Fetches all templates sorted by creation date descending.
 */
export const getTemplates = async () => {
  const supabase = createClient()
  const { data } = await supabase.from('templates').select('*').order('created_at', { ascending: false })
  return data || []
}

/**
 * Fetches a single template by its ID.
 */
export const getTemplate = async (id: string) => {
  const supabase = createClient()
  const { data } = await supabase.from('templates').select('id, file_url, font_family, text_color').eq('id', id).single()
  return data
}

/**
 * Fetches the variable positions defined for a given template.
 */
export const getTemplatePositions = async (templateId: string) => {
  const supabase = createClient()
  const { data } = await supabase.from('template_variable_positions').select('id, variable_key, x_coordinate, y_coordinate, font_size, font_color, font_weight').eq('template_id', templateId)
  return data || []
}

/**
 * Fetches all coupons sorted by creation date descending.
 */
export const getCoupons = async () => {
  const supabase = createClient()
  const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false })
  return data || []
}

/**
 * Fetches a single coupon by its ID.
 */
export const getCoupon = async (id: string) => {
  const supabase = createClient()
  const { data } = await supabase.from('coupons').select('*').eq('id', id).single()
  return data
}

/**
 * Fetches all coupons issued by a specific service advisor.
 */
export const getCouponsByAdvisor = async (advisorId: string) => {
  const supabase = createClient()
  const { data } = await supabase.from('coupons').select('*').eq('issued_by', advisorId).order('created_at', { ascending: false })
  return data || []
}

/**
 * Fetches all appointments sorted by appointment date ascending.
 */
export const getAppointments = async () => {
  const supabase = createClient()
  const { data } = await supabase.from('appointments').select('*').order('appointment_date', { ascending: true })
  return data || []
}

/**
 * Fetches the active campaign configuration settings.
 */
export const getCampaignConfig = async () => {
  const supabase = createClient()
  const { data } = await supabase.from('campaign_config').select('*').single()
  return data
}

/**
 * Counts all non-cancelled coupons in the system.
 */
export const getCouponCount = async () => {
  const supabase = createClient()
  const { count } = await supabase.from('coupons').select('*', { count: 'exact', head: true }).neq('status', 'CANCELLED')
  return count || 0
}
