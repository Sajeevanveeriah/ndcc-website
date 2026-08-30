type DeletePolicy<Role extends string> = {
  writeRoles: readonly Role[];
  deleteRoles?: readonly Role[];
};

/**
 * Explicit deleteRoles are a strict override. Broad/full-access roles may only
 * fall back to writeRoles when a resource has no narrower delete policy.
 */
export function canDeleteResource<Role extends string>(
  role: Role,
  config: DeletePolicy<Role>,
  hasFullAccess: boolean,
) {
  if (config.deleteRoles) return config.deleteRoles.includes(role);
  return hasFullAccess || config.writeRoles.includes(role);
}
