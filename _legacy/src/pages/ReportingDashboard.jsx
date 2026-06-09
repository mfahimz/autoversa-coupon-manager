import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  LineChart,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Ticket,
  CheckCircle2,
  XCircle,
  Calendar,
  Download,
  Loader2,
} from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';

export default function ReportingDashboard() {
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedOffer, setSelectedOffer] = useState('all');

  const { data: coupons = [], isLoading: couponsLoading } = useQuery({
    queryKey: ['all-coupons-report'],
    queryFn: () => base44.entities.Coupon.filter({ is_archived: false }),
  });

  const { data: offers = [], isLoading: offersLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.filter({ is_active: true }),
  });

  const getDateRangeFilter = () => {
    const today = new Date();
    switch (dateRange) {
      case 'this_month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'last_month':
        return { start: startOfMonth(subMonths(today, 1)), end: endOfMonth(subMonths(today, 1)) };
      case 'last_3_months':
        return { start: subMonths(today, 3), end: today };
      case 'last_6_months':
        return { start: subMonths(today, 6), end: today };
      case 'custom':
        if (customStartDate && customEndDate) {
          return { start: parseISO(customStartDate), end: parseISO(customEndDate) };
        }
        return null;
      default:
        return null;
    }
  };

  const filteredCoupons = useMemo(() => {
    let filtered = coupons;

    // Filter by offer
    if (selectedOffer !== 'all') {
      filtered = filtered.filter(c => c.offer_id === selectedOffer);
    }

    // Filter by date range
    const dateFilter = getDateRangeFilter();
    if (dateFilter) {
      filtered = filtered.filter(c => {
        const issueDate = parseISO(c.issue_date);
        return isWithinInterval(issueDate, { start: dateFilter.start, end: dateFilter.end });
      });
    }

    return filtered;
  }, [coupons, selectedOffer, dateRange, customStartDate, customEndDate]);

  const getEffectiveStatus = (coupon) => {
    const today = new Date();
    const expiry = new Date(coupon.expiry_date);
    if (expiry < today && coupon.status === 'ACTIVE') {
      return 'EXPIRED';
    }
    return coupon.status;
  };

  const statistics = useMemo(() => {
    const total = filteredCoupons.length;
    const active = filteredCoupons.filter(c => getEffectiveStatus(c) === 'ACTIVE').length;
    const redeemed = filteredCoupons.filter(c => c.status === 'REDEEMED').length;
    const expired = filteredCoupons.filter(c => getEffectiveStatus(c) === 'EXPIRED').length;
    const cancelled = filteredCoupons.filter(c => c.status === 'CANCELLED').length;
    const redemptionRate = total > 0 ? ((redeemed / total) * 100).toFixed(1) : 0;

    return {
      total,
      active,
      redeemed,
      expired,
      cancelled,
      redemptionRate,
    };
  }, [filteredCoupons]);

  const offerPerformance = useMemo(() => {
    const offerStats = {};
    
    filteredCoupons.forEach(coupon => {
      const offerId = coupon.offer_id;
      const offerTitle = coupon.offer_title;
      
      if (!offerStats[offerId]) {
        offerStats[offerId] = {
          name: offerTitle,
          total: 0,
          redeemed: 0,
          active: 0,
          expired: 0,
        };
      }
      
      offerStats[offerId].total++;
      if (coupon.status === 'REDEEMED') offerStats[offerId].redeemed++;
      if (getEffectiveStatus(coupon) === 'ACTIVE') offerStats[offerId].active++;
      if (getEffectiveStatus(coupon) === 'EXPIRED') offerStats[offerId].expired++;
    });

    return Object.values(offerStats).map(stat => ({
      ...stat,
      redemptionRate: stat.total > 0 ? ((stat.redeemed / stat.total) * 100).toFixed(1) : 0,
    }));
  }, [filteredCoupons]);

  const statusDistribution = useMemo(() => {
    return [
      { name: 'Active', value: statistics.active, color: '#10b981' },
      { name: 'Redeemed', value: statistics.redeemed, color: '#f59e0b' },
      { name: 'Expired', value: statistics.expired, color: '#ef4444' },
      { name: 'Cancelled', value: statistics.cancelled, color: '#64748b' },
    ].filter(item => item.value > 0);
  }, [statistics]);

  const monthlyTrend = useMemo(() => {
    const monthlyData = {};
    
    filteredCoupons.forEach(coupon => {
      const monthKey = format(parseISO(coupon.issue_date), 'MMM yyyy');
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthKey, created: 0, redeemed: 0 };
      }
      monthlyData[monthKey].created++;
      if (coupon.status === 'REDEEMED') {
        monthlyData[monthKey].redeemed++;
      }
    });

    return Object.values(monthlyData).sort((a, b) => {
      return parseISO('01 ' + a.month) - parseISO('01 ' + b.month);
    });
  }, [filteredCoupons]);

  const exportReport = () => {
    const headers = [
      'Metric',
      'Value',
    ];

    const rows = [
      ['Total Coupons', statistics.total],
      ['Active Coupons', statistics.active],
      ['Redeemed Coupons', statistics.redeemed],
      ['Expired Coupons', statistics.expired],
      ['Cancelled Coupons', statistics.cancelled],
      ['Redemption Rate', `${statistics.redemptionRate}%`],
      [''],
      ['Offer Performance'],
      ['Offer', 'Total', 'Redeemed', 'Active', 'Expired', 'Redemption Rate'],
      ...offerPerformance.map(o => [o.name, o.total, o.redeemed, o.active, o.expired, `${o.redemptionRate}%`]),
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coupon_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('Report exported successfully');
  };

  const isLoading = couponsLoading || offersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-slate-600">Loading report data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {/* Change 1: Added tracking-tight and updated description text color and size */}
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reporting Dashboard</h1>
          <p className="text-slate-500 mt-1 text-sm">Analytics and insights for coupon performance</p>
        </div>
        {/* Change 2: Added border and hover styling to the export button */}
        <Button onClick={exportReport} variant="outline" className="border-slate-300 text-slate-600 hover:bg-slate-50">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Filters */}
      <Card>
        {/* Change 3: Dark card header style with white border */}
        <CardHeader className="border-b border-white/10" style={{ background: '#0D1117' }}>
          <CardTitle className="text-lg text-white">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                  <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === 'custom' && (
              <>
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <Label>Offer Type</Label>
              <Select value={selectedOffer} onValueChange={setSelectedOffer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Offers</SelectItem>
                  {offers.map(offer => (
                    <SelectItem key={offer.id} value={offer.id}>
                      {offer.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics - Change 4 & 5: Updated icon container background/icon styling and value text colors */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Coupons</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{statistics.total}</p>
              </div>
              {/* Changed background style to gold linear gradient, and icon to white */}
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                <Ticket className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Active Coupons</p>
                {/* Changed text color class to gold inline style */}
                <p className="text-3xl font-bold mt-1" style={{ color: '#C9A84C' }}>{statistics.active}</p>
              </div>
              {/* Changed background style to gold linear gradient, and icon to white */}
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Redeemed</p>
                {/* Changed text color class to slate-700 */}
                <p className="text-3xl font-bold text-slate-700 mt-1">{statistics.redeemed}</p>
              </div>
              {/* Changed background style to gold linear gradient, and icon to white */}
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Redemption Rate</p>
                {/* Changed text color class to gold inline style */}
                <p className="text-3xl font-bold mt-1" style={{ color: '#C9A84C' }}>{statistics.redemptionRate}%</p>
              </div>
              {/* Changed background style to gold linear gradient, and icon to white */}
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          {/* Change 6: Chart card header layout with border and text color */}
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-slate-800">Coupon Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          {/* Change 6: Chart card header layout with border and text color */}
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-slate-800">Monthly Coupon Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="created" stroke="#3b82f6" name="Created" strokeWidth={2} />
                <Line type="monotone" dataKey="redeemed" stroke="#f59e0b" name="Redeemed" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Offer Performance */}
      <Card>
        {/* Change 6: Chart card header layout with border and text color */}
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-slate-800">Offer Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={offerPerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" fill="#3b82f6" name="Total" />
              <Bar dataKey="redeemed" fill="#f59e0b" name="Redeemed" />
              <Bar dataKey="active" fill="#10b981" name="Active" />
              <Bar dataKey="expired" fill="#ef4444" name="Expired" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Offer Table */}
      <Card>
        {/* Change 6: Chart card header layout with border and text color */}
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-slate-800">Detailed Offer Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {/* Change 7: Table header row with white border and dark background */}
                <tr className="border-b border-white/10" style={{ background: '#0D1117' }}>
                  {/* Change 8: Updated header cells text color to text-slate-300 */}
                  <th className="text-left p-3 font-semibold text-slate-300">Offer</th>
                  <th className="text-right p-3 font-semibold text-slate-300">Total</th>
                  <th className="text-right p-3 font-semibold text-slate-300">Redeemed</th>
                  <th className="text-right p-3 font-semibold text-slate-300">Active</th>
                  <th className="text-right p-3 font-semibold text-slate-300">Expired</th>
                  <th className="text-right p-3 font-semibold text-slate-300">Redemption Rate</th>
                </tr>
              </thead>
              <tbody>
                {offerPerformance.map((offer, idx) => (
                  <tr key={idx} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-medium">{offer.name}</td>
                    <td className="text-right p-3">{offer.total}</td>
                    <td className="text-right p-3 text-amber-600 font-medium">{offer.redeemed}</td>
                    <td className="text-right p-3 text-green-600 font-medium">{offer.active}</td>
                    <td className="text-right p-3 text-red-600 font-medium">{offer.expired}</td>
                    <td className="text-right p-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {offer.redemptionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
                {offerPerformance.length === 0 && (
                  <tr>
                    <td colSpan="6" className="text-center p-8 text-slate-500">
                      No data available for the selected filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}