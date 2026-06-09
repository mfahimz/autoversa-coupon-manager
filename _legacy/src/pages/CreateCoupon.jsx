import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Imported MessageCircle icon from lucide-react for the Open WhatsApp feature
import { Plus, Calendar, Loader2, CheckCircle, Share2, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import CouponPreviewRenderer from '@/components/coupons/CouponPreviewRenderer';

export default function CreateCoupon() {
  // Added whatsapp_number field to state for client-side WhatsApp sharing functionality
  const [formData, setFormData] = useState({
    plate_number: '',
    plate_category: '',
    plate_region: '',
    mobile_number: '',
    car_model: '',
    offer_id: '',
    valid_days: 30,
    whatsapp_number: '',
  });
  const [calculatedExpiry, setCalculatedExpiry] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [createdCoupon, setCreatedCoupon] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const couponPreviewRef = useRef(null);

  // Dynamic field values for manual variable inputs
  const [dynamicFieldValues, setDynamicFieldValues] = useState({});

  const { data: offers = [] } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.filter({ is_active: true }),
  });

  const selectedOffer = offers.find(o => o.id === formData.offer_id);
  // User-driven selection of identifier type instead of offer customer_status dependency
  const [identifierType, setIdentifierType] = useState('PLATE');

  // Dynamic offer variables — parsed from selectedOffer.offer_variables
  // isLegacyOffer flag ensures backward compatibility with offers that have no variables configured
  // Updated: 2026-05-25
  const offerVariables = (() => {
    if (!selectedOffer?.offer_variables) return [];
    try {
      return JSON.parse(selectedOffer.offer_variables);
    } catch {
      return [];
    }
  })();

  // Separate into manual and auto variables
  const manualVariables = offerVariables.filter(v => v.auto !== true);
  const autoVariables = offerVariables.filter(v => v.auto === true);

  // Check if offer uses legacy mode (no offer_variables configured) — fall back to old behaviour
  const isLegacyOffer = offerVariables.length === 0;

  // Parse vehicle config from selected offer
  const vehicleConfig = (() => {
    if (!selectedOffer?.vehicle_config) return { mode: 'any_brand', brands: [], models: {} };
    try {
      return JSON.parse(selectedOffer.vehicle_config);
    } catch {
      return { mode: 'any_brand', brands: [], models: {} };
    }
  })();

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.filter({ is_active: true }),
  });

  const { data: templatePositions = [] } = useQuery({
    queryKey: ['template-positions'],
    queryFn: () => base44.entities.TemplateVariablePosition.list(),
  });

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  useEffect(() => {
    if (formData.valid_days) {
      const today = new Date();
      const expiry = addDays(today, parseInt(formData.valid_days));
      setCalculatedExpiry(format(expiry, 'dd-MM-yyyy'));
    }
  }, [formData.valid_days]);

  // Auto-populate validity when offer changes
  useEffect(() => {
    if (selectedOffer?.valid_days) {
      setFormData(prev => ({ ...prev, valid_days: selectedOffer.valid_days }));
    }
  }, [selectedOffer]);

  const markSharedMutation = useMutation({
    mutationFn: async (couponId) => {
      await base44.entities.Coupon.update(couponId, {
        shared_by_user_id: user.id,
        shared_at: new Date().toISOString(),
      });
      await base44.entities.CouponActivityLog.create({
        coupon_id: couponId,
        action_type: 'SHARED',
        performed_by_user_id: user.id,
        performed_by_user_name: user.full_name,
      });
    },
    onSuccess: () => {
      toast.success('Coupon marked as shared!');
      setCreatedCoupon(null);
      // Reset the form fields including the temporary whatsapp_number field on successful share registration
      setFormData({
        plate_number: '',
        plate_category: '',
        plate_region: '',
        mobile_number: '',
        car_model: '',
        offer_id: '',
        valid_days: 30,
        whatsapp_number: '',
      });
      setDynamicFieldValues({});
    },
  });

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
        const termsContent = selectedOffer?.terms_and_conditions || `
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
        link.download = `coupon_${createdCoupon.coupon_code}_with_terms.png`;
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
        link.download = `coupon_${createdCoupon.coupon_code}.png`;
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

  // List of UAE Emirates in the correct designated order for regional dropdown options
  const UAE_EMIRATES = [
    { value: 'Abu Dhabi', code: 'R' },
    { value: 'Dubai', code: 'DXB' },
    { value: 'Sharjah', code: 'SHJ' },
    { value: 'Ajman', code: 'AJM' },
    { value: 'Umm Al Quwain', code: 'UAQ' },
    { value: 'Ras Al Khaimah', code: 'RAK' },
    { value: 'Fujairah', code: 'FUJ' },
  ];

  const formatPlateString = (plateNumber, category, region) => {
    const emirate = UAE_EMIRATES.find(e => e.value === region);
    const code = emirate?.code || region;
    return `${plateNumber}-${code}${category}`;
  };

  const formatMobileIdentifier = (lastFiveDigits) => {
    return lastFiveDigits;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Find template linked to the selected offer, or use default
    let selectedTemplate = templates.find(t => t.offer_id === formData.offer_id);
    if (!selectedTemplate) {
      selectedTemplate = templates.find(t => t.is_default === true);
    }
    if (!selectedTemplate && templates.length > 0) {
      selectedTemplate = templates[0];
    }

    if (!selectedTemplate) {
      toast.error('No template available. Please contact admin.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('Preparing coupon data...');

    const today = new Date();
    const issueDate = format(today, 'yyyy-MM-dd');
    const issueDateFormatted = format(today, 'dd-MM-yyyy');
    const expiryDate = format(addDays(today, parseInt(formData.valid_days)), 'yyyy-MM-dd');

    // Determine identifier based on offer type
    let identifierString;
    if (identifierType === 'MOBILE') {
      identifierString = formatMobileIdentifier(formData.mobile_number);
    } else {
      identifierString = formatPlateString(formData.plate_number, formData.plate_category, formData.plate_region);
    }

    // Get coupons for this specific offer to determine serial number
    setGenerationProgress('Generating serial number...');
    const offerCoupons = await base44.entities.Coupon.filter({ offer_id: formData.offer_id });
    const serialNumber = (offerCoupons.length + 1).toString().padStart(4, '0');

    // Get coupon code prefix from template
    const couponCodePrefix = selectedTemplate.coupon_code_prefix || 'ALMOFF';

    // Coupon code generation — uses offer's coupon_code_structure if defined
    // Placeholders: {PREFIX} {SERIAL} {ADVISOR} {IDENTIFIER}
    // advisor_code is embedded for per-advisor reporting tracking
    // Updated: 2026-05-23
    // Get advisor code from the logged-in user — only populated for SERVICE_ADVISOR role
    const advisorCode = user?.advisor_code || '';

    // Use the offer's defined code structure if available, otherwise fall back to default
    const codeStructure = selectedOffer?.coupon_code_structure || '';

    // If the offer has a coupon_code_structure defined, use it as the pattern
    // Replace these placeholders in the structure string:
    //   {PREFIX} → couponCodePrefix
    //   {SERIAL} → serialNumber  
    //   {ADVISOR} → advisorCode
    //   {IDENTIFIER} → identifierString
    // If no structure is defined, fall back to existing format with advisor code appended
    let couponCode;
    if (codeStructure) {
      couponCode = codeStructure
        .replace('{PREFIX}', couponCodePrefix)
        .replace('{SERIAL}', serialNumber)
        .replace('{ADVISOR}', advisorCode)
        .replace('{IDENTIFIER}', identifierString);
    } else {
      // Default format — existing format plus advisor code if present
      couponCode = advisorCode
        ? `${serialNumber}_${couponCodePrefix}_${advisorCode}_${identifierString}`
        : `${serialNumber}_${couponCodePrefix}_${identifierString}`;
    }

    // No longer generating image server-side - will use client-side preview
    const couponData = {
      identifier_type: identifierType,
      coupon_code: couponCode,
      plate_number: identifierType === 'PLATE' ? formData.plate_number : '',
      plate_category: identifierType === 'PLATE' ? formData.plate_category : '',
      plate_region: identifierType === 'PLATE' ? formData.plate_region : '',
      mobile_number: identifierType === 'MOBILE' ? formData.mobile_number : '',
      plate_combined_string: identifierString,
      car_model: isLegacyOffer ? formData.car_model : (dynamicFieldValues['CAR_MODEL'] || ''),
      customer_status: selectedOffer?.customer_status || 'NEW',
      offer_id: formData.offer_id,
      offer_title: selectedOffer?.title || '',
      valid_days: parseInt(formData.valid_days),
      issue_date: issueDate,
      expiry_date: expiryDate,
      status: 'ACTIVE',
      template_id: selectedTemplate.id,
      advisor_code: advisorCode,
      created_by_user_id: user?.id,
      // Dynamic variable values from manual offer variables
      ...(!isLegacyOffer && Object.fromEntries(
        manualVariables.map(v => [v.key.toLowerCase(), dynamicFieldValues[v.key] || ''])
      )),
    };

    setGenerationProgress('Creating coupon...');
    const newCoupon = await base44.entities.Coupon.create(couponData);

    setGenerationProgress('Logging activity...');
    await base44.entities.CouponActivityLog.create({
      coupon_id: newCoupon.id,
      action_type: 'CREATED',
      performed_by_user_id: user.id,
      performed_by_user_name: user.full_name,
    });

    setIsGenerating(false);
    setGenerationProgress('');
    setCreatedCoupon(newCoupon);
  };

  if (createdCoupon) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Adjusted success card shadow and border parameters */}
        <Card className="shadow-xl border-0 overflow-hidden">
          {/* Success card header customized with a dark theme background */}
          <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
            <div className="flex items-center gap-3">
              {/* Added customized gold theme colors to success indicator, title, and description */}
              <CheckCircle className="w-8 h-8" style={{ color: '#C9A84C' }} />
              <div>
                <CardTitle className="text-2xl text-white">Coupon Created Successfully!</CardTitle>
                <p className="mt-1 text-sm" style={{ color: '#C9A84C' }}>Your coupon is ready to share</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Coupon Image Preview */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Coupon Image</h3>
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
              <div className="border-2 border-slate-200 rounded-lg overflow-hidden bg-white">
                <CouponPreviewRenderer
                ref={couponPreviewRef}
                templateId={createdCoupon.template_id}
                couponData={{
                  identifier_type: createdCoupon.identifier_type,
                  plate_combined_string: createdCoupon.plate_combined_string,
                  car_model: createdCoupon.car_model,
                  offer_title: createdCoupon.offer_title,
                  issue_date: format(new Date(createdCoupon.issue_date), 'dd-MM-yyyy'),
                  expiry_date: format(new Date(createdCoupon.expiry_date), 'dd-MM-yyyy'),
                  coupon_code: createdCoupon.coupon_code,
                  advisor_name: user?.full_name || '',
                  customer_name: createdCoupon.customer_name || '',
                  branch_name: createdCoupon.branch_name || '',
                }}
                />
                {/* Terms & Conditions */}
                <div className="bg-slate-50 p-4 border-t border-slate-200">
                  <h4 className="font-bold text-slate-900 mb-2">TERMS & CONDITIONS</h4>
                  {selectedOffer?.terms_and_conditions ? (
                    <div 
                      className="text-xs text-slate-700 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-1"
                      dangerouslySetInnerHTML={{ __html: selectedOffer.terms_and_conditions }}
                    />
                  ) : (
                    <ul className="text-xs text-slate-700 space-y-1">
                      <li>• Offer Is Applicable Only For The Mentioned Plate Number</li>
                      <li>• Periodic Service & Body Repair Is Not Included In This Offer</li>
                      <li>• Offer Is Valid Only For The First-Time Visit</li>
                      <li>• Offer Valid Till Mentioned Expiry Date</li>
                      <li>• No Other Offers Applicable With This Offer During The Visit</li>
                      <li>• Offer Is Applicable For Appointment Customers Only</li>
                      <li>• Offer Applicable Only For Labour Charges</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Coupon Details */}
            {/* Added subtle border and soft neutral background style to details container */}
            <div className="rounded-lg p-4 space-y-3 border border-slate-100" style={{ background: '#F8F9FB' }}>
              <h3 className="font-semibold text-slate-900">Coupon Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-600">Coupon Code</p>
                  <p className="font-semibold text-slate-900">{createdCoupon.coupon_code}</p>
                </div>
                <div>
                  <p className="text-slate-600">Expiry Date</p>
                  <p className="font-semibold text-slate-900">
                    {format(new Date(createdCoupon.expiry_date), 'dd-MM-yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-slate-600">Offer</p>
                  <p className="font-semibold text-slate-900">{createdCoupon.offer_title}</p>
                </div>
                <div>
                  <p className="text-slate-600">{createdCoupon.identifier_type === 'MOBILE' ? 'Mobile' : 'Plate'}</p>
                  <p className="font-semibold text-slate-900">{createdCoupon.plate_combined_string}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {/* Action buttons for copying/sharing, opening WhatsApp chat, and creating a new coupon */}
            <div className="flex gap-3">
              {/* Replaced blue styling with solid dark slate theme color */}
              <Button
                onClick={() => markSharedMutation.mutate(createdCoupon.id)}
                disabled={markSharedMutation.isPending}
                className="flex-1 text-white font-medium" style={{ background: '#0D1117' }}
              >
                <Share2 className="w-4 h-4 mr-2" />
                {markSharedMutation.isPending ? 'Marking...' : 'Coupon Shared'}
              </Button>
              {/* WhatsApp direct sharing button */}
              {/* Styled Open WhatsApp button with a richer dark-green gradient background */}
              <Button
                onClick={() => {
                  const number = formData.whatsapp_number.replace(/\D/g, '');
                  if (number) {
                    window.open(`https://wa.me/${number}`, '_blank');
                  } else {
                    toast.error('No WhatsApp number entered.');
                  }
                }}
                className="flex-1 text-white font-medium" style={{ background: 'linear-gradient(135deg, #25a244, #1a7a33)' }}
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Open WhatsApp
              </Button>
              <Button
                variant="outline"
                onClick={() => setCreatedCoupon(null)}
                className="flex-1"
              >
                Create Another
              </Button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              💡 Click "Coupon Shared" after you've sent this coupon to the customer via WhatsApp or other means
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        {/* Adjusted tracking and text sizing on page header for visual balance */}
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Create Coupon</h1>
        <p className="text-slate-500 mt-1 text-sm">Fill in customer details to generate a coupon</p>
      </div>

      {/* Adjusted warning card background color and border style */}
      {templates.length === 0 && (
        <Card className="border border-amber-200 shadow-sm" style={{ background: '#FFFBF0' }}>
          <CardContent className="p-4">
            <p className="text-amber-800">
              ⚠️ No templates available. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Updated card shadow, border, and overflow styling for premium appearance */}
      <Card className="shadow-xl border-0 overflow-hidden">
        {/* Adjusted header background and border for a premium dark layout look */}
        <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
          <CardTitle className="flex items-center gap-2">
            {/* Added custom color to Plus icon and formatted title text */}
            <Plus className="w-5 h-5" style={{ color: '#C9A84C' }} />
            <span className="text-white font-semibold">Coupon Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Offer Selection First */}
            <div className="space-y-4">
              {/* Form section header styled with smaller uppercase tracking text */}
              <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2 text-sm uppercase tracking-wider">Select Offer</h3>
              <div>
                <Label htmlFor="offer">Offer *</Label>
                <Select
                  value={formData.offer_id}
                  onValueChange={(value) => setFormData({ ...formData, offer_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select offer" />
                  </SelectTrigger>
                  <SelectContent>
                    {offers.map((offer) => (
                      <SelectItem key={offer.id} value={offer.id}>
                        {/* Display only offer title, hidden customer status details - updated 2026-06-05 */}
                        {offer.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Updated background styling for the selected offer details block */}
              {selectedOffer && (
                <div className="rounded-lg p-3 border border-slate-200" style={{ background: '#F8F9FB' }}>
                  {/* Customer Type display-only label removed per change request 2026-06-05 */}
                  <p className="text-sm text-slate-700 mt-1">
                    <strong>Default Validity:</strong> {selectedOffer.valid_days} days (can be changed below)
                  </p>
                </div>
              )}
            </div>

            {/* Conditional Fields based on user-selected Identifier Type */}
            {selectedOffer && (
              <>
                {/* Selector allowing user to choose between Plate Number and Mobile Number */}
                <div className="space-y-2">
                  <Label>Identifier Type *</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={identifierType === 'PLATE' ? 'default' : 'outline'}
                      onClick={() => setIdentifierType('PLATE')}
                      className={identifierType === 'PLATE' ? 'flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium' : 'flex-1 border-slate-300'}
                    >
                      Plate Number
                    </Button>
                    <Button
                      type="button"
                      variant={identifierType === 'MOBILE' ? 'default' : 'outline'}
                      onClick={() => setIdentifierType('MOBILE')}
                      className={identifierType === 'MOBILE' ? 'flex-1 bg-slate-800 hover:bg-slate-900 text-white font-medium' : 'flex-1 border-slate-300'}
                    >
                      Mobile Number
                    </Button>
                  </div>
                </div>

                {/* Identifier section — plate or mobile fields based on user selection */}
                {identifierType === 'PLATE' ? (
                  <div className="space-y-4">
                    {/* Form section header styled with smaller uppercase tracking text */}
                    <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2 text-sm uppercase tracking-wider">Vehicle Plate Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Emirate selection field — placed first in the layout */}
                      <div>
                        <Label htmlFor="plate_region">Emirate *</Label>
                        <Select
                          value={formData.plate_region}
                          onValueChange={(value) => setFormData({ ...formData, plate_region: value })}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select emirate" />
                          </SelectTrigger>
                          <SelectContent>
                            {UAE_EMIRATES.map((emirate) => (
                              <SelectItem key={emirate.value} value={emirate.value}>
                                {emirate.value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Category field — accepts 1 to 2 uppercase alphabetic characters only */}
                      <div>
                        <Label htmlFor="plate_category">Category *</Label>
                        <Input
                          id="plate_category"
                          value={formData.plate_category}
                          onChange={(e) => setFormData({ ...formData, plate_category: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
                          placeholder="e.g., A"
                          required
                          maxLength={2}
                        />
                      </div>

                      {/* Plate Number field — accepts numeric characters only (max 5 digits) */}
                      <div>
                        <Label htmlFor="plate_number">Plate Number *</Label>
                        <Input
                          id="plate_number"
                          value={formData.plate_number}
                          onChange={(e) => setFormData({ ...formData, plate_number: e.target.value.replace(/[^0-9]/g, '') })}
                          placeholder="e.g., 12345"
                          required
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Form section header styled with smaller uppercase tracking text */}
                    <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2 text-sm uppercase tracking-wider">Mobile Number (Last 5 Digits)</h3>
                    <div>
                      <Label htmlFor="mobile_number">Last 5 Digits of Mobile *</Label>
                      <Input
                        id="mobile_number"
                        value={formData.mobile_number}
                        onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                        placeholder="e.g., 12345"
                        required
                        pattern="[0-9]{5}"
                        maxLength="5"
                        title="Please enter exactly 5 digits"
                      />
                      <p className="text-xs text-slate-500 mt-1">Enter only the last 5 digits of the mobile number</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Coupon Details */}
            {selectedOffer && (
              <div className="space-y-4">
                {/* Form section header styled with smaller uppercase tracking text */}
                <h3 className="font-semibold text-slate-700 border-b border-slate-100 pb-2 text-sm uppercase tracking-wider">Coupon Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Valid days — always shown */}
                  <div>
                    <Label htmlFor="valid_days">Valid for (days) *</Label>
                    <Input
                      id="valid_days"
                      type="number"
                      value={formData.valid_days}
                      onChange={(e) => setFormData({ ...formData, valid_days: e.target.value })}
                      min="1"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: {selectedOffer.valid_days} days (override if needed)</p>
                  </div>

                  {/* Calculated expiry — always shown */}
                  <div className="flex items-end">
                    <div className="w-full">
                      <Label className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        Calculated Expiry Date
                      </Label>
                      {/* Updated background and border style for calculated expiry box */}
                      <div className="mt-2 px-4 py-2 rounded-lg border border-slate-200" style={{ background: '#F8F9FB' }}>
                        {/* Modified text color class for calculated expiry */}
                        <p className="font-semibold text-slate-800">{calculatedExpiry || 'Set valid days'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic manual variable fields from offer configuration */}
                  {/* Legacy mode: offer has no offer_variables — show car model dropdown using vehicle config */}
                  {isLegacyOffer && (
                    <div>
                      <Label htmlFor="car_model">Car Model *</Label>
                      {vehicleConfig.mode === 'any_brand' ? (
                        <Input
                          id="car_model"
                          value={formData.car_model}
                          onChange={(e) => setFormData({ ...formData, car_model: e.target.value })}
                          placeholder="Enter car model"
                          required
                        />
                      ) : (
                        <Select
                          value={formData.car_model}
                          onValueChange={(value) => setFormData({ ...formData, car_model: value })}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {vehicleConfig.brands.flatMap(brand => 
                              (vehicleConfig.models?.[brand] || []).map(model => (
                                <SelectItem key={`${brand}-${model}`} value={`${brand} ${model}`}>
                                  {brand} {model}
                                </SelectItem>
                              ))
                            )}
                            {vehicleConfig.brands.flatMap(brand => 
                              (vehicleConfig.models?.[brand] || [])
                            ).length === 0 && vehicleConfig.brands.map(brand => (
                              <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {/* Dynamic mode: render manual variables from offer_variables */}
                  {!isLegacyOffer && manualVariables.map((variable) => {
                    // CAR_MODEL gets special treatment using vehicle config
                    if (variable.key === 'CAR_MODEL') {
                      return (
                        <div key={variable.key}>
                          <Label htmlFor={variable.key}>{variable.label} *</Label>
                          {vehicleConfig.mode === 'any_brand' ? (
                            <Input
                              id={variable.key}
                              value={dynamicFieldValues[variable.key] || ''}
                              onChange={(e) => setDynamicFieldValues(prev => ({ ...prev, [variable.key]: e.target.value }))}
                              placeholder="Enter car model"
                            />
                          ) : (
                            <Select
                              value={dynamicFieldValues[variable.key] || ''}
                              onValueChange={(value) => setDynamicFieldValues(prev => ({ ...prev, [variable.key]: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select model" />
                              </SelectTrigger>
                              <SelectContent>
                                {vehicleConfig.brands.flatMap(brand =>
                                  (vehicleConfig.models?.[brand] || []).map(model => (
                                    <SelectItem key={`${brand}-${model}`} value={`${brand} ${model}`}>
                                      {brand} {model}
                                    </SelectItem>
                                  ))
                                )}
                                {vehicleConfig.brands.flatMap(brand =>
                                  (vehicleConfig.models?.[brand] || [])
                                ).length === 0 && vehicleConfig.brands.map(brand => (
                                  <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    }

                    // All other manual variables
                    if (variable.type === 'dropdown' && Array.isArray(variable.options) && variable.options.length > 0) {
                      return (
                        <div key={variable.key}>
                          <Label htmlFor={variable.key}>{variable.label}</Label>
                          <Select
                            value={dynamicFieldValues[variable.key] || ''}
                            onValueChange={(value) => setDynamicFieldValues(prev => ({ ...prev, [variable.key]: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${variable.label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {variable.options.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    }

                    return (
                      <div key={variable.key}>
                        <Label htmlFor={variable.key}>{variable.label}</Label>
                        <Input
                          id={variable.key}
                          type={variable.type === 'number' ? 'number' : 'text'}
                          value={dynamicFieldValues[variable.key] || ''}
                          onChange={(e) => setDynamicFieldValues(prev => ({ ...prev, [variable.key]: e.target.value }))}
                          placeholder={`Enter ${variable.label}`}
                        />
                      </div>
                    );
                  })}

                  {/* Customer WhatsApp input field for frontend-only direct communication */}
                  {/* WhatsApp number — frontend only, never saved to backend */}
                  <div className="md:col-span-2">
                    <Label htmlFor="whatsapp_number">Customer WhatsApp Number</Label>
                    <Input
                      id="whatsapp_number"
                      type="tel"
                      value={formData.whatsapp_number}
                      onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                      placeholder="e.g., 971501234567"
                    />
                    <p className="text-xs text-slate-500 mt-1">Full number with country code. Used to open WhatsApp only — never saved.</p>
                  </div>
                </div>
              </div>
            )}

            {selectedOffer && (
              <div className="flex gap-3 pt-4 border-t">
                {/* Applied linear gradient styling to create a premium button appearance */}
                <Button
                  type="submit"
                  disabled={isGenerating || templates.length === 0}
                  className="flex-1 text-white font-medium" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
                >
                  {isGenerating ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating Coupon...</span>
                      </div>
                      {generationProgress && (
                        <span className="text-xs opacity-80">{generationProgress}</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Generate Coupon
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}