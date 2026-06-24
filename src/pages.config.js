/**
 * pages.config.js - Page routing configuration
 *
 * This file is AUTO-GENERATED in spirit. Pages are registered here and routed by
 * src/App.jsx. THE ONLY HAND-TUNED VALUE is `mainPage` (the landing page).
 */
import AdminAudit from './pages/AdminAudit';
import AdminCampaigns from './pages/AdminCampaigns';
import AdminCustomers from './pages/AdminCustomers';
import AdminDashboard from './pages/AdminDashboard';
import AdminStores from './pages/AdminStores';
import Chat from './pages/Chat';
import History from './pages/History';
import Home from './pages/Home';
import MerchantPOS from './pages/MerchantPOS';
import Offers from './pages/Offers';
import Profile from './pages/Profile';
import Wallet from './pages/Wallet';
import Onboarding from './pages/Onboarding';
import Permissions from './pages/Permissions';
import PlatformDashboard from './pages/PlatformDashboard';
import PlatformTenants from './pages/PlatformTenants';
import PlatformLicenses from './pages/PlatformLicenses';
import PlatformSupport from './pages/PlatformSupport';
import BusinessSettings from './pages/BusinessSettings';
import BusinessUsers from './pages/BusinessUsers';
import BusinessBilling from './pages/BusinessBilling';
import BusinessSupport from './pages/BusinessSupport';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Wallet": Wallet,
    "Offers": Offers,
    "History": History,
    "Chat": Chat,
    "Profile": Profile,
    "Onboarding": Onboarding,
    "Permissions": Permissions,
    "MerchantPOS": MerchantPOS,
    "AdminDashboard": AdminDashboard,
    "AdminStores": AdminStores,
    "AdminCampaigns": AdminCampaigns,
    "AdminCustomers": AdminCustomers,
    "AdminAudit": AdminAudit,
    "PlatformDashboard": PlatformDashboard,
    "PlatformTenants": PlatformTenants,
    "PlatformLicenses": PlatformLicenses,
    "PlatformSupport": PlatformSupport,
    "BusinessSettings": BusinessSettings,
    "BusinessUsers": BusinessUsers,
    "BusinessBilling": BusinessBilling,
    "BusinessSupport": BusinessSupport,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
