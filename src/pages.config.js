import Home from './pages/Home';
import Wallet from './pages/Wallet';
import History from './pages/History';
import Offers from './pages/Offers';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Wallet": Wallet,
    "History": History,
    "Offers": Offers,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};