import { CosmeticItem, InspectionData } from './types.js';

export async function checkAuth(): Promise<{ authenticated: boolean; admin?: { id: string; username: string } }> {
  try {
    const res = await fetch('/api/admin/me');
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { authenticated: false };
}

export async function login(username: string, password: string):Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || 'Login failed' };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/admin/logout', { method: 'POST' });
}

export async function fetchAdminItems(): Promise<CosmeticItem[]> {
  const res = await fetch('/api/admin/items');
  if (!res.ok) {
    throw new Error('Failed to load cosmetics items');
  }
  const data = await res.json();
  return data.items || [];
}

export async function uploadTempFiles(files: File[], uploadId?: string | null): Promise<{ uploadId: string; files: any[] }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const url = uploadId ? `/api/admin/upload-temp?uploadId=${encodeURIComponent(uploadId)}` : '/api/admin/upload-temp';
  const res = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Upload failed');
  }

  return await res.json();
}

export async function deleteTempFile(uploadId: string, filename: string): Promise<{ uploadId: string; files: any[] }> {
  const res = await fetch(`/api/admin/upload-temp/${encodeURIComponent(uploadId)}/${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to remove file');
  }

  return await res.json();
}

export async function deleteTempSession(uploadId: string): Promise<void> {
  try {
    await fetch(`/api/admin/upload-temp/${encodeURIComponent(uploadId)}`, {
      method: 'DELETE'
    });
  } catch {}
}

export async function inspectUploadedFiles(uploadId: string): Promise<InspectionData> {
  const res = await fetch('/api/admin/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Inspection failed');
  }

  return await res.json();
}

export async function validateDraft(payload: any): Promise<{ valid: boolean; errors: string[]; manifestPreview: any }> {
  const res = await fetch('/api/admin/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    return {
      valid: false,
      errors: data.errors || [data.message || 'Validation failed'],
      manifestPreview: data.manifestPreview
    };
  }
  return data;
}

export async function buildAndSavePackage(payload: any): Promise<any> {
  const res = await fetch('/api/admin/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Failed to build package');
  }
  return data;
}

export async function publishPackage(id: string): Promise<void> {
  const res = await fetch(`/api/admin/packages/${encodeURIComponent(id)}/publish`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to publish');
  }
}

export async function unpublishPackage(id: string): Promise<void> {
  const res = await fetch(`/api/admin/packages/${encodeURIComponent(id)}/unpublish`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to unpublish');
  }
}

export async function deletePackage(id: string): Promise<void> {
  const res = await fetch(`/api/admin/packages/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to delete');
  }
}

