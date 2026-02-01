import { createContext, useState, useContext } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Footer from './components/Footer';
import ThemeToggle from './components/ThemeToggle';

export const ApiStatusContext = createContext(null);

export function useApiStatus() {
  return useContext(ApiStatusContext);
}

export default function App() {
  const [apiStatus, setApiStatus] = useState(null);
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <ApiStatusContext.Provider value={{ apiStatus, setApiStatus }}>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="app-logo">📊 Excel Data Labeller</Link>
          <nav className="app-nav">
            <Link to="/" className={isActive('/') && !location.pathname.startsWith('/create') && !location.pathname.startsWith('/compare') ? 'active' : ''}>PROJECTS</Link>
            <Link to="/compare" className={isActive('/compare') ? 'active' : ''}>COMPARE</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="app-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <Footer />
    </ApiStatusContext.Provider>
  );
}
