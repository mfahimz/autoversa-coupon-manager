import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { 
  LayoutDashboard, 
  Tag, 
  Ticket, 
  LogOut,
  Menu,
  X,
  Plus,
  User,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NavGroupDropdown from '@/components/layout/NavGroupDropdown';
import MobileNavMenu from '@/components/layout/MobileNavMenu';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userPages, setUserPages] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user) {
      // Load user's page access from database
      base44.entities.UserPageAccess.filter({ user_id: user.id })
        .then(async access => {
          let pages = [];
          if (access.length > 0) {
            pages = access.map(a => a.page_id);
            setUserPages(pages);
          } else {
            // Initialize default access for new users
            const response = await base44.functions.invoke('initializeUserAccess', {});
            if (response.data?.pages) {
              pages = response.data.pages;
              setUserPages(pages);
            }
          }

          // Redirect to default dashboard if on root or no page
          if (pages.length > 0 && (location.pathname === '/' || !currentPageName)) {
            const role = user.user_role || user.role;
            if (role === 'ADMIN' || role === 'admin') {
              navigate(createPageUrl('AdminDashboard'), { replace: true });
            } else if (role === 'SERVICE_ADVISOR') {
              navigate(createPageUrl('VerifyCoupon'), { replace: true });
            } else if (role === 'REPORTING_ANALYST') {
              navigate(createPageUrl('ReportingDashboard'), { replace: true });
            // CRE Dashboard Home redirect logic removed per change request 2026-06-03
            } else {
              // Redirect to first available page
              navigate(createPageUrl(pages[0]), { replace: true });
            }
          }
          })
          .catch(err => {
          console.error('Failed to load user pages:', err);
          // Fallback to all pages for admin
          const role = user.user_role || user.role;
          if (role === 'ADMIN' || role === 'admin') {
            setUserPages(allNavItems.map(item => item.page));
            if (location.pathname === '/' || !currentPageName) {
              navigate(createPageUrl('AdminDashboard'), { replace: true });
            }
          }
          });
          }
          }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  const userRole = user.user_role || user.role; // Fallback to built-in role
  const isAdmin = userRole === 'ADMIN' || userRole === 'admin';
  const isAdminManager = userRole === 'ADMIN_MANAGER';

  // Define nav items with role-based visibility
  const allNavItems = [
    // Dashboards
    { name: 'Dashboard', icon: LayoutDashboard, page: 'AdminDashboard', group: 'Dashboards', adminOnly: false },
    { name: 'Reports & Analytics', icon: LayoutDashboard, page: 'ReportingDashboard', group: 'Dashboards', adminOnly: true, allowMarketing: true },
    // Coupons
    { name: 'Create Coupon', icon: Plus, page: 'CreateCoupon', group: 'Coupons', adminOnly: false },
    { name: 'My Coupons', icon: Ticket, page: 'MyCoupons', group: 'Coupons', adminOnly: false },
    { name: 'All Coupons', icon: Ticket, page: 'AdminCoupons', group: 'Coupons', adminOnly: true, allowMarketing: true },
    { name: 'Verify Coupon', icon: Search, page: 'VerifyCoupon', group: 'Coupons', adminOnly: false },
    // Settings - Admin only
    { name: 'Offers', icon: Tag, page: 'AdminOffers', group: 'Settings', adminOnly: true, allowMarketing: true },
    // AdminBranches and AdminTemplates navigation items removed per change request 2026-06-03
    { name: 'Users', icon: User, page: 'AdminUsers', group: 'Settings', adminOnly: true },
  ];

  // Filter nav items based on user's page access from database
  const navItems = allNavItems.filter(item => {
    // Admins and Admin Managers always have full access to all pages
    if (isAdmin || isAdminManager) return true;

    // Check if user has access via UserPageAccess table
    return userPages.includes(item.page);
  });

  const groups = ['Dashboards', 'Coupons', 'Settings'];

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      {/* Sticky Top Navbar */}
      {/* Header with white background, subtle bottom border and low-intensity shadow */}
      <header
        className="sticky top-0 z-50 w-full h-16 border-b"
        style={{ background: '#ffffff', borderColor: '#E2E6EC', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
      >
        <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* LEFT — Logo + Desktop Nav */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69215f74f427df00082a0a08/f9e5652b0_ALMARAGHILogoLetterstyle1-01.png" 
                alt="Al Maraghi Logo" 
                className="w-10 h-10 object-contain"
              />
              <div>
                {/* Brand title and subtitle indicating Al Maraghi Motors */}
                <h1 className="text-sm font-bold text-slate-900 leading-none">Al Maraghi</h1>
                <p className="text-xs tracking-widest uppercase mt-0.5 text-slate-500">Motors</p>
              </div>
            </div>

            {/* Desktop Navigation Groups */}
            <nav className="hidden lg:flex items-center gap-1">
              {groups.map((group) => (
                <NavGroupDropdown
                  key={group}
                  group={group}
                  items={navItems.filter(item => item.group === group)}
                  currentPageName={currentPageName}
                />
              ))}
            </nav>
          </div>

          {/* RIGHT — User section + Mobile hamburger */}
          <div className="flex items-center gap-3">
            {/* User info */}
            {/* Right-aligned text user information details, removing the avatar circle */}
            <div className="hidden sm:flex items-center gap-1">
              <div className="min-w-0 text-right">
                <p className="text-sm font-medium text-slate-800 truncate leading-none">{user.full_name}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{user.user_role || user.role || 'User'}</p>
              </div>
            </div>

            {/* Logout button configured with standard hover background styling */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => base44.auth.logout()}
              className="text-slate-400 hover:text-red-500 hover:bg-slate-100"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-slate-700 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <MobileNavMenu
            navItems={navItems}
            currentPageName={currentPageName}
            onClose={() => setMobileMenuOpen(false)}
          />
        )}
      </header>

      {/* Main Content */}
      <main className="w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>

        {/* Footer - updated copyright year to 2026 */}
        <footer className="py-6 text-center text-sm text-slate-500">
          © 2026 Al Maraghi Motors. All rights reserved.
        </footer>
      </main>
    </div>
  );
}