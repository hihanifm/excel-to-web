import { createContext, useState, useContext } from 'react';
import { Outlet, Link } from 'react-router-dom';
import Footer from './components/Footer';

export const ApiStatusContext = createContext(null);

export function useApiStatus() {
  return useContext(ApiStatusContext);
}

export default function App() {
  const [apiStatus, setApiStatus] = useState(null);

  return (
    <ApiStatusContext.Provider value={{ apiStatus, setApiStatus }}>
      <main className="app-main">
        <div className="container">
          <nav style={{ marginBottom: '1rem' }}>
            <Link to="/">Sessions</Link>
            {' | '}
            <Link to="/create">Create session</Link>
            {' | '}
            <Link to="/compare">Compare</Link>
          </nav>
          <Outlet />
        </div>
      </main>
      <Footer />
    </ApiStatusContext.Provider>
  );
}
