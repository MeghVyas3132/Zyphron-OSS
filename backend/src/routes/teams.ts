// ===========================================
// TEAM ROUTES
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.js';
import { createLogger } from '@/lib/logger.js';
import { nanoid } from 'nanoid';
import { TeamRole } from '@prisma/client';

const logger = createLogger('teams');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/).optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']).default('DEVELOPER'),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']),
});

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50) + '-' + nanoid(6);
}

async function checkTeamAccess(
  teamId: string,
  userId: string,
  requiredRoles: TeamRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']
): Promise<{ team: any; member: any } | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where: { userId },
        include: { user: true },
      },
      owner: true,
    },
  });

  if (!team) return null;

  // Owner always has access
  if (team.ownerId === userId) {
    return { team, member: { role: 'OWNER' as TeamRole, userId } };
  }

  const member = team.members[0];
  if (!member || !requiredRoles.includes(member.role)) {
    return null;
  }

  return { team, member };
}

// ===========================================
// ROUTES
// ===========================================

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================
  // LIST USER'S TEAMS
  // ===========================================
  app.get('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const query = querySchema.parse(request.query);

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
          _count: {
            select: { members: true, projects: true },
          },
          members: {
            where: { userId },
            select: { role: true },
          },
        },
      }),
      prisma.team.count({
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { userId } } },
          ],
        },
      }),
    ]);

    // Transform to include user's role in each team
    const teamsWithRole = teams.map((team) => ({
      ...team,
      role: team.ownerId === userId ? 'OWNER' : team.members[0]?.role || 'VIEWER',
      members: undefined, // Remove raw members array
    }));

    return reply.send({
      success: true,
      data: {
        teams: teamsWithRole,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  });

  // ===========================================
  // CREATE TEAM
  // ===========================================
  app.post('/', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const body = createTeamSchema.parse(request.body);

    // Generate slug if not provided
    const slug = body.slug || generateSlug(body.name);

    // Check if slug is already taken
    const existingTeam = await prisma.team.findUnique({
      where: { slug },
    });

    if (existingTeam) {
      return reply.status(400).send({
        success: false,
        error: 'Team slug already exists',
      });
    }

    // Create team with owner as member
    const team = await prisma.team.create({
      data: {
        name: body.name,
        slug,
        description: body.description,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        _count: {
          select: { members: true, projects: true },
        },
      },
    });

    logger.info({ teamId: team.id, userId }, 'Team created');

    return reply.status(201).send({
      success: true,
      data: team,
    });
  });

  // ===========================================
  // GET TEAM DETAILS
  // ===========================================
  app.get('/:teamId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;

    const access = await checkTeamAccess(teamId, userId);
    if (!access) {
      return reply.status(404).send({
        success: false,
        error: 'Team not found or access denied',
      });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { projects: true },
        },
      },
    });

    return reply.send({
      success: true,
      data: {
        ...team,
        role: access.member.role,
      },
    });
  });

  // ===========================================
  // UPDATE TEAM
  // ===========================================
  app.patch('/:teamId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;
    const body = updateTeamSchema.parse(request.body);

    // Only owner and admin can update team
    const access = await checkTeamAccess(teamId, userId, ['OWNER', 'ADMIN']);
    if (!access) {
      return reply.status(403).send({
        success: false,
        error: 'Only team owner or admin can update team settings',
      });
    }

    const team = await prisma.team.update({
      where: { id: teamId },
      data: body,
      include: {
        owner: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        _count: {
          select: { members: true, projects: true },
        },
      },
    });

    logger.info({ teamId, userId }, 'Team updated');

    return reply.send({
      success: true,
      data: team,
    });
  });

  // ===========================================
  // DELETE TEAM
  // ===========================================
  app.delete('/:teamId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;

    // Only owner can delete team
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      return reply.status(404).send({
        success: false,
        error: 'Team not found',
      });
    }

    if (team.ownerId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'Only team owner can delete the team',
      });
    }

    // Check if team has projects
    const projectCount = await prisma.project.count({
      where: { teamId },
    });

    if (projectCount > 0) {
      return reply.status(400).send({
        success: false,
        error: 'Cannot delete team with active projects. Transfer or delete projects first.',
      });
    }

    await prisma.team.delete({
      where: { id: teamId },
    });

    logger.info({ teamId, userId }, 'Team deleted');

    return reply.send({
      success: true,
      message: 'Team deleted successfully',
    });
  });

  // ===========================================
  // LIST TEAM MEMBERS
  // ===========================================
  app.get('/:teamId/members', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;

    const access = await checkTeamAccess(teamId, userId);
    if (!access) {
      return reply.status(404).send({
        success: false,
        error: 'Team not found or access denied',
      });
    }

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Get team owner
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { ownerId: true },
    });

    // Mark owner in the response
    const membersWithOwner = members.map((m) => ({
      ...m,
      isOwner: m.userId === team?.ownerId,
    }));

    return reply.send({
      success: true,
      data: membersWithOwner,
    });
  });

  // ===========================================
  // INVITE MEMBER
  // ===========================================
  app.post('/:teamId/members', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;
    const body = inviteMemberSchema.parse(request.body);

    // Only owner and admin can invite members
    const access = await checkTeamAccess(teamId, userId, ['OWNER', 'ADMIN']);
    if (!access) {
      return reply.status(403).send({
        success: false,
        error: 'Only team owner or admin can invite members',
      });
    }

    // Find user by email
    const invitedUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!invitedUser) {
      return reply.status(404).send({
        success: false,
        error: 'User not found with this email. They need to register first.',
      });
    }

    // Check if user is already a member
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: invitedUser.id,
        },
      },
    });

    if (existingMember) {
      return reply.status(400).send({
        success: false,
        error: 'User is already a member of this team',
      });
    }

    // Prevent adding member as OWNER
    if (body.role === 'OWNER' as any) {
      return reply.status(400).send({
        success: false,
        error: 'Cannot assign OWNER role. Transfer ownership instead.',
      });
    }

    // Add member
    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: invitedUser.id,
        role: body.role as TeamRole,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    logger.info({ teamId, invitedUserId: invitedUser.id, role: body.role }, 'Team member added');

    return reply.status(201).send({
      success: true,
      data: member,
    });
  });

  // ===========================================
  // UPDATE MEMBER ROLE
  // ===========================================
  app.patch('/:teamId/members/:memberId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId, memberId } = request.params;
    const body = updateMemberRoleSchema.parse(request.body);

    // Only owner and admin can update roles
    const access = await checkTeamAccess(teamId, userId, ['OWNER', 'ADMIN']);
    if (!access) {
      return reply.status(403).send({
        success: false,
        error: 'Only team owner or admin can update member roles',
      });
    }

    // Find the member
    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: { team: true },
    });

    if (!member || member.teamId !== teamId) {
      return reply.status(404).send({
        success: false,
        error: 'Member not found in this team',
      });
    }

    // Prevent changing owner's role
    if (member.userId === member.team.ownerId) {
      return reply.status(400).send({
        success: false,
        error: 'Cannot change team owner\'s role. Transfer ownership instead.',
      });
    }

    // Admin cannot change another admin's role
    if (access.member.role === 'ADMIN' && member.role === 'ADMIN') {
      return reply.status(403).send({
        success: false,
        error: 'Admins cannot change other admin\'s roles',
      });
    }

    const updatedMember = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: body.role as TeamRole },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    logger.info({ teamId, memberId, newRole: body.role }, 'Team member role updated');

    return reply.send({
      success: true,
      data: updatedMember,
    });
  });

  // ===========================================
  // REMOVE MEMBER
  // ===========================================
  app.delete('/:teamId/members/:memberId', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string; memberId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId, memberId } = request.params;

    // Find the member
    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: { team: true },
    });

    if (!member || member.teamId !== teamId) {
      return reply.status(404).send({
        success: false,
        error: 'Member not found in this team',
      });
    }

    // Users can remove themselves
    const isSelf = member.userId === userId;
    
    if (!isSelf) {
      // Only owner and admin can remove others
      const access = await checkTeamAccess(teamId, userId, ['OWNER', 'ADMIN']);
      if (!access) {
        return reply.status(403).send({
          success: false,
          error: 'Only team owner or admin can remove members',
        });
      }

      // Prevent removing the owner
      if (member.userId === member.team.ownerId) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot remove team owner. Transfer ownership first.',
        });
      }

      // Admin cannot remove another admin
      if (access.member.role === 'ADMIN' && member.role === 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: 'Admins cannot remove other admins',
        });
      }
    } else {
      // Prevent owner from leaving
      if (member.userId === member.team.ownerId) {
        return reply.status(400).send({
          success: false,
          error: 'Team owner cannot leave. Transfer ownership or delete the team.',
        });
      }
    }

    await prisma.teamMember.delete({
      where: { id: memberId },
    });

    logger.info({ teamId, memberId, removedUserId: member.userId }, 'Team member removed');

    return reply.send({
      success: true,
      message: isSelf ? 'You have left the team' : 'Member removed from team',
    });
  });

  // ===========================================
  // TRANSFER OWNERSHIP
  // ===========================================
  app.post('/:teamId/transfer-ownership', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;
    const { newOwnerId } = z.object({ newOwnerId: z.string().uuid() }).parse(request.body);

    // Only current owner can transfer
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      return reply.status(404).send({
        success: false,
        error: 'Team not found',
      });
    }

    if (team.ownerId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'Only team owner can transfer ownership',
      });
    }

    if (newOwnerId === userId) {
      return reply.status(400).send({
        success: false,
        error: 'You are already the owner',
      });
    }

    // Check if new owner is a team member
    const newOwnerMember = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: newOwnerId,
        },
      },
    });

    if (!newOwnerMember) {
      return reply.status(400).send({
        success: false,
        error: 'New owner must be a member of the team',
      });
    }

    // Transfer ownership in a transaction
    await prisma.$transaction([
      // Update team owner
      prisma.team.update({
        where: { id: teamId },
        data: { ownerId: newOwnerId },
      }),
      // Update new owner's role to OWNER
      prisma.teamMember.update({
        where: { id: newOwnerMember.id },
        data: { role: 'OWNER' },
      }),
      // Downgrade old owner to ADMIN
      prisma.teamMember.updateMany({
        where: { teamId, userId },
        data: { role: 'ADMIN' },
      }),
    ]);

    logger.info({ teamId, oldOwnerId: userId, newOwnerId }, 'Team ownership transferred');

    return reply.send({
      success: true,
      message: 'Ownership transferred successfully',
    });
  });

  // ===========================================
  // GET TEAM PROJECTS
  // ===========================================
  app.get('/:teamId/projects', {
    onRequest: [app.authenticate],
  }, async (request: FastifyRequest<{ Params: { teamId: string } }>, reply: FastifyReply) => {
    const userId = request.user?.id as string;
    const { teamId } = request.params;
    const query = querySchema.parse(request.query);

    const access = await checkTeamAccess(teamId, userId);
    if (!access) {
      return reply.status(404).send({
        success: false,
        error: 'Team not found or access denied',
      });
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { teamId },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { deployments: true },
          },
          deployments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.project.count({ where: { teamId } }),
    ]);

    return reply.send({
      success: true,
      data: {
        projects,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    });
  });

  logger.info('Team routes registered');
}
