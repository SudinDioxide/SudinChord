import { Navigate, useRouteError, type RouteObject } from 'react-router';
import { notFound, pageElement, pages } from '@/pageRegistry';
import { AppShell } from '@/shell/AppShell';

function RootErrorBoundary() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div style={{ padding: '60px 24px', textAlign: 'center', color: '#f3f4f6' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Something went wrong</h2>
      <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px' }}>{message}</p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#ff0033',
          color: '#fff',
          border: 'none',
          padding: '8px 20px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Reload Page
      </button>
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      ...pages.map((page) => ({ path: page.path, element: pageElement(page) })),
      { path: notFound.path, element: pageElement(notFound) },
    ],
  },
];
