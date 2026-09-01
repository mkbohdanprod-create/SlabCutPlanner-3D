/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

/**
 * Демо без входу (01.09): бекенда немає (статичний хостинг → 404 або HTML
 * на /api/auth/me) — `backend: 'absent'`, гейт і кнопка входу зникають.
 * Живий бекенд без сесії (401) — 'present', стіна входу лишається.
 */
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { backend, user, isLoading } = useAuth();
  return <div data-testid="p">{isLoading ? 'loading' : `${backend}:${user ? user.email : 'null'}`}</div>;
}

const respond = (status: number, body: string, contentType: string) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': contentType } })));

describe('AuthProvider.backend', () => {
  it('404 від хостингу → absent', async () => {
    respond(404, 'NOT_FOUND', 'text/plain');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('absent:null'));
  });

  it('HTML замість JSON (SPA-rewrite) → absent', async () => {
    respond(200, '<!doctype html><html></html>', 'text/html');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('absent:null'));
  });

  it('401 від живого бекенда → present, без користувача', async () => {
    respond(401, '{"error":"unauthorized"}', 'application/json');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('present:null'));
  });

  it('сесія є → present з користувачем', async () => {
    respond(200, JSON.stringify({ user: { id: 'u1', email: 'm@viyar.ua', name: 'М' } }), 'application/json');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('present:m@viyar.ua'));
  });

  it('мережа не дійшла (TypeError) → absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('absent:null'));
  });
});
