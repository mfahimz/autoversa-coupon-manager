import AdminDashboard from './pages/AdminDashboard';
import AdminOffers from './pages/AdminOffers';
// AdminBranches and AdminTemplates imports removed per change request 2026-06-03
import AdminCoupons from './pages/AdminCoupons';
import AdminUsers from './pages/AdminUsers';
import VerifyCoupon from './pages/VerifyCoupon';
import CreateCoupon from './pages/CreateCoupon';
// CRE Dashboard Home import removed per change request 2026-06-03
import MyCoupons from './pages/MyCoupons';
import ReportingDashboard from './pages/ReportingDashboard';
import __Layout from './Layout.jsx';


// AdminBranches removed per change request 2026-06-03
// AdminTemplates removed per change request 2026-06-03 — template management moved into AdminOffers
// BulkCreateCoupons removed per change request 2026-05-23
// IntegrationSettings removed per change request 2026-05-23
export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminOffers": AdminOffers,
    // AdminBranches and AdminTemplates page configs removed per change request 2026-06-03
    "AdminCoupons": AdminCoupons,
    "AdminUsers": AdminUsers,
    "VerifyCoupon": VerifyCoupon,
    "CreateCoupon": CreateCoupon,
    // CRE Dashboard Home page config removed per change request 2026-06-03
    "MyCoupons": MyCoupons,
    "ReportingDashboard": ReportingDashboard,
}

export const pagesConfig = {
    mainPage: "AdminDashboard",
    Pages: PAGES,
    Layout: __Layout,
};