-- Migration: Create advisor_commission_payouts table
CREATE TABLE IF NOT EXISTS public.advisor_commission_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advisor_code TEXT NOT NULL,
    advisor_name TEXT NOT NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payout_amount NUMERIC(12, 2) NOT NULL CHECK (payout_amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start_date DATE,
    period_end_date DATE,
    payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    reference_number TEXT,
    notes TEXT,
    paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payouts_advisor_code ON public.advisor_commission_payouts(advisor_code);
CREATE INDEX IF NOT EXISTS idx_payouts_payment_date ON public.advisor_commission_payouts(payment_date);

-- Enable RLS
ALTER TABLE public.advisor_commission_payouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read payouts" ON public.advisor_commission_payouts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert payouts" ON public.advisor_commission_payouts
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update payouts" ON public.advisor_commission_payouts
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete payouts" ON public.advisor_commission_payouts
    FOR DELETE TO authenticated USING (true);
