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
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminAudit": AdminAudit,
    "AdminCampaigns": AdminCampaigns,
    "AdminCustomers": AdminCustomers,
    "AdminDashboard": AdminDashboard,
    "AdminStores": AdminStores,
    "Chat": Chat,
    "History": History,
    "Home": Home,
    "MerchantPOS": MerchantPOS,
    "Offers": Offers,
    "Profile": Profile,
    "Wallet": Wallet,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};