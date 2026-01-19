import Home from './pages/Home';
import Wallet from './pages/Wallet';
import History from './pages/History';
import Offers from './pages/Offers';
import Chat from './pages/Chat';
import MerchantPOS from './pages/MerchantPOS';
import AdminDashboard from './pages/AdminDashboard';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Wallet": Wallet,
    "History": History,
    "Offers": Offers,
    "Chat": Chat,
    "MerchantPOS": MerchantPOS,
    "AdminDashboard": AdminDashboard,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};