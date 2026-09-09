/* utils/userHelpers.js
 * Helpers once provided by the Mongoose User model (virtuals / methods).
 * Icons of behavior:
 *  - defaultRole  → most privileged role (HR_ADMIN > SUPERVISOR > EMPLOYEE)
 *  - toPublic     → safe representation without password/hash/tokens
 */
export const ROLE_PRIORITY = { HR_ADMIN: 0, SUPERVISOR: 1, EMPLOYEE: 2 };

export function defaultRole(roles) {
  if (!roles || roles.length === 0) return 'EMPLOYEE';
  return [...roles].sort(
    (a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99)
  )[0];
}

export function toPublic(user) {
  if (!user) return null;
  return {
    _id:          user.id,
    employeeId:   user.employeeId,
    name:         user.name,
    username:     user.username,
    email:        user.email,
    roles:        user.roles,
    defaultRole:  defaultRole(user.roles),
    gender:       user.gender,
    position:     user.position,
    department:   user.department,
    supervisorId: user.supervisorId,
    status:       user.status,
    createdAt:    user.createdAt,
    updatedAt:    user.updatedAt,
  };
}
