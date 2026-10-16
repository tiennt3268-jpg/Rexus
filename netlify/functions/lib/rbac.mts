/* =========================================================
   Role-based access control helpers.

   System roles (on users.role):
     - "System Admin"    full control of the whole system, including
                          creating accounts and assigning roles.
     - "Project Manager" manages the projects/teams assigned to them;
                          can create and assign work within those.
     - "Member"           can only view and act on work assigned to them.

   Per-project roles (on project_members.role) reuse the same labels
   ("Manager" / "Member") to describe what someone can do *within one
   project* they were added to (as opposed to one they own).
   ========================================================= */

export const SYSTEM_ADMIN = "System Admin";
export const PROJECT_MANAGER = "Project Manager";
export const MEMBER = "Member";

export function isSystemAdmin(user: { role?: string } | null | undefined): boolean {
  return !!user && user.role === SYSTEM_ADMIN;
}

export function isManagerOrAdmin(user: { role?: string } | null | undefined): boolean {
  return !!user && (user.role === SYSTEM_ADMIN || user.role === PROJECT_MANAGER);
}

export function serializeUserWithRole(u: any) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    full_name: u.full_name || "",
    avatar: u.avatar || "",
    role: u.role || MEMBER,
    position: u.position || "",
    department: u.department || ""
  };
}

/** Loads the full account row (including role/position/department) for a session user. */
export async function getFullUser(db: any, uid: string) {
  const rows = await db.sql`
    SELECT id, username, email, full_name, avatar, role, position, department
    FROM users WHERE id = ${uid}
  `;
  return rows.length ? rows[0] : null;
}

/**
 * Effective role a user has over a given project:
 *  - "Admin"   system-wide System Admin — full access to everything.
 *  - "Owner"   owns the project outright.
 *  - "Manager" added to the project with the Manager role, or is a
 *              Project Manager who owns/manages the space.
 *  - "Member"  added to the project with the (default) Member role.
 *  - null      no access to this project at all.
 */
export async function getEffectiveProjectRole(
  db: any,
  ownerUserId: string,
  project: string,
  userId: string,
  systemRole?: string
): Promise<"Admin" | "Owner" | "Manager" | "Member" | null> {
  if (systemRole === SYSTEM_ADMIN) return "Admin";
  if (ownerUserId === userId) return "Owner";
  const rows = await db.sql`
    SELECT role FROM project_members
    WHERE owner_user_id = ${ownerUserId} AND project = ${project} AND user_id = ${userId}
  `;
  if (!rows.length) return null;
  return rows[0].role === "Manager" ? "Manager" : "Member";
}

/** True when this effective role can manage the project (create/assign/edit any task in it). */
export function roleCanManage(role: string | null): boolean {
  return role === "Admin" || role === "Owner" || role === "Manager";
}
