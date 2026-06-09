import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Filter, Download, Eye, Trash2, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { toast } from 'sonner';
import CouponDetailDialog from '../components/coupons/CouponDetailDialog';

export default function AdminCoupons() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [filterOffer, setFilterOffer] = useState('all');
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ current: 0, total: 0 });

  const queryClient = useQueryClient();

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: () => base44.entities.Coupon.filter({ is_archived: false }, '-created_date'),
  });

  const { data: offers = [] } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.list(),
  });

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ couponId, newStatus }) => {
      const coupon = coupons.find(c => c.id === couponId);
      await base44.entities.Coupon.update(couponId, {
        status: newStatus,
        status_updated_by_user_id: currentUser.id,
        status_updated_at: new Date().toISOString(),
      });
      await base44.entities.CouponActivityLog.create({
        coupon_id: couponId,
        action_type: 'STATUS_CHANGED',
        old_status: coupon.status,
        new_status: newStatus,
        performed_by_user_id: currentUser.id,
        performed_by_user_name: currentUser.full_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast.success('Coupon status updated');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (couponId) => {
      await base44.entities.Coupon.update(couponId, { is_archived: true });
      await base44.entities.CouponActivityLog.create({
        coupon_id: couponId,
        action_type: 'ARCHIVED',
        performed_by_user_id: currentUser.id,
        performed_by_user_name: currentUser.full_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast.success('Coupon archived');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (couponId) => {
      // Delete activity logs first
      const logs = await base44.entities.CouponActivityLog.filter({ coupon_id: couponId });
      await Promise.all(logs.map(log => base44.entities.CouponActivityLog.delete(log.id)));
      // Delete coupon
      await base44.entities.Coupon.delete(couponId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      toast.success('Coupon deleted permanently');
    },
    onError: () => {
      toast.error('Failed to delete coupon');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (couponIds) => {
      setBulkDeleteProgress({ current: 0, total: couponIds.length });
      for (let i = 0; i < couponIds.length; i++) {
        setBulkDeleteProgress({ current: i + 1, total: couponIds.length });
        const couponId = couponIds[i];
        const logs = await base44.entities.CouponActivityLog.filter({ coupon_id: couponId });
        await Promise.all(logs.map(log => base44.entities.CouponActivityLog.delete(log.id)));
        await base44.entities.Coupon.delete(couponId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      setSelectedIds([]);
      setBulkDeleteProgress({ current: 0, total: 0 });
      toast.success('Selected coupons deleted');
    },
    onError: () => {
      setBulkDeleteProgress({ current: 0, total: 0 });
      toast.error('Failed to delete some coupons');
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCoupons.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCoupons.map(c => c.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getEffectiveStatus = (coupon) => {
    const today = new Date();
    const expiry = new Date(coupon.expiry_date);
    if (expiry < today && coupon.status === 'ACTIVE') {
      return 'EXPIRED';
    }
    return coupon.status;
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch =
      (coupon.coupon_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (coupon.plate_combined_string || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (coupon.car_model || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const effectiveStatus = getEffectiveStatus(coupon);
    const matchesStatus = filterStatus === 'all' || effectiveStatus === filterStatus;
    const matchesOffer = filterOffer === 'all' || coupon.offer_id === filterOffer;

    return matchesSearch && matchesStatus && matchesOffer;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-700';
      case 'REDEEMED':
        return 'bg-amber-100 text-amber-700';
      case 'EXPIRED':
        return 'bg-red-100 text-red-700';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Coupon Code',
      'Plate',
      'Car Model',
      'Offer',
      'Issue Date',
      'Expiry Date',
      'Status',
      'Created By',
    ];

    const rows = filteredCoupons.map(c => [
      c.coupon_code,
      c.plate_combined_string,
      c.car_model,
      c.offer_title,
      format(new Date(c.issue_date), 'dd-MM-yyyy'),
      format(new Date(c.expiry_date), 'dd-MM-yyyy'),
      getEffectiveStatus(c),
      c.created_by,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coupons_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('Coupons exported to CSV');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {/* Header title text tracking and size styled for high contrast and visual hierarchy */}
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">All Coupons</h1>
          <p className="text-slate-500 mt-1 text-sm">Manage and track all coupons</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button 
              variant="destructive"
              onClick={() => {
                if (confirm(`Are you sure you want to permanently delete ${selectedIds.length} coupon(s)? This cannot be undone.`)) {
                  bulkDeleteMutation.mutate(selectedIds);
                }
              }}
              disabled={bulkDeleteMutation.isPending}
              className="min-w-[160px]"
            >
              {bulkDeleteMutation.isPending ? (
                <div className="flex flex-col items-center gap-1 w-full">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </div>
                  {bulkDeleteProgress.total > 0 && (
                    <span className="text-xs opacity-90">
                      {bulkDeleteProgress.current}/{bulkDeleteProgress.total}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete ({selectedIds.length})
                </>
              )}
            </Button>
          )}
          {/* Export CSV button custom border and text states */}
          <Button onClick={exportToCSV} variant="outline" className="border-slate-300 text-slate-600 hover:bg-slate-50">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      {/* Card wrapper for search and filters with custom shadow and background color */}
      <Card className="border-0 shadow-sm" style={{ background: '#F8F9FB' }}>
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search by coupon code, plate number, or car model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {/* Toggle filters button styling for borders and hover background */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="REDEEMED">Redeemed</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Offer</Label>
                <Select value={filterOffer} onValueChange={setFilterOffer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Offers</SelectItem>
                    {offers.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coupons Table */}
      {/* Coupons table wrapper card with shadow and overflow-hidden */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            /* Loading indicator with customized text size and color */
            <div className="text-center py-12 text-slate-400 text-sm">Loading coupons...</div>
          ) : filteredCoupons.length === 0 ? (
            /* Empty state message with customized text size and color */
            <div className="text-center py-12 text-slate-400 text-sm">
              No coupons found matching your criteria
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                {/* Table Header with dark background, border adjustments, and gray header cell text */}
                <TableHeader style={{ background: '#0D1117' }}>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-12 text-slate-400">
                      <Checkbox 
                        checked={selectedIds.length === filteredCoupons.length && filteredCoupons.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-slate-400">Plate / Model</TableHead>
                    <TableHead className="text-slate-400">Coupon Code</TableHead>
                    <TableHead className="text-slate-400">Offer</TableHead>
                    <TableHead className="text-slate-400">Expiry</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCoupons.map((coupon) => {
                    const effectiveStatus = getEffectiveStatus(coupon);
                    return (
                      /* Row style with hover state and light border color */
                      <TableRow key={coupon.id} className="hover:bg-slate-50 border-slate-100">
                        <TableCell>
                          <Checkbox 
                            checked={selectedIds.includes(coupon.id)}
                            onCheckedChange={() => toggleSelect(coupon.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium font-mono">{coupon.plate_combined_string}</p>
                            <p className="text-xs text-slate-500">{coupon.car_model}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{coupon.coupon_code}</TableCell>
                        <TableCell>{coupon.offer_title}</TableCell>
                        <TableCell>
                          {format(new Date(coupon.expiry_date), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(effectiveStatus)}`}>
                            {effectiveStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedCoupon(coupon)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {/* Delete row action button with neutral state and hover red state */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-slate-300 hover:text-red-600 hover:bg-red-50"
                              onClick={() => {
                                if (confirm('Are you sure you want to permanently delete this coupon? This cannot be undone.')) {
                                  deleteMutation.mutate(coupon.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coupon Detail Dialog */}
      {selectedCoupon && (
        <CouponDetailDialog
          coupon={selectedCoupon}
          onClose={() => setSelectedCoupon(null)}
          onUpdateStatus={(newStatus) => {
            updateStatusMutation.mutate({ couponId: selectedCoupon.id, newStatus });
          }}
          onArchive={() => {
            archiveMutation.mutate(selectedCoupon.id);
            setSelectedCoupon(null);
          }}
        />
      )}
    </div>
  );
}