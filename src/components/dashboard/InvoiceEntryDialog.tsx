'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog as BaseDialog,
  DialogContent as BaseDialogContent,
  DialogHeader as BaseDialogHeader,
  DialogTitle as BaseDialogTitle,
  DialogDescription as BaseDialogDescription,
  DialogFooter as BaseDialogFooter
} from '@/components/ui/dialog'
import { Input as BaseInput } from '@/components/ui/input'
import { Label as BaseLabel } from '@/components/ui/label'
import { Button as BaseButton } from '@/components/ui/button'

const Dialog = BaseDialog as React.ComponentType<{ open?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }>
const DialogContent = BaseDialogContent as React.ComponentType<{ className?: string; children?: React.ReactNode }>
const DialogHeader = BaseDialogHeader as React.ComponentType<{ className?: string; children?: React.ReactNode }>
const DialogTitle = BaseDialogTitle as React.ComponentType<{ className?: string; children?: React.ReactNode }>
const DialogDescription = BaseDialogDescription as React.ComponentType<{ className?: string; children?: React.ReactNode }>
const DialogFooter = BaseDialogFooter as React.ComponentType<{ className?: string; children?: React.ReactNode }>

const Input = BaseInput as React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>
const Label = BaseLabel as React.ComponentType<React.LabelHTMLAttributes<HTMLLabelElement>>
const Button = BaseButton as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>
import { Spinner } from '@/components/ui/Spinner'
import {
  getAllAdvisorsMissingStatus,
  submitBaseline,
  submitDailyInvoices,
  type AdvisorMissingStatus
} from '@/lib/invoiceTracking'

interface InvoiceEntryDialogProps {
  isOpen: boolean
  onClose: () => void
  currentUserId: string
  currentUserRole: string
}

export default function InvoiceEntryDialog({
  isOpen,
  onClose,
  currentUserId,
  currentUserRole
}: InvoiceEntryDialogProps) {
  const [loading, setLoading] = useState(true)
  const [advisors, setAdvisors] = useState<AdvisorMissingStatus[]>([])
  const [baselineInputs, setBaselineInputs] = useState<Record<string, string>>({})
  const [invoiceInputs, setInvoiceInputs] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const currentMonthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const fetchStatus = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const data = await getAllAdvisorsMissingStatus()
      const filtered = data.filter(a => a.needsBaseline || a.missingDays.length > 0)
      setAdvisors(filtered)

      const initialBaselines: Record<string, string> = {}
      const initialInvoices: Record<string, string> = {}

      filtered.forEach(adv => {
        if (adv.needsBaseline) {
          initialBaselines[adv.advisor_code] = ''
        }
        adv.missingDays.forEach(day => {
          initialInvoices[`${adv.advisor_code}:${day}`] = ''
        })
      })

      setBaselineInputs(initialBaselines)
      setInvoiceInputs(initialInvoices)
    } catch (err: any) {
      console.error('Error fetching advisor status:', err)
      setErrorMsg(err.message || 'Failed to load advisor status entries.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStatus()
    }
  }, [isOpen])

  const handleOpenChange = (open: boolean) => {
    if (!open && !submitting) {
      onClose()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setErrorMsg(null)

    try {
      // 1. Gather and submit daily invoices
      const invoiceEntries: { advisorCode: string; invoiceDate: string; invoiceCount: number }[] = []
      advisors.forEach(adv => {
        adv.missingDays.forEach(day => {
          const val = invoiceInputs[`${adv.advisor_code}:${day}`]
          const count = val && val.trim() !== '' ? parseInt(val, 10) : 0
          invoiceEntries.push({
            advisorCode: adv.advisor_code,
            invoiceDate: day,
            invoiceCount: count
          })
        })
      })

      if (invoiceEntries.length > 0) {
        const { error } = await submitDailyInvoices(invoiceEntries, currentUserId)
        if (error) throw error
      }

      // 2. Gather and submit baseline configurations
      const baselinePromises: Promise<any>[] = []
      const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

      advisors.forEach(adv => {
        if (adv.needsBaseline) {
          const val = baselineInputs[adv.advisor_code]
          const count = val && val.trim() !== '' ? parseInt(val, 10) : 0
          baselinePromises.push(
            submitBaseline(adv.advisor_code, currentMonthStr, count, currentUserId).then(res => {
              if (res.error) throw res.error
              return res
            })
          )
        }
      })

      if (baselinePromises.length > 0) {
        await Promise.all(baselinePromises)
      }

      // 3. Refresh status to check if everything is complete
      const refreshedData = await getAllAdvisorsMissingStatus()
      const stillNeedingAction = refreshedData.filter(a => a.needsBaseline || a.missingDays.length > 0)
      setAdvisors(stillNeedingAction)

      if (stillNeedingAction.length === 0) {
        onClose()
      } else {
        // Retain current inputs for items that are still missing/failed
        const updatedBaselines: Record<string, string> = {}
        const updatedInvoices: Record<string, string> = {}

        stillNeedingAction.forEach(adv => {
          if (adv.needsBaseline) {
            updatedBaselines[adv.advisor_code] = baselineInputs[adv.advisor_code] || ''
          }
          adv.missingDays.forEach(day => {
            updatedInvoices[`${adv.advisor_code}:${day}`] = invoiceInputs[`${adv.advisor_code}:${day}`] || ''
          })
        })

        setBaselineInputs(updatedBaselines)
        setInvoiceInputs(updatedInvoices)
      }
    } catch (err: any) {
      console.error('Submission error:', err)
      setErrorMsg(err.message || 'Failed to submit advisor entries.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl font-bold text-[#162860]">
            Log Daily Invoices & Baselines
          </DialogTitle>
          <DialogDescription className="text-sm text-[#666666]">
            Enter missing monthly baseline counts and daily invoice counts for active service advisors.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable inputs body */}
        <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Spinner className="h-8 w-8 text-[#0074BD]" />
              <p className="text-sm text-muted-foreground animate-pulse">Loading advisor requirements...</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm">
              <p className="font-semibold">Error occurred</p>
              <p className="mt-1">{errorMsg}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchStatus}
                className="mt-3 border-red-300 hover:bg-red-100/50"
              >
                Try Again
              </Button>
            </div>
          ) : advisors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 text-lg font-bold">
                ✓
              </div>
              <h4 className="text-base font-semibold text-foreground">All entries up to date</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                There are no missing daily invoice entries or monthly baselines for any active advisors.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {advisors.map(adv => (
                <div
                  key={adv.advisor_code}
                  className="border rounded-xl p-4 bg-card shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between pb-3 border-b mb-4">
                    <h4 className="font-bold text-[#162860]">{adv.full_name}</h4>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {adv.advisor_code}
                    </span>
                  </div>

                  {adv.needsBaseline && (
                    <div className="mb-4 bg-amber-50/50 border border-amber-200/50 p-3 rounded-lg">
                      <Label
                        htmlFor={`baseline-${adv.advisor_code}`}
                        className="text-sm font-semibold text-amber-800"
                      >
                        Baseline count for {currentMonthName}
                      </Label>
                      <Input
                        id={`baseline-${adv.advisor_code}`}
                        type="number"
                        min="0"
                        placeholder="Enter baseline count"
                        value={baselineInputs[adv.advisor_code] ?? ''}
                        onChange={(e) =>
                          setBaselineInputs(prev => ({ ...prev, [adv.advisor_code]: e.target.value }))
                        }
                        className="mt-1.5 w-full bg-white border-amber-300 focus-visible:ring-amber-500"
                      />
                    </div>
                  )}

                  {adv.missingDays.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-foreground">
                        Missing Daily Invoice Counts
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {adv.missingDays.map(day => {
                          const [y, m, d] = day.split('-')
                          const formattedDate = `${d}/${m}/${y}`
                          const inputKey = `${adv.advisor_code}:${day}`
                          return (
                            <div
                              key={day}
                              className="flex flex-col space-y-1.5 p-2.5 rounded-lg border bg-muted/20"
                            >
                              <Label
                                htmlFor={`invoice-${inputKey}`}
                                className="text-xs text-muted-foreground font-medium"
                              >
                                Invoice Count — {formattedDate}
                              </Label>
                              <Input
                                id={`invoice-${inputKey}`}
                                type="number"
                                min="0"
                                placeholder="Enter invoices"
                                value={invoiceInputs[inputKey] ?? ''}
                                onChange={(e) =>
                                  setInvoiceInputs(prev => ({ ...prev, [inputKey]: e.target.value }))
                                }
                                className="h-8 bg-white"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </form>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="pt-4 border-t">
          {advisors.length === 0 && !loading ? (
            <Button onClick={onClose} className="w-full sm:w-auto bg-[#162860] hover:bg-[#0074BD] text-white">
              Close
            </Button>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              {advisors.length > 0 && (
                <Button
                  type="submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full sm:w-auto bg-[#162860] hover:bg-[#0074BD] text-white"
                >
                  {submitting ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Saving Entries...
                    </>
                  ) : (
                    'Save Entries'
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
