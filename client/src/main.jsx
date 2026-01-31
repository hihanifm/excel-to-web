import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import SessionList from './pages/SessionList';
import SessionCreate from './pages/SessionCreate';
import Compare from './pages/Compare';
import SessionDetail from './pages/SessionDetail';
import ChunkDetail from './pages/ChunkDetail';
import ChunkEditor from './pages/ChunkEditor';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <SessionList /> },
      { path: 'create', element: <SessionCreate /> },
      { path: 'compare', element: <Compare /> },
      { path: 'sessions/:id', element: <SessionDetail /> },
      { path: 'sessions/:id/chunks/:chunkId', element: <ChunkDetail /> },
      { path: 'sessions/:id/chunks/:chunkId/edit', element: <ChunkEditor /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
