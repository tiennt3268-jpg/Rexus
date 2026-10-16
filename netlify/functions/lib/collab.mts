export async function canAccessProject(db: any, ownerUserId: string, project: string, userId: string): Promise<boolean> {
  if (ownerUserId === userId) return true;
  const rows = await db.sql`
    SELECT 1 FROM project_members
    WHERE owner_user_id = ${ownerUserId} AND project = ${project} AND user_id = ${userId}
  `;
  return rows.length > 0;
}

export async function findProjectOwnerAccessibleToUser(db: any, projectName: string, userId: string): Promise<string | null> {
  const ownRows = await db.sql`SELECT owner_id FROM projects WHERE name = ${projectName} AND owner_id = ${userId}`;
  if (ownRows.length) return userId;
  const memberRows = await db.sql`SELECT owner_user_id FROM project_members WHERE project = ${projectName} AND user_id = ${userId}`;
  if (memberRows.length) return memberRows[0].owner_user_id;
  return null;
}
