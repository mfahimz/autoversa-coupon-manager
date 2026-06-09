import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Edit, Archive, Activity, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import CouponPreviewRenderer from '@/components/coupons/CouponPreviewRenderer';
import { toast } from 'sonner';

export default function CouponDetailDialog({ coupon, onClose, onUpdateStatus, onArchive }) {
  const [newStatus, setNewStatus] = React.useState(coupon.status);
  const [isDownloading, setIsDownloading] = useState(false);
  const couponPreviewRef = useRef(null);

  const handleDownloadCoupon = async (includeTerms = false) => {
    if (!couponPreviewRef.current) return;
    
    setIsDownloading(true);
    try {
      const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default;
      
      if (includeTerms) {
        // Create temporary container
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.backgroundColor = '#ffffff';
        container.style.display = 'inline-block';
        document.body.appendChild(container);
        
        // Get the coupon preview element - capture its computed dimensions
        const couponElement = couponPreviewRef.current;
        const couponRect = couponElement.getBoundingClientRect();
        
        // Clone and add coupon - preserve exact dimensions and positioning
        const couponClone = couponElement.cloneNode(true);
        couponClone.style.display = 'block';
        couponClone.style.margin = '0';
        couponClone.style.padding = '0';
        couponClone.style.position = 'relative';
        couponClone.style.width = couponRect.width + 'px';
        couponClone.style.height = couponRect.height + 'px';
        container.appendChild(couponClone);
        
        // Wait for images to load and render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Add terms below without affecting coupon positioning
        const termsDiv = document.createElement('div');
        termsDiv.style.width = couponRect.width + 'px';
        termsDiv.style.backgroundColor = '#f8fafc';
        termsDiv.style.padding = '20px';
        termsDiv.style.borderTop = '2px solid #e2e8f0';
        termsDiv.style.boxSizing = 'border-box';
        const termsContent = `
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="margin-bottom: 6px;">• The mobile number shown is only the last 5 digits</li>
            <li style="margin-bottom: 6px;">• Offer Is Applicable Only For The Mentioned Plate Number</li>
            <li style="margin-bottom: 6px;">• Periodic Service & Body Repair Is Not Included In This Offer</li>
            <li style="margin-bottom: 6px;">• Offer Is Valid Only For The First-Time Visit</li>
            <li style="margin-bottom: 6px;">• Offer Valid Till Mentioned Expiry Date</li>
            <li style="margin-bottom: 6px;">• No Other Offers Applicable With This Offer During The Visit</li>
            <li style="margin-bottom: 6px;">• Offer Is Applicable For Appointment Customers Only</li>
            <li style="margin-bottom: 6px;">• Offer Applicable Only For Labour Charges</li>
            <li style="margin-bottom: 6px;">• Offer is only applicable for new customers</li>
          </ul>
        `;

        termsDiv.innerHTML = `
          <h4 style="font-weight: bold; color: #0f172a; margin: 0 0 12px 0; font-size: 16px; font-family: Arial, sans-serif;">TERMS & CONDITIONS</h4>
          <div style="font-size: 13px; color: #334155; line-height: 1.6; font-family: Arial, sans-serif;">${termsContent}</div>
        `;
        container.appendChild(termsDiv);
        
        // Capture entire container with exact dimensions
        const canvas = await html2canvas(container, {
          useCORS: true,
          allowTaint: true,
          scale: 3,
          backgroundColor: '#ffffff',
          width: container.offsetWidth,
          height: container.offsetHeight,
          logging: false,
          imageTimeout: 0,
        });
        
        document.body.removeChild(container);
        
        const link = document.createElement('a');
        link.download = `coupon_${coupon.coupon_code}_with_terms.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Download coupon only
        const canvas = await html2canvas(couponPreviewRef.current, {
          useCORS: true,
          allowTaint: true,
          scale: 3,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 0,
        });
        
        const link = document.createElement('a');
        link.download = `coupon_${coupon.coupon_code}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      toast.success('Coupon image downloaded!');
    } catch (error) {
      console.error('Failed to download:', error);
      toast.error('Failed to download coupon: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const { data: activityLogs = [] } = useQuery({
    queryKey: ['coupon-activity', coupon.id],
    queryFn: () => base44.entities.CouponActivityLog.filter({ coupon_id: coupon.id }, '-created_date'),
  });

  const getEffectiveStatus = () => {
    const today = new Date();
    const expiry = new Date(coupon.expiry_date);
    if (expiry < today && coupon.status === 'ACTIVE') {
      return 'EXPIRED';
    }
    return coupon.status;
  };

  const handleUpdateStatus = () => {
    if (newStatus !== coupon.status) {
      onUpdateStatus(newStatus);
      onClose();
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Coupon Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Coupon Image Preview */}
          <Card className="bg-slate-50">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-900 mb-4">Coupon Image</h3>
              {coupon.template_id ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Button
                      onClick={() => handleDownloadCoupon(false)}
                      disabled={isDownloading}
                      className="bg-slate-800 hover:bg-slate-900"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Coupon Only
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleDownloadCoupon(true)}
                      disabled={isDownloading}
                      variant="outline"
                      className="border-slate-300"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          With Terms
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="border border-slate-200 rounded overflow-auto bg-white">
                    <CouponPreviewRenderer
                      ref={couponPreviewRef}
                      templateId={coupon.template_id}
                      couponData={{
                        identifier_type: coupon.identifier_type,
                        plate_combined_string: coupon.plate_combined_string,
                        issue_date: format(new Date(coupon.issue_date), 'dd-MM-yyyy'),
                        expiry_date: format(new Date(coupon.expiry_date), 'dd-MM-yyyy'),
                        coupon_code: coupon.coupon_code,
                      }}
                    />
                    {/* Terms & Conditions */}
                    <div className="bg-slate-50 p-4 border-t border-slate-200">
                      <h4 className="font-bold text-slate-900 mb-2">TERMS & CONDITIONS</h4>
                      <ul className="text-xs text-slate-700 space-y-1">
                        <li>• The mobile number shown is only the last 5 digits</li>
                        <li>• Offer Is Applicable Only For The Mentioned Plate Number</li>
                        <li>• Periodic Service & Body Repair Is Not Included In This Offer</li>
                        <li>• Offer Is Valid Only For The First-Time Visit</li>
                        <li>• Offer Valid Till Mentioned Expiry Date</li>
                        <li>• No Other Offers Applicable With This Offer During The Visit</li>
                        <li>• Offer Is Applicable For Appointment Customers Only</li>
                        <li>• Offer Applicable Only For Labour Charges</li>
                        <li>• Offer is only applicable for new customers</li>
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">No template assigned</p>
              )}
            </CardContent>
          </Card>

          {/* Vehicle Information */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-900 mb-4">Vehicle Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600">Plate Number</p>
                  <p className="font-mono font-medium">{coupon.plate_combined_string}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Car Model</p>
                  <p className="font-medium">{coupon.car_model}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Coupon Information */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-900 mb-4">Coupon Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600">Coupon Code</p>
                  <p className="font-mono font-medium">{coupon.coupon_code}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Current Status</p>
                  <p className="font-medium">{getEffectiveStatus()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Offer</p>
                  <p className="font-medium">{coupon.offer_title}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Valid Days</p>
                  <p className="font-medium">{coupon.valid_days} days</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Issue Date</p>
                  <p className="font-medium">{format(new Date(coupon.issue_date), 'dd MMM yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Expiry Date</p>
                  <p className="font-medium">{format(new Date(coupon.expiry_date), 'dd MMM yyyy')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-slate-600">Created By</p>
                  <p className="font-medium">{coupon.created_by}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Update */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Edit className="w-4 h-4" />
                Update Status
              </h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>New Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="REDEEMED">Redeemed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleUpdateStatus}
                  disabled={newStatus === coupon.status}
                  className="mt-6"
                >
                  Update Status
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Activity Log
              </h3>
              <div className="space-y-3">
                {activityLogs.length === 0 ? (
                  <p className="text-sm text-slate-500">No activity recorded</p>
                ) : (
                  activityLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 pb-3 border-b border-slate-100 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {log.action_type === 'CREATED' && 'Coupon Created'}
                          {log.action_type === 'STATUS_CHANGED' && `Status changed from ${log.old_status} to ${log.new_status}`}
                          {log.action_type === 'ARCHIVED' && 'Coupon Archived'}
                          {log.action_type === 'SHARED' && 'Coupon Shared'}
                        </p>
                        <p className="text-xs text-slate-500">
                          by {log.performed_by_user_name} • {format(new Date(log.created_date), 'dd MMM yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1 text-red-600 hover:text-red-700"
              onClick={() => {
                if (confirm('Are you sure you want to archive this coupon?')) {
                  onArchive();
                }
              }}
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive Coupon
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}