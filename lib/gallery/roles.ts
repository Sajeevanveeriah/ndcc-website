import type { AuthRole } from '@/lib/auth/config';

// Roles allowed to manage the gallery (albums, bulk uploads, images) — the
// same set that can write the galleryImages resource in /api/admin/resources.
export const GALLERY_ADMIN_ROLES: AuthRole[] = ['admin', 'president', 'secretary', 'committee'];
