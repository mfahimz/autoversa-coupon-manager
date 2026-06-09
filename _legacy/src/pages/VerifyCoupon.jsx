import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Search, CheckCircle, XCircle, Clock, Ticket, Calendar, User, Phone, Car, MapPin, Tag, Hash } from 'lucide-react';
import { format } from 'date-fns';

export default function VerifyCoupon() {
  const [searchValue, setSearchValue] = useState('');
  const [couponPrefix, setCouponPrefix] = useState('');
  const [searchType, setSearchType] = useState('code');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [detectedOffer, setDetectedOffer] = useState(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.list(),
  });

  const { data: offers = [] } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.list(),
  });

  // Detect offer based on prefix
  React.useEffect(() => {
    if (searchType === 'serial' && couponPrefix.trim()) {
      const matchedTemplate = templates.find(t => t.coupon_code_prefix === couponPrefix);
      if (matchedTemplate && matchedTemplate.offer_id) {
        const matchedOffer = offers.find(o => o.id === matchedTemplate.offer_id);
        setDetectedOffer(matchedOffer || null);
      } else {
        setDetectedOffer(null);
      }
    } else {
      setDetectedOffer(null);
    }
  }, [couponPrefix, searchType, templates, offers]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchValue.trim()) {
      setError('Please enter a search value');
      return;
    }

    if (searchType === 'serial' && !couponPrefix.trim()) {
      setError('Please enter the coupon prefix');
      return;
    }

    setIsSearching(true);
    setError('');
    setResult(null);

    try {
      let coupons = [];
      const searchVal = searchValue.trim();

      if (searchType === 'code') {
        // Search by full coupon code
        coupons = await base44.entities.Coupon.filter({ coupon_code: searchVal.toUpperCase() });
      } else if (searchType === 'serial') {
        // Search by serial number + prefix (case-sensitive)
        const allCoupons = await base44.entities.Coupon.list();
        const serialPadded = searchVal.padStart(4, '0');
        const searchPattern = `${serialPadded}_${couponPrefix}_`;
        coupons = allCoupons.filter(c => c.coupon_code.startsWith(searchPattern));
      } else if (searchType === 'plate') {
        // Search by plate number
        coupons = await base44.entities.Coupon.filter({ plate_combined_string: searchVal.toUpperCase() });
      } else if (searchType === 'mobile') {
        // Search by last 5 digits of mobile
        coupons = await base44.entities.Coupon.filter({ plate_combined_string: searchVal });
      }

      setIsSearching(false);

      if (coupons.length === 0) {
        setError('No coupon found. Please check the search value and try again.');
      } else if (coupons.length === 1) {
        setResult(coupons[0]);
      } else {
        // Multiple results found
        setError(`Found ${coupons.length} coupons. Showing the most recent one.`);
        setResult(coupons[0]);
      }
    } catch (err) {
      setIsSearching(false);
      setError('An error occurred while searching. Please try again.');
      console.error(err);
    }
  };

  const getEffectiveStatus = (coupon) => {
    const today = new Date();
    const expiry = new Date(coupon.expiry_date);
    if (expiry < today && coupon.status === 'ACTIVE') {
      return 'EXPIRED';
    }
    return coupon.status;
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'ACTIVE':
        return { 
          icon: CheckCircle, 
          color: 'text-green-600', 
          bg: 'bg-green-50 border-green-200',
          label: 'Valid & Active',
          message: 'This coupon is valid and can be redeemed.'
        };
      case 'REDEEMED':
        return { 
          icon: CheckCircle, 
          color: 'text-amber-600', 
          bg: 'bg-amber-50 border-amber-200',
          label: 'Already Redeemed',
          message: 'This coupon has already been used.'
        };
      case 'EXPIRED':
        return { 
          icon: Clock, 
          color: 'text-red-600', 
          bg: 'bg-red-50 border-red-200',
          label: 'Expired',
          message: 'This coupon has expired and is no longer valid.'
        };
      case 'CANCELLED':
        return { 
          icon: XCircle, 
          color: 'text-slate-600', 
          bg: 'bg-slate-50 border-slate-200',
          label: 'Cancelled',
          message: 'This coupon has been cancelled.'
        };
      default:
        return { 
          icon: XCircle, 
          color: 'text-slate-600', 
          bg: 'bg-slate-50 border-slate-200',
          label: 'Unknown',
          message: 'Unable to determine coupon status.'
        };
    }
  };

  // Change 1: Updated container background color style
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F0F2F5' }}>
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          {/* Change 2: Replaced bg-gradient classes with a gold linear gradient style */}
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
            <Ticket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Verify Coupon</h1>
          {/* Change 3: Changed text color to text-slate-500 and added text-sm */}
          {/* Change 5: Updated subtitle to refer to Al Maraghi Motors */}
          <p className="text-slate-500 mt-1 text-sm">Al Maraghi Motors</p>
        </div>

        {/* Search Form */}
        {/* Change 4: Replaced shadow-lg and border-2 border-blue-100 with shadow-xl, border-0, overflow-hidden */}
        <Card className="shadow-xl border-0 overflow-hidden">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Search By
                </Label>
                <Select value={searchType} onValueChange={setSearchType}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="code">
                      <div className="flex items-center gap-2">
                        <Ticket className="w-4 h-4" />
                        Full Coupon Code
                      </div>
                    </SelectItem>
                    <SelectItem value="serial">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4" />
                        Serial Number
                      </div>
                    </SelectItem>
                    <SelectItem value="plate">
                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4" />
                        Plate Number
                      </div>
                    </SelectItem>
                    <SelectItem value="mobile">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Last 5 Digits of Mobile
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {searchType === 'serial' && (
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block">
                    Enter Coupon Prefix (case-sensitive)
                  </Label>
                  <Input
                    value={couponPrefix}
                    onChange={(e) => setCouponPrefix(e.target.value)}
                    placeholder="e.g., ALMOFF"
                    className="text-center font-mono text-lg h-12"
                  />
                  {detectedOffer && (
                    <p className="text-sm text-green-600 mt-2">
                      ✓ Detected: {detectedOffer.title}
                    </p>
                  )}
                  {couponPrefix && !detectedOffer && (
                    <p className="text-sm text-amber-600 mt-2">
                      No offer found for this prefix
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  {searchType === 'code' && 'Enter Full Coupon Code'}
                  {searchType === 'serial' && 'Enter Serial Number (4 digits)'}
                  {searchType === 'plate' && 'Enter Plate Number'}
                  {searchType === 'mobile' && 'Enter Last 5 Digits'}
                </Label>
                <Input
                  value={searchValue}
                  onChange={(e) => setSearchValue(searchType === 'code' || searchType === 'plate' ? e.target.value.toUpperCase() : e.target.value)}
                  placeholder={
                    searchType === 'code' ? 'e.g., 0001_ALMOFF_12345' :
                    searchType === 'serial' ? 'e.g., 0001' :
                    searchType === 'plate' ? 'e.g., 12345-DXBA' :
                    'e.g., 34745'
                  }
                  className="text-center font-mono text-lg h-12"
                  maxLength={searchType === 'serial' ? 4 : searchType === 'mobile' ? 5 : undefined}
                />
              </div>
              {/* Change 5: Styled button with gold linear gradient and white text */}
              <Button 
                type="submit" 
                className="w-full h-12 text-white font-medium" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
                disabled={isSearching}
              >
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Verify Coupon
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="border-2 border-red-200 bg-red-50">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center gap-3 text-red-700">
                <XCircle className="w-6 h-6 flex-shrink-0" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && (
          <Card className={`border-2 shadow-lg ${getStatusConfig(getEffectiveStatus(result)).bg}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Coupon Details</CardTitle>
                {(() => {
                  const status = getEffectiveStatus(result);
                  const config = getStatusConfig(status);
                  const Icon = config.icon;
                  return (
                    <div className={`flex items-center gap-2 ${config.color}`}>
                      <Icon className="w-5 h-5" />
                      <span className="font-semibold">{config.label}</span>
                    </div>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Message */}
              <div className={`p-3 rounded-lg ${getStatusConfig(getEffectiveStatus(result)).bg}`}>
                <p className={`text-sm ${getStatusConfig(getEffectiveStatus(result)).color}`}>
                  {getStatusConfig(getEffectiveStatus(result)).message}
                </p>
              </div>

              {/* Coupon Code */}
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-slate-500 mb-1">Coupon Code</p>
                <p className="font-mono font-bold text-slate-900">{result.coupon_code}</p>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <User className="w-3 h-3" />
                    <span className="text-xs">Customer</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">{result.customer_name}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Phone className="w-3 h-3" />
                    <span className="text-xs">Mobile</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">{result.mobile_number}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Car className="w-3 h-3" />
                    <span className="text-xs">Plate</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">{result.plate_combined_string}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <MapPin className="w-3 h-3" />
                    <span className="text-xs">Branch</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">{result.branch_name}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border col-span-2">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Tag className="w-3 h-3" />
                    <span className="text-xs">Offer</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">{result.offer_title}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span className="text-xs">Issue Date</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">
                    {format(new Date(result.issue_date), 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span className="text-xs">Expiry Date</span>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">
                    {format(new Date(result.expiry_date), 'dd MMM yyyy')}
                  </p>
                </div>
              </div>

              {/* Search Another Button */}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setResult(null);
                  setSearchValue('');
                  setCouponPrefix('');
                  setError('');
                }}
              >
                Verify Another Coupon
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Footer - updated copyright year to 2026 and brand name to Al Maraghi Motors */}
        <p className="text-center text-xs text-slate-400">
          © 2026 Al Maraghi Motors
        </p>
      </div>
    </div>
  );
}