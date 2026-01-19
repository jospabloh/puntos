import Home from './pages/Home';
import Wallet from './pages/Wallet';
import History from './pages/History';
import Offers from './pages/Offers';
import Chat from './pages/Chat';
import MerchantPOS from './pages/MerchantPOS';
import AdminDashboard from './pages/AdminDashboard';
import AdminStores from './pages/AdminStores';
import AdminCustomers from './pages/AdminCustomers';
import AdminAudit from './pages/AdminAudit';
import AdminCampaigns from './pages/AdminCampaigns';
import Profile from './pages/Profile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Wallet": Wallet,
    "History": History,
    "Offers": Offers,
    "Chat": Chat,
    "MerchantPOS": MerchantPOS,
    "AdminDashboard": AdminDashboard,
    "AdminStores": AdminStores,
    "AdminCustomers": AdminCustomers,
    "AdminAudit": AdminAudit,
    "AdminCampaigns": AdminCampaigns,
    "Profile": Profile,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};