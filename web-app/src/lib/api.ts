// Клієнт до власного бекенда (server/) — Keycloak-сесія в httpOnly-куці,
// тому всі запити йдуть same-origin з credentials.

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export type ProjectMetadata = {
  id: string;
  name: string;
  updated_at: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ── auth ────────────────────────────────────────────────────────────
  loginUrl: '/api/auth/login',

  async me(): Promise<AppUser | null> {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const { user } = (await res.json()) as { user: AppUser | null };
    return user;
  },

  async logout(): Promise<void> {
    await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  // ── projects ────────────────────────────────────────────────────────
  listProjects(): Promise<ProjectMetadata[]> {
    return request('/api/projects');
  },

  createProject(name: string, data: unknown): Promise<ProjectMetadata> {
    return request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, data }),
    });
  },

  getProject(id: string): Promise<{ id: string; name: string; data: unknown }> {
    return request(`/api/projects/${id}`);
  },

  updateProject(id: string, patch: { name?: string; data?: unknown }): Promise<ProjectMetadata> {
    return request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async deleteProject(id: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
  },
};
