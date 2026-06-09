// Dynamic dashboard — renders role-specific view based on logged-in user role
// Roles: ADMIN/ADMIN_MANAGER → admin view | SERVICE_ADVISOR → advisor view | CEO/MANAGER/BRANCH_MANAGER/REPORTING_ANALYST → manager view | MARKETING → marketing view
// Updated: 2026-05-23
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tag, MapPin, FileText, Ticket, TrendingUp, CheckCircle, Clock, AlertTriangle, ArrowRight, Plus, Search, Upload } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: coupons = [], isLoading: couponsLoading } = useQuery({
    queryKey: ['coupons'],
    queryFn: () => base44.entities.Coupon.filter({ is_archived: false }),
  });

  const { data: offers = [] } = useQuery({
    queryKey: ['offers'],
    queryFn: () => base44.entities.Offer.list(),
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => base44.entities.Branch.list(),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.list(),
  });

  const today = new Date();
  const activeCoupons = coupons.filter(c => c.status === 'ACTIVE' && new Date(c.expiry_date) >= today);
  const redeemedCoupons = coupons.filter(c => c.status === 'REDEEMED');
  const expiredCoupons = coupons.filter(c => {
    const expiryDate = new Date(c.expiry_date);
    return expiryDate < today && c.status === 'ACTIVE';
  });

  // Derived variables for SERVICE_ADVISOR VIEW
  const myCoupons = coupons.filter(c => c.created_by === user?.email);
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const advisorActiveCoupons = myCoupons.filter(c => c.status === 'ACTIVE' && new Date(c.expiry_date) >= today);
  const advisorRedeemedCoupons = myCoupons.filter(c => c.status === 'REDEEMED');
  const advisorExpiredCoupons = myCoupons.filter(c => {
    const expiryDate = new Date(c.expiry_date);
    return expiryDate < today && c.status === 'ACTIVE';
  });
  const expiringWithin7Days = myCoupons.filter(c => {
    const expiryDate = new Date(c.expiry_date);
    return c.status === 'ACTIVE' && expiryDate >= today && expiryDate <= sevenDaysFromNow;
  });

  // Derive role
  const userRole = user?.user_role || user?.role;
  const isRecognizedRole = ['ADMIN', 'admin', 'ADMIN_MANAGER', 'SERVICE_ADVISOR', 'CEO', 'MANAGER', 'BRANCH_MANAGER', 'REPORTING_ANALYST', 'MARKETING'].includes(userRole);

  // Loading state / unrecognized role check
  if (!user || !userRole || !isRecognizedRole || couponsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  // 1. ADMIN VIEW
  if (userRole === 'ADMIN' || userRole === 'admin' || userRole === 'ADMIN_MANAGER') {
    const stats = [
      {
        title: 'Total Coupons',
        value: coupons.length,
        icon: Ticket,
        color: 'from-blue-500 to-blue-700',
        bgLight: 'bg-blue-50',
        textColor: 'text-blue-600'
      },
      {
        title: 'Active',
        value: activeCoupons.length,
        icon: TrendingUp,
        color: 'from-emerald-500 to-emerald-700',
        bgLight: 'bg-emerald-50',
        textColor: 'text-emerald-600'
      },
      {
        title: 'Redeemed',
        value: redeemedCoupons.length,
        icon: CheckCircle,
        color: 'from-amber-500 to-amber-700',
        bgLight: 'bg-amber-50',
        textColor: 'text-amber-600'
      },
      {
        title: 'Expired',
        value: expiredCoupons.length,
        icon: Clock,
        color: 'from-red-500 to-red-700',
        bgLight: 'bg-red-50',
        textColor: 'text-red-600'
      },
    ];

    const quickLinks = [
      {
        title: 'Manage Offers',
        description: `${offers.filter(o => o.is_active).length} active offers`,
        icon: Tag,
        color: 'from-purple-500 to-purple-700',
        page: 'AdminOffers'
      },
      {
        title: 'Create Coupon',
        description: 'Generate a new coupon',
        icon: Plus,
        color: 'from-green-500 to-green-700',
        page: 'CreateCoupon'
      },
      {
        title: 'Verify Coupon',
        description: 'Check coupon status',
        icon: Search,
        color: 'from-blue-500 to-blue-700',
        page: 'VerifyCoupon'
      },
      {
        title: 'View All Coupons',
        description: `${coupons.length} total coupons`,
        icon: Ticket,
        color: 'from-amber-500 to-amber-700',
        page: 'AdminCoupons'
      },
    ];

    const recentCoupons = coupons
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);

    return (
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            {/* Added tracking-tight to page header h1 */}
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            {/* Change 6: Updated subtitle to refer to Al Maraghi Motors */}
            <p className="text-slate-500 mt-1">Al Maraghi Motors — Coupon management overview</p>
          </div>
          {/* Added custom linear-gradient background style */}
          <Link
            to={createPageUrl('CreateCoupon')}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
          >
            <Ticket className="w-4 h-4" />
            Create Coupon
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    {/* Added custom linear-gradient background to stat icon container */}
                    <div className="p-2.5 rounded-xl shadow-lg" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {/* Changed stat value text to standard slate-900 */}
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-600 mt-1 font-medium">{stat.title}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Links */}
        <div>
          {/* Changed Quick Access header styling */}
          <h2 className="text-base font-semibold text-slate-700 mb-4 uppercase tracking-wider">Quick Access</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.title}
                  to={createPageUrl(link.page)}
                  className="group"
                >
                  {/* Added custom shadow and gold left border */}
                  <Card className="h-full hover:shadow-lg transition-all duration-200 border-0 bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '3px solid #C9A84C' }}>
                    <CardContent className="p-4 flex items-center gap-3">
                      {/* Set background to dark slate color */}
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow" style={{ background: '#0D1117' }}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 text-sm truncate">{link.title}</h3>
                        <p className="text-xs text-slate-500 truncate">{link.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Coupons */}
        <Card className="border border-slate-200 shadow-sm">
          {/* Added dark header background */}
          <CardHeader className="border-b border-white/10 py-4" style={{ background: '#0D1117' }}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">Recent Coupons</CardTitle>
              {/* Custom text color for View all link */}
              <Link
                to={createPageUrl('AdminCoupons')}
                className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: '#C9A84C' }}
              >
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentCoupons.length === 0 ? (
              <div className="p-12 text-center">
                <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No coupons created yet</p>
                <Link
                  to={createPageUrl('CreateCoupon')}
                  className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:text-blue-800 font-medium text-sm"
                >
                  Create your first coupon <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentCoupons.map((coupon) => {
                  const isExpired = new Date(coupon.expiry_date) < today && coupon.status === 'ACTIVE';
                  const displayStatus = isExpired ? 'EXPIRED' : coupon.status;
                  return (
                    <div key={coupon.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono text-sm font-medium text-slate-900 truncate">{coupon.coupon_code}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                              displayStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                              displayStatus === 'REDEEMED' ? 'bg-amber-100 text-amber-700' :
                              displayStatus === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {displayStatus}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 truncate">
                            {coupon.plate_combined_string} • {coupon.car_model}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{coupon.offer_title}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 flex-shrink-0">
                          <p className="font-medium">{format(new Date(coupon.created_date), 'MMM d')}</p>
                          <p className="text-slate-400">Exp: {format(new Date(coupon.expiry_date), 'MMM d')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. SERVICE ADVISOR VIEW
  if (userRole === 'SERVICE_ADVISOR') {
    const stats = [
      {
        title: 'My Coupons',
        value: myCoupons.length,
        icon: Ticket,
        color: 'from-blue-500 to-blue-700',
        bgLight: 'bg-blue-50',
        textColor: 'text-blue-600'
      },
      {
        title: 'Active',
        value: advisorActiveCoupons.length,
        icon: TrendingUp,
        color: 'from-emerald-500 to-emerald-700',
        bgLight: 'bg-emerald-50',
        textColor: 'text-emerald-600'
      },
      {
        title: 'Redeemed',
        value: advisorRedeemedCoupons.length,
        icon: CheckCircle,
        color: 'from-amber-500 to-amber-700',
        bgLight: 'bg-amber-50',
        textColor: 'text-amber-600'
      },
      {
        title: 'Expired',
        value: advisorExpiredCoupons.length,
        icon: Clock,
        color: 'from-red-500 to-red-700',
        bgLight: 'bg-red-50',
        textColor: 'text-red-600'
      },
    ];

    const quickLinks = [
      {
        title: 'Create Coupon',
        description: 'Generate a new coupon',
        icon: Plus,
        color: 'from-green-500 to-green-700',
        page: 'CreateCoupon'
      },
      {
        title: 'My Coupons',
        description: `${myCoupons.length} coupons created`,
        icon: Ticket,
        color: 'from-blue-500 to-blue-700',
        page: 'MyCoupons'
      },
      {
        title: 'Verify Coupon',
        description: 'Check coupon status',
        icon: Search,
        color: 'from-purple-500 to-purple-700',
        page: 'VerifyCoupon'
      },
    ];

    const recentCoupons = myCoupons
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);

    return (
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            {/* Added tracking-tight to page header h1 */}
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Dashboard</h1>
            <p className="text-slate-500 mt-1">Welcome back, {user?.full_name}</p>
          </div>
          {/* Added custom linear-gradient background style */}
          <Link
            to={createPageUrl('CreateCoupon')}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
          >
            <Plus className="w-4 h-4" />
            Create Coupon
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    {/* Added custom linear-gradient background to stat icon container */}
                    <div className="p-2.5 rounded-xl shadow-lg" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {/* Changed stat value text to standard slate-900 */}
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-600 mt-1 font-medium">{stat.title}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Links */}
        <div>
          {/* Changed Quick Actions header styling */}
          <h2 className="text-base font-semibold text-slate-700 mb-4 uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.title}
                  to={createPageUrl(link.page)}
                  className="group"
                >
                  {/* Added custom shadow and gold left border */}
                  <Card className="h-full hover:shadow-lg transition-all duration-200 border-0 bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '3px solid #C9A84C' }}>
                    <CardContent className="p-4 flex items-center gap-3">
                      {/* Set background to dark slate color (w-12 h-12 size) */}
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow" style={{ background: '#0D1117' }}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">{link.title}</h3>
                        <p className="text-sm text-slate-500">{link.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Expiring Soon */}
        {/* Changed to borderless card with standard shadow */}
        {expiringWithin7Days.length > 0 && (
          <Card className="shadow-md border-0 overflow-hidden">
            {/* Dark background header with white/10 border */}
            <CardHeader className="border-b border-white/10 py-4" style={{ background: '#0D1117' }}>
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                {/* Icon with gold style color */}
                <AlertTriangle className="w-5 h-5" style={{ color: '#C9A84C' }} />
                Expiring Within 7 Days ({expiringWithin7Days.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-amber-200">
                {/* Changed row hover color to slate-50 */}
                {expiringWithin7Days
                  .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
                  .map((coupon) => (
                    <div key={coupon.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-medium text-slate-900 truncate">{coupon.coupon_code}</p>
                          <p className="text-sm text-slate-600 truncate">
                            {coupon.plate_combined_string} • {coupon.car_model}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {/* Expiry text with gold color */}
                          <p className="text-sm font-semibold" style={{ color: '#C9A84C' }}>
                            Expires {format(new Date(coupon.expiry_date), 'MMM d')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Coupons */}
        <Card className="border border-slate-200 shadow-sm">
          {/* Added dark header background */}
          <CardHeader className="border-b border-white/10 py-4" style={{ background: '#0D1117' }}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">My Recent Coupons</CardTitle>
              {/* Custom text color for View all link */}
              <Link
                to={createPageUrl('MyCoupons')}
                className="inline-flex items-center gap-1 text-sm font-medium" style={{ color: '#C9A84C' }}
              >
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentCoupons.length === 0 ? (
              <div className="p-12 text-center">
                <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No coupons created yet</p>
                <Link
                  to={createPageUrl('CreateCoupon')}
                  className="inline-flex items-center gap-2 mt-4 text-green-600 hover:text-green-800 font-medium text-sm"
                >
                  Create your first coupon <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentCoupons.map((coupon) => {
                  const isExpired = new Date(coupon.expiry_date) < today && coupon.status === 'ACTIVE';
                  const displayStatus = isExpired ? 'EXPIRED' : coupon.status;
                  return (
                    <div key={coupon.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono text-sm font-medium text-slate-900 truncate">{coupon.coupon_code}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                              displayStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                              displayStatus === 'REDEEMED' ? 'bg-amber-100 text-amber-700' :
                              displayStatus === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {displayStatus}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 truncate">
                            {coupon.plate_combined_string} • {coupon.car_model}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{coupon.offer_title}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 flex-shrink-0">
                          <p className="font-medium">{format(new Date(coupon.created_date), 'MMM d')}</p>
                          <p className="text-slate-400">Exp: {format(new Date(coupon.expiry_date), 'MMM d')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. MANAGER VIEW
  if (userRole === 'CEO' || userRole === 'MANAGER' || userRole === 'BRANCH_MANAGER' || userRole === 'REPORTING_ANALYST') {
    const stats = [
      {
        title: 'Total Coupons',
        value: coupons.length,
        icon: Ticket,
        color: 'from-blue-500 to-blue-700',
        bgLight: 'bg-blue-50',
        textColor: 'text-blue-600'
      },
      {
        title: 'Active',
        value: activeCoupons.length,
        icon: TrendingUp,
        color: 'from-emerald-500 to-emerald-700',
        bgLight: 'bg-emerald-50',
        textColor: 'text-emerald-600'
      },
      {
        title: 'Redeemed',
        value: redeemedCoupons.length,
        icon: CheckCircle,
        color: 'from-amber-500 to-amber-700',
        bgLight: 'bg-amber-50',
        textColor: 'text-amber-600'
      },
      {
        title: 'Expired',
        value: expiredCoupons.length,
        icon: Clock,
        color: 'from-red-500 to-red-700',
        bgLight: 'bg-red-50',
        textColor: 'text-red-600'
      },
    ];

    const recentCoupons = coupons
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);

    return (
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            {/* Added tracking-tight to page header h1 */}
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            {/* Change 6: Updated subtitle to refer to Al Maraghi Motors */}
            <p className="text-slate-500 mt-1">Al Maraghi Motors — Coupon management overview</p>
          </div>
          {/* Added custom linear-gradient background style */}
          <Link
            to={createPageUrl('ReportingDashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
          >
            <TrendingUp className="w-4 h-4" />
            View Full Report
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    {/* Added custom linear-gradient background to stat icon container */}
                    <div className="p-2.5 rounded-xl shadow-lg" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {/* Changed stat value text to standard slate-900 */}
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-600 mt-1 font-medium">{stat.title}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Coupons */}
        <Card className="border border-slate-200 shadow-sm">
          {/* Added dark header background */}
          <CardHeader className="border-b border-white/10 py-4" style={{ background: '#0D1117' }}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">Recent Coupons</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentCoupons.length === 0 ? (
              <div className="p-12 text-center">
                <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No coupons created yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentCoupons.map((coupon) => {
                  const isExpired = new Date(coupon.expiry_date) < today && coupon.status === 'ACTIVE';
                  const displayStatus = isExpired ? 'EXPIRED' : coupon.status;
                  return (
                    <div key={coupon.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono text-sm font-medium text-slate-900 truncate">{coupon.coupon_code}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                              displayStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                              displayStatus === 'REDEEMED' ? 'bg-amber-100 text-amber-700' :
                              displayStatus === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {displayStatus}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 truncate">
                            {coupon.plate_combined_string} • {coupon.car_model}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{coupon.offer_title}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 flex-shrink-0">
                          <p className="font-medium">{format(new Date(coupon.created_date), 'MMM d')}</p>
                          <p className="text-slate-400">Exp: {format(new Date(coupon.expiry_date), 'MMM d')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 4. MARKETING VIEW
  if (userRole === 'MARKETING') {
    const stats = [
      {
        title: 'Total Coupons',
        value: coupons.length,
        icon: Ticket,
        color: 'from-blue-500 to-blue-700',
        bgLight: 'bg-blue-50',
        textColor: 'text-blue-600'
      },
      {
        title: 'Active',
        value: activeCoupons.length,
        icon: TrendingUp,
        color: 'from-emerald-500 to-emerald-700',
        bgLight: 'bg-emerald-50',
        textColor: 'text-emerald-600'
      },
    ];

    const recentCoupons = coupons
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);

    return (
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            {/* Added tracking-tight to page header h1 */}
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            {/* Change 6: Updated subtitle to refer to Al Maraghi Motors */}
            <p className="text-slate-500 mt-1">Al Maraghi Motors — Coupon management overview</p>
          </div>
          {/* Added custom linear-gradient background style */}
          <Link
            to={createPageUrl('CreateCoupon')}
            className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}
          >
            <Ticket className="w-4 h-4" />
            Create Coupon
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    {/* Added custom linear-gradient background to stat icon container */}
                    <div className="p-2.5 rounded-xl shadow-lg" style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)' }}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  {/* Changed stat value text to standard slate-900 */}
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-600 mt-1 font-medium">{stat.title}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Coupons */}
        <Card className="border border-slate-200 shadow-sm">
          {/* Added dark header background */}
          <CardHeader className="border-b border-white/10 py-4" style={{ background: '#0D1117' }}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-white">Recent Coupons</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentCoupons.length === 0 ? (
              <div className="p-12 text-center">
                <Ticket className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No coupons created yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentCoupons.map((coupon) => {
                  const isExpired = new Date(coupon.expiry_date) < today && coupon.status === 'ACTIVE';
                  const displayStatus = isExpired ? 'EXPIRED' : coupon.status;
                  return (
                    <div key={coupon.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-mono text-sm font-medium text-slate-900 truncate">{coupon.coupon_code}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                              displayStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                              displayStatus === 'REDEEMED' ? 'bg-amber-100 text-amber-700' :
                              displayStatus === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {displayStatus}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 truncate">
                            {coupon.plate_combined_string} • {coupon.car_model}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{coupon.offer_title}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 flex-shrink-0">
                          <p className="font-medium">{format(new Date(coupon.created_date), 'MMM d')}</p>
                          <p className="text-slate-400">Exp: {format(new Date(coupon.expiry_date), 'MMM d')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unrecognized role fallback loading spinner
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-pulse text-slate-400">Loading dashboard...</div>
    </div>
  );
}