import { Routes, Route, Link } from 'react-router-dom';
import SessionList from './pages/SessionList';
import SessionCreate from './pages/SessionCreate';
import Compare from './pages/Compare';
import SessionDetail from './pages/SessionDetail';
import ChunkEditor from './pages/ChunkEditor';
import Footer from './components/Footer';

export default function App() {
  return (
    <>
      <main className="app-main">
        <div className="container">
          <nav style={{ marginBottom: '1rem' }}>
            <Link to="/">Sessions</Link>
            {' | '}
            <Link to="/create">Create session</Link>
            {' | '}
            <Link to="/compare">Compare</Link>
          </nav>
          <Routes>
            <Route path="/" element={<SessionList />} />
            <Route path="/create" element={<SessionCreate />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
            <Route path="/sessions/:id/chunks/:chunkIndex/edit" element={<ChunkEditor />} />
          </Routes>
        </div>
      </main>
      <Footer />
    </>
  );
}
