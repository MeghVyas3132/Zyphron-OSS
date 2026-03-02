import type { Prisma, TeamRole } from '@prisma/client';

export const TEAM_ROLES_READ: TeamRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];
export const TEAM_ROLES_WRITE: TeamRole[] = ['OWNER', 'ADMIN', 'DEVELOPER'];
export const TEAM_ROLES_MANAGE: TeamRole[] = ['OWNER', 'ADMIN'];

export function projectIdentifierFilter(identifier: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { id: identifier },
      { slug: identifier },
      { subdomain: identifier },
    ],
  };
}

export function projectAccessFilter(
  userId: string,
  teamRoles?: TeamRole[]
): Prisma.ProjectWhereInput {
  return {
    OR: [
      { userId },
      {
        team: {
          members: {
            some: {
              userId,
              ...(teamRoles ? { role: { in: teamRoles } } : {}),
            },
          },
        },
      },
    ],
  };
}

export function projectWhereForUser(
  identifier: string,
  userId: string,
  teamRoles?: TeamRole[]
): Prisma.ProjectWhereInput {
  return {
    AND: [
      projectIdentifierFilter(identifier),
      projectAccessFilter(userId, teamRoles),
    ],
  };
}
