import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, Eye, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import CouponDetailDialog from '@/components/coupons/CouponDetailDialog';
import { toast } from 'sonner';

export default function MyCoupons() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedCoupon, setSelectedCoupon] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allCoupons = [], isLoading } = useQuery({
    queryKey: ['my-coupons'],
    queryFn: () => base44.entities.Coupon.filter({ is_archived: false }, '-created_date'),
  });

  // Filter to show only coupons created by current user
  const myCoupons = user ? allCoupons.filter(c => c.created_by === user.email) : [];

  const getEffectiveStatus = (coupon) => {
    const today = new Date();
    const expiry = new Date(coupon.expiry_date);
    if (expiry < today && coupon.status === 'ACTIVE') {
      return 'EXPIRED';
    }
    return coupon.status;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'REDEEMED':
        return 'bg-blue-100 text-blue-800';
      case 'EXPIRED':
        return 'bg-red-100 text-red-800';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredCoupons = myCoupons.filter(coupon => {
    const effectiveStatus = getEffectiveStatus(coupon);
    const matchesStatus = statusFilter === 'ALL' || effectiveStatus === statusFilter;
    const matchesSearch = 
      coupon.coupon_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      coupon.plate_combined_string.toLowerCase().includes(searchQuery.toLowerCase()) ||
      coupon.offer_title.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const stats = {
    total: myCoupons.length,
    active: myCoupons.filter(c => getEffectiveStatus(c) === 'ACTIVE').length,
    redeemed: myCoupons.filter(c => c.status === 'REDEEMED').length,
    expired: myCoupons.filter(c => getEffectiveStatus(c) === 'EXPIRED').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        {/* Change 1: Added tracking-tight and updated description font-size and color */}
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Coupons</h1>
        <p className="text-slate-500 mt-1 text-sm">View and manage all coupons you've created</p>
      </div>

      {/* Stats Cards - Change 2 & 3: Updated border, shadow, and text colors */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Total Coupons</p>
              {/* Added tracking-tight */}
              <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Active</p>
              {/* Changed color to gold style, added tracking-tight */}
              <p className="text-3xl font-bold tracking-tight" style={{ color: '#C9A84C' }}>{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Redeemed</p>
              {/* Changed color class, added tracking-tight */}
              <p className="text-3xl font-bold text-slate-700 tracking-tight">{stats.redeemed}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Expired</p>
              {/* Changed color class, added tracking-tight */}
              <p className="text-3xl font-bold text-slate-400 tracking-tight">{stats.expired}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters - Change 4: Updated card border, shadow, and background styles */}
      <Card className="border-0 shadow-sm" style={{ background: '#F8F9FB' }}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search by coupon code, plate number, or offer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="REDEEMED">Redeemed</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coupons List */}
      <Card>
        {/* Change 5: Dark card header style and white border */}
        <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
          <CardTitle className="text-white">
            {filteredCoupons.length} {filteredCoupons.length === 1 ? 'Coupon' : 'Coupons'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCoupons.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No coupons found matching your filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCoupons.map((coupon) => {
                const effectiveStatus = getEffectiveStatus(coupon);
                // Change 6: Updated border-slate-100 class and gold solid left border style
                return (
                  <div
                    key={coupon.id}
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100" style={{ borderLeft: '3px solid #C9A84C' }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-mono font-semibold text-slate-900">{coupon.coupon_code}</p>
                        <Badge className={getStatusColor(effectiveStatus)}>
                          {effectiveStatus}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-slate-600">
                        <div>
                          <span className="font-medium">Plate:</span> {coupon.plate_combined_string}
                        </div>
                        <div>
                          <span className="font-medium">Offer:</span> {coupon.offer_title}
                        </div>
                        <div>
                          <span className="font-medium">Expires:</span> {format(new Date(coupon.expiry_date), 'dd MMM yyyy')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 md:mt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCoupon(coupon)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      {selectedCoupon && (
        <CouponDetailDialog
          coupon={selectedCoupon}
          onClose={() => setSelectedCoupon(null)}
          onUpdateStatus={() => {}}
          onArchive={() => {}}
        />
      )}
    </div>
  );
}