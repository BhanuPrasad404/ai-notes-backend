const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createActivity } = require('./activityController');
const logger = require('../utils/logger'); // Add this line

const canEditNote = async (userId, taskId) => {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      OR: [
        { userId },
        {
          sharedNotes: {
            some: {
              sharedWithUserId: userId,
              permission: 'EDIT'
            }
          }
        }
      ]
    }
  });
  return !!note;
};

// Create a new task
const createTask = async (req, res) => {
  try {
    const { title, description, deadline, status = 'TODO', urgency = 'MEDIUM', projectId } = req.body;
    const userId = req.user.id;

    logger.debug('Creating new task', {
      userId,
      titleLength: title?.length,
      descriptionLength: description?.length,
      deadline: !!deadline,
      status,
      urgency,
      projectId: projectId || 'none'
    });

    // Validation
    if (!title) {
      logger.warn('Create task failed - title required', { userId });
      return res.status(400).json({ error: 'Title is required' });
    }
    const validUrgencies = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    if (!validUrgencies.includes(urgency)) {
      logger.warn('Create task failed - invalid urgency', { userId, urgency });
      return res.status(400).json({ error: 'Invalid urgency level' });
    }
    // Validate status
    const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
    if (!validStatuses.includes(status)) {
      logger.warn('Create task failed - invalid status', { userId, status });
      return res.status(400).json({ error: 'Invalid status' });
    }
    // Parse deadline if provided
    let deadlineDate = null;
    if (deadline) {
      deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        logger.warn('Create task failed - invalid deadline format', { userId, deadline });
        return res.status(400).json({ error: 'Invalid deadline format' });
      }
    }
    // Create task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        deadline: deadlineDate,
        status,
        urgency,
        userId,
        projectId: projectId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
    });

    logger.info('Task created successfully', {
      userId,
      taskId: task.id,
      title: task.title,
      status: task.status,
      urgency: task.urgency
    });

    res.status(201).json({
      message: 'Task created successfully',
      task,
    });

  } catch (error) {
    logger.error('Create task operation failed', error, {
      userId: req.user?.id,
      title: req.body?.title,
      status: req.body?.status
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all tasks for user with filters
const getTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status,
      search,
      projectId,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    logger.debug('Fetching tasks with filters', {
      userId,
      status: status || 'all',
      search: search || 'none',
      projectId: projectId || 'all',
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    });

    let where = { userId };
    // Filter by status
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (projectId && projectId !== 'ALL') {
      if (projectId === 'NO_PROJECT') {
        where.projectId = null;
      } else {
        where.projectId = projectId;
      }
    }
    // Search functionality
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    // Validate sort parameters
    const validSortFields = ['createdAt', 'updatedAt', 'deadline', 'title'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    const tasks = await prisma.task.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
      orderBy: { [sortField]: order },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.task.count({ where });
    // Get tasks statistics
    const stats = await prisma.task.groupBy({
      by: ['status'],
      where: { userId },
      _count: {
        status: true,
      },
    });
    const sharedWithMeCount = await prisma.sharedTask.count({
      where: { sharedWithUserId: userId }
    });
    const sharedByMeCount = await prisma.sharedTask.count({
      where: {
        task: { userId: userId }
      }
    });

    logger.info('Tasks retrieved successfully', {
      userId,
      taskCount: tasks.length,
      totalCount: total,
      sharedWithMeCount,
      sharedByMeCount
    });

    res.json({
      tasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        hasMore: (page * limit) < total
      },
      stats: {
        TODO: stats.find(s => s.status === 'TODO')?._count?.status || 0,
        IN_PROGRESS: stats.find(s => s.status === 'IN_PROGRESS')?._count?.status || 0,
        DONE: stats.find(s => s.status === 'DONE')?._count?.status || 0,
        total,
        sharedWithMeCount,
        sharedByMeCount
      },
    });
  } catch (error) {
    logger.error('Get tasks operation failed', error, {
      userId: req.user?.id,
      status: req.query?.status,
      search: req.query?.search
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single task
const getTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.debug('Fetching single task', { userId, taskId: id });

    const task = await prisma.task.findFirst({
      where: {
        id,
        OR: [
          { userId }, // User is owner
          {
            sharedTasks: {
              some: {
                sharedWithUserId: userId // User has sharing access
              }
            }
          }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        sharedTasks: {
          where: {
            sharedWithUserId: userId
          },
          select: {
            permission: true,
            sharedAt: true
          }
        }
      },
    });
    if (!task) {
      logger.warn('Get task failed - not found or access denied', { userId, taskId: id });
      return res.status(404).json({ error: 'Task not found' });
    }

    logger.info('Single task retrieved successfully', { userId, taskId: id, title: task.title });

    res.json({ task });

  } catch (error) {
    logger.error('Get task operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, deadline, status, urgency } = req.body;
    const userId = req.user.id;

    logger.debug('Updating task', {
      userId,
      taskId: id,
      titleProvided: !!title,
      descriptionProvided: description !== undefined,
      deadlineProvided: deadline !== undefined,
      status,
      urgency
    });

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: {
        id,
        OR: [
          { userId },
          {
            sharedTasks: {
              some: {
                sharedWithUserId: userId
              }
            }
          }
        ]
      },
    });

    if (!existingTask) {
      logger.warn('Update task failed - not found or no permission', { userId, taskId: id });
      return res.status(404).json({ error: 'Task not found or you do not have permission' });
    }
    if (urgency) {
      const validUrgencies = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      if (!validUrgencies.includes(urgency)) {
        logger.warn('Update task failed - invalid urgency', { userId, taskId: id, urgency });
        return res.status(400).json({ error: 'Invalid urgency level' });
      }
    }
    // Validate status if provided
    if (status) {
      const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
      if (!validStatuses.includes(status)) {
        logger.warn('Update task failed - invalid status', { userId, taskId: id, status });
        return res.status(400).json({ error: 'Invalid status' });
      }
    }
    // Parse deadline if provided
    let deadlineDate = existingTask.deadline;
    if (deadline !== undefined) {
      deadlineDate = deadline ? new Date(deadline) : null;
      if (deadline && isNaN(deadlineDate.getTime())) {
        logger.warn('Update task failed - invalid deadline format', { userId, taskId: id, deadline });
        return res.status(400).json({ error: 'Invalid deadline format' });
      }
    }
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(deadline !== undefined && { deadline: deadlineDate }),
        ...(status && { status }),
        ...(urgency && { urgency }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      },
    });
    // Notify everyone except the changer
    if (status && status !== existingTask.status) {
      try {
        // Get ALL users who have access to this task (owner + shared users)
        const taskWithAccess = await prisma.task.findUnique({
          where: { id },
          select: {
            userId: true, // Task owner
            sharedTasks: {
              select: {
                sharedWithUserId: true
              }
            }
          }
        });

        if (taskWithAccess) {
          // Combine owner and shared users into a single array
          const allUsersWithAccess = [
            taskWithAccess.userId, // Add task owner ID directly
            ...taskWithAccess.sharedTasks.map(st => st.sharedWithUserId) // Add shared user IDs
          ];

          const usersToNotify = allUsersWithAccess
            .filter(userIdWithAccess => userIdWithAccess !== userId);

          const uniqueUsersToNotify = [...new Set(usersToNotify)];

          // Create activities for everyone else
          if (uniqueUsersToNotify.length > 0) {
            const activityPromises = uniqueUsersToNotify.map(targetUserId =>
              createActivity({
                userId: targetUserId,
                type: 'TASK_STATUS_CHANGED',
                actorId: userId,
                actorName: req.user.name,
                targetType: 'TASK',
                targetId: id,
                targetTitle: updatedTask.title,
                message: `${req.user.name} changed task "${updatedTask.title}" from ${existingTask.status} to ${status}`,
                metadata: {
                  previousStatus: existingTask.status,
                  newStatus: status,
                  changedById: userId,
                  changedByName: req.user.name
                }
              })
            );
            const activities = await Promise.all(activityPromises);
            const io = require('../lib/socketIO').getIO();


            activities.forEach((activity, index) => {
              const targetUserId = uniqueUsersToNotify[index];
              if (activity && targetUserId) {
                io.to(`user-${targetUserId}`).emit('new-notification', {
                  type: 'TASK_STATUS_CHANGED',
                  activity: activity,
                  message: `${req.user.name} changed task "${updatedTask.title}" from ${existingTask.status} to ${status}`,
                  timestamp: new Date().toISOString()
                });

                logger.debug('Status change socket notification sent', {
                  toUserId: targetUserId,
                  taskId: id,
                  fromStatus: existingTask.status,
                  toStatus: status
                });
              }
            });

            logger.info('Activity notifications created and socket events sent', {
              taskId: id,
              notificationCount: activities.length,
              fromStatus: existingTask.status,
              toStatus: status
            });
            logger.info('Activity notifications created', {
              taskId: id,
              notificationCount: activityPromises.length,
              fromStatus: existingTask.status,
              toStatus: status
            });
          } else {
            logger.debug('No users to notify for task status change', { taskId: id });
          }
        }

      } catch (error) {
        logger.error('Activity creation failed during task update', error, { taskId: id });
      }
    }

    logger.info('Task updated successfully', {
      userId,
      taskId: id,
      title: updatedTask.title,
      statusChanged: status && status !== existingTask.status
    });

    res.json({
      message: 'Task updated successfully',
      task: updatedTask,
    });
  } catch (error) {
    logger.error('Update task operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.id,
      status: req.body?.status
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getTaskAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.debug('Fetching task analytics', { userId });

    // Get ALL tasks user has access to (own + shared with me)
    const allTasks = await prisma.task.findMany({
      where: {
        OR: [
          { userId }, // User's own tasks
          {
            sharedTasks: {
              some: { sharedWithUserId: userId }
            }
          } // Tasks shared with user
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true
          }
        },
        sharedTasks: {
          where: { sharedWithUserId: userId },
          select: { permission: true, sharedAt: true }
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true
          }
        }
      }
    });
    // Calculate analytics
    const now = new Date();
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(task => task.status === 'DONE').length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    // Overdue tasks
    const overdueTasks = allTasks.filter(task => {
      if (!task.deadline || task.status === 'DONE') return false;
      return new Date(task.deadline) < now;
    }).length;
    // Average completion time
    const doneTasks = allTasks.filter(task => task.status === 'DONE');
    const averageCompletionTime = doneTasks.length > 0
      ? doneTasks.reduce((acc, task) => {
        const created = new Date(task.createdAt);
        const updated = new Date(task.updatedAt);
        return acc + (updated.getTime() - created.getTime());
      }, 0) / doneTasks.length / (1000 * 60 * 60 * 24)
      : 0;
    // Status distribution
    const statusDistribution = {
      TODO: allTasks.filter(task => task.status === 'TODO').length,
      IN_PROGRESS: allTasks.filter(task => task.status === 'IN_PROGRESS').length,
      DONE: completedTasks
    };
    // Task ownership
    const taskOwnership = {
      myTasks: allTasks.filter(task => task.userId === userId).length,
      sharedWithMe: allTasks.filter(task =>
        task.sharedTasks && task.sharedTasks.length > 0
      ).length
    };
    // Priority breakdown
    const priorityBreakdown = {
      urgent: allTasks.filter(task => {
        if (!task.deadline || task.status === 'DONE') return false;
        const dueDate = new Date(task.deadline);
        const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 1;
      }).length,
      high: allTasks.filter(task => {
        if (!task.deadline || task.status === 'DONE') return false;
        const dueDate = new Date(task.deadline);
        const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays > 1 && diffDays <= 3;
      }).length,
      medium: allTasks.filter(task => {
        if (!task.deadline || task.status === 'DONE') return false;
        const dueDate = new Date(task.deadline);
        const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays > 3 && diffDays <= 7;
      }).length,
      low: allTasks.filter(task => !task.deadline || task.status === 'DONE').length
    };
    // Weekly trend (last 7 days)
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - i));
      return date;
    });
    const weeklyTrend = last7Days.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      return {
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        created: allTasks.filter(task =>
          task.createdAt.toISOString().split('T')[0] === dateStr
        ).length,
        completed: allTasks.filter(task =>
          task.status === 'DONE' &&
          task.updatedAt.toISOString().split('T')[0] === dateStr
        ).length
      };
    });

    logger.info('Task analytics generated successfully', {
      userId,
      totalTasks,
      completedTasks,
      completionRate: Math.round(completionRate * 10) / 10,
      overdueTasks
    });

    res.json({
      totalTasks,
      completedTasks,
      completionRate,
      overdueTasks,
      averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
      statusDistribution,
      taskOwnership,
      priorityBreakdown,
      weeklyTrend
    });
  } catch (error) {
    logger.error('Get task analytics operation failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getUrgentTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const nowUTC = new Date();
    const twentyFourHoursFromNowUTC = new Date(nowUTC.getTime() + 24 * 60 * 60 * 1000);

    logger.debug('Fetching urgent tasks', { userId });

    const urgentTasks = await prisma.task.findMany({
      where: {
        AND: [
          {
            OR: [
              { userId: userId },
              { sharedTasks: { some: { sharedWithUserId: userId } } }
            ]
          },
          {
            // EXCLUDE DONE TASKS
            status: { not: 'DONE' }
          },
          {
            OR: [
              // Deadline crossed (overdue)
              { deadline: { lt: nowUTC, not: null } },
              // Deadline within 24 hours
              { deadline: { gte: nowUTC, lte: twentyFourHoursFromNowUTC } },
              // Critical urgency (regardless of deadline)
              { urgency: 'CRITICAL', deadline: { not: null } }
            ]
          }
        ]
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        project: { select: { id: true, name: true, color: true } }
      },
      orderBy: [
        { deadline: 'asc' },  // Soonest deadlines first
        { urgency: 'desc' }    // Then by urgency
      ],
      take: 5
    });

    logger.info('Urgent tasks retrieved successfully', {
      userId,
      urgentTaskCount: urgentTasks.length
    });

    res.json({ urgentTasks });
  } catch (error) {
    logger.error('Get urgent tasks operation failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch urgent tasks' });
  }
};

// Delete task
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.debug('Deleting task', { userId, taskId: id });

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existingTask) {
      logger.warn('Delete task failed - not found or no permission', { userId, taskId: id });
      return res.status(404).json({ error: 'Task not found' });
    }
    await prisma.task.delete({
      where: { id },
    });

    logger.info('Task deleted successfully', { userId, taskId: id, title: existingTask.title });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    logger.error('Delete task operation failed', error, {
      userId: req.user?.id,
      taskId: req.params?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get tasks statistics
const getTasksStats = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.debug('Fetching task statistics', { userId });

    const stats = await prisma.task.groupBy({
      by: ['status'],
      where: { userId },
      _count: {
        status: true,
      },
    });
    const total = await prisma.task.count({ where: { userId } });
    // Get overdue tasks
    const overdueTasks = await prisma.task.count({
      where: {
        userId,
        deadline: {
          lt: new Date(),
        },
        status: {
          in: ['TODO', 'IN_PROGRESS'],
        },
      },
    });

    logger.info('Task statistics retrieved successfully', {
      userId,
      totalTasks: total,
      overdueTasks
    });

    res.json({
      stats: {
        TODO: stats.find(s => s.status === 'TODO')?._count?.status || 0,
        IN_PROGRESS: stats.find(s => s.status === 'IN_PROGRESS')?._count?.status || 0,
        DONE: stats.find(s => s.status === 'DONE')?._count?.status || 0,
        total,
        overdue: overdueTasks,
      },
    });
  } catch (error) {
    logger.error('Get tasks stats operation failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getTasksSharedByMe = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.debug('Fetching tasks shared by user', { userId });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, avatarUrl: true }
    });

    const sharedTasks = await prisma.sharedTask.findMany({
      where: {
        task: {
          userId: userId
        }
      },
      include: {
        task: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true }
            },
            project: {
              select: {
                id: true,
                name: true,
                color: true
              }
            },
          }
        },
        sharedWith: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        },
      },
      orderBy: {
        sharedAt: 'desc'
      }
    });

    //Properly map the nested project to root level
    const transformedTasks = sharedTasks.map(sharedTask => ({
      id: sharedTask.id,
      task: {
        id: sharedTask.task.id,
        title: sharedTask.task.title,
        status: sharedTask.task.status,
        urgency: sharedTask.task.urgency || 'MEDIUM',
      },
      sharedWith: sharedTask.sharedWith,
      permission: sharedTask.permission,
      project: sharedTask.task.project,
      sharedAt: sharedTask.sharedAt
    }));

    logger.info('Tasks shared by user retrieved successfully', {
      userId,
      sharedTaskCount: transformedTasks.length
    });

    res.json({
      sharedTasks: transformedTasks,
      count: transformedTasks.length
    });

  } catch (error) {
    logger.error('Get tasks shared by me operation failed', error, {
      userId: req.user?.id,
      errorStack: error.stack
    });
    res.status(500).json({
      error: 'Failed to fetch shared tasks',
      details: error.message
    });
  }
};

const getSharedTasks = async (req, res) => {
  try {
    const userId = req.user.id; // User B (viewing shared tasks)

    logger.debug('Fetching shared tasks', { userId });

    // Get all tasks shared with this user
    const sharedTasks = await prisma.sharedTask.findMany({
      where: {
        sharedWithUserId: userId
      },
      include: {
        task: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true
              }
            },
            project: {
              select: {
                id: true,
                name: true,
                color: true
              }
            }
          }
        },
      },
      orderBy: {
        sharedAt: 'desc'
      }
    });

    // Process the tasks to include sharing info
    const processedTasks = sharedTasks.map(shared => ({
      id: shared.task.id,
      title: shared.task.title,
      description: shared.task.description,
      status: shared.task.status,
      urgency: shared.task.urgency,
      deadline: shared.task.deadline,
      createdAt: shared.task.createdAt,
      updatedAt: shared.task.updatedAt,
      owner: shared.task.user,
      project: shared.task.project,
      sharedInfo: {
        sharedAt: shared.sharedAt,
        permission: shared.permission,
        sharedTaskId: shared.id
      }
    }));

    logger.info('Shared tasks retrieved successfully', {
      userId,
      sharedTaskCount: processedTasks.length
    });

    res.json({
      message: 'Shared tasks retrieved successfully',
      tasks: processedTasks,
      count: processedTasks.length
    });

  } catch (error) {
    logger.error('Get shared tasks operation failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createProject = async (req, res) => {
  try {
    const { name, color = '#3B82F6' } = req.body;
    const userId = req.user.id;

    logger.debug('Creating project', { userId, name, color });

    if (!name) {
      logger.warn('Create project failed - name required', { userId });
      return res.status(400).json({ error: 'Project name is required' });
    }
    const project = await prisma.project.create({
      data: {
        name,
        color,
        userId,
      },
    });

    logger.info('Project created successfully', {
      userId,
      projectId: project.id,
      name: project.name
    });

    res.status(201).json({
      message: 'Project created successfully',
      project,
    });
  } catch (error) {
    logger.error('Create project operation failed', error, {
      userId: req.user?.id,
      name: req.body?.name
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all projects for user
const getProjects = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.debug('Fetching projects', { userId });

    const projects = await prisma.project.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            tasks: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    logger.info('Projects retrieved successfully', {
      userId,
      projectCount: projects.length
    });

    res.json({ projects });

  } catch (error) {
    logger.error('Get projects operation failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update project
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const userId = req.user.id;

    logger.debug('Updating project', { userId, projectId: id, name, color });

    const existingProject = await prisma.project.findFirst({
      where: { id, userId },
    });

    if (!existingProject) {
      logger.warn('Update project failed - not found or no permission', { userId, projectId: id });
      return res.status(404).json({ error: 'Project not found' });
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(color && { color }),
      },
    });

    logger.info('Project updated successfully', {
      userId,
      projectId: id,
      name: updatedProject.name
    });

    res.json({
      message: 'Project updated successfully',
      project: updatedProject,
    });

  } catch (error) {
    logger.error('Update project operation failed', error, {
      userId: req.user?.id,
      projectId: req.params?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete project
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.debug('Deleting project', { userId, projectId: id });

    const existingProject = await prisma.project.findFirst({
      where: { id, userId },
    });

    if (!existingProject) {
      logger.warn('Delete project failed - not found or no permission', { userId, projectId: id });
      return res.status(404).json({ error: 'Project not found' });
    }

    await prisma.task.updateMany({
      where: { projectId: id },
      data: { projectId: null }
    });

    await prisma.project.delete({
      where: { id },
    });

    logger.info('Project deleted successfully', {
      userId,
      projectId: id,
      name: existingProject.name
    });

    res.json({ message: 'Project deleted successfully' });

  } catch (error) {
    logger.error('Delete project operation failed', error, {
      userId: req.user?.id,
      projectId: req.params?.id
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCollaborationHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.debug('Fetching collaboration history', { userId });

    // Get shared notes (your existing code)
    const sharedNotes = await prisma.sharedNote.findMany({
      where: {
        note: {
          userId: userId // I am the owner
        }
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true
          }
        },
        note: {
          select: {
            title: true,
            createdAt: true
          }
        }
      },
      orderBy: { sharedAt: 'desc' }
    });

    // NEW: Get shared tasks
    const sharedTasks = await prisma.sharedTask.findMany({
      where: {
        task: {
          userId: userId // I am the owner
        }
      },
      include: {
        sharedWith: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true
          }
        },
        task: {
          select: {
            title: true,
            createdAt: true
          }
        }
      },
      orderBy: { sharedAt: 'desc' }
    });

    const collaboratorsMap = new Map();

    // Process shared notes (existing logic)
    sharedNotes.forEach(share => {
      const collaborator = share.sharedWith;
      if (!collaborator) return;

      const collaboratorId = collaborator.id;

      if (!collaboratorsMap.has(collaboratorId)) {
        collaboratorsMap.set(collaboratorId, {
          id: collaborator.id,
          name: collaborator.name,
          email: collaborator.email,
          avatarUrl: collaborator.avatarUrl,
          joinedDate: collaborator.createdAt,
          collaborationCount: 1,
          noteCollaborations: 1,
          taskCollaborations: 0,
          lastCollaborated: share.sharedAt,
          lastItemTitle: share.note.title,
          lastItemType: 'NOTE',
          firstCollaboration: share.sharedAt,
          items: [{
            type: 'NOTE',
            title: share.note.title,
            sharedAt: share.sharedAt,
            id: share.note.id
          }]
        });
      } else {
        const existing = collaboratorsMap.get(collaboratorId);
        existing.collaborationCount += 1;
        existing.noteCollaborations += 1;

        // Update last collaboration
        if (new Date(share.sharedAt) > new Date(existing.lastCollaborated)) {
          existing.lastCollaborated = share.sharedAt;
          existing.lastItemTitle = share.note.title;
          existing.lastItemType = 'NOTE';
        }

        // Update first collaboration (earliest)
        if (new Date(share.sharedAt) < new Date(existing.firstCollaboration)) {
          existing.firstCollaboration = share.sharedAt;
        }

        // Add to items history
        existing.items.push({
          type: 'NOTE',
          title: share.note.title,
          sharedAt: share.sharedAt,
          id: share.note.id
        });
      }
    });

    // NEW: Process shared tasks
    sharedTasks.forEach(share => {
      const collaborator = share.sharedWith;
      if (!collaborator) return;

      const collaboratorId = collaborator.id;

      if (!collaboratorsMap.has(collaboratorId)) {
        collaboratorsMap.set(collaboratorId, {
          id: collaborator.id,
          name: collaborator.name,
          email: collaborator.email,
          avatarUrl: collaborator.avatarUrl,
          joinedDate: collaborator.createdAt,
          collaborationCount: 1,
          noteCollaborations: 0,
          taskCollaborations: 1,
          lastCollaborated: share.sharedAt,
          lastItemTitle: share.task.title,
          lastItemType: 'TASK',
          firstCollaboration: share.sharedAt,
          items: [{
            type: 'TASK',
            title: share.task.title,
            sharedAt: share.sharedAt,
            id: share.task.id
          }]
        });
      } else {
        const existing = collaboratorsMap.get(collaboratorId);
        existing.collaborationCount += 1;
        existing.taskCollaborations += 1;

        // Update last collaboration
        if (new Date(share.sharedAt) > new Date(existing.lastCollaborated)) {
          existing.lastCollaborated = share.sharedAt;
          existing.lastItemTitle = share.task.title;
          existing.lastItemType = 'TASK';
        }

        // Update first collaboration (earliest)
        if (new Date(share.sharedAt) < new Date(existing.firstCollaboration)) {
          existing.firstCollaboration = share.sharedAt;
        }

        // Add to items history
        existing.items.push({
          type: 'TASK',
          title: share.task.title,
          sharedAt: share.sharedAt,
          id: share.task.id
        });
      }
    });

    const collaborators = Array.from(collaboratorsMap.values())
      .sort((a, b) => new Date(b.lastCollaborated) - new Date(a.lastCollaborated))
      .map(collaborator => ({
        ...collaborator,
        // Sort items by date (most recent first)
        items: collaborator.items
          .sort((a, b) => new Date(b.sharedAt) - new Date(a.sharedAt))
          .slice(0, 10) // Limit to 10 most recent items
      }));

    // Calculate statistics
    const stats = {
      totalCollaborators: collaborators.length,
      totalCollaborations: collaborators.reduce((sum, c) => sum + c.collaborationCount, 0),
      noteCollaborations: collaborators.reduce((sum, c) => sum + c.noteCollaborations, 0),
      taskCollaborations: collaborators.reduce((sum, c) => sum + c.taskCollaborations, 0),
      mostActiveCollaborator: collaborators.length > 0 ?
        collaborators.reduce((prev, current) =>
          (prev.collaborationCount > current.collaborationCount) ? prev : current
        ) : null
    };

    logger.info('Collaboration history retrieved successfully', {
      userId,
      collaboratorCount: collaborators.length,
      totalCollaborations: stats.totalCollaborations,
      noteCollaborations: stats.noteCollaborations,
      taskCollaborations: stats.taskCollaborations
    });

    res.json({
      collaborators,
      totalCount: collaborators.length,
      stats
    });

  } catch (error) {
    logger.error('Get collaboration history operation failed', error, { userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to fetch collaboration history',
      details: error.message
    });
  }
};

module.exports = {
  createTask,
  getTasks,
  getTask,
  updateTask,
  getTaskAnalytics,
  deleteTask,
  getTasksStats,
  getTasksSharedByMe,
  getSharedTasks,
  createProject,
  getProjects,
  updateProject,
  deleteProject,
  getUrgentTasks,
  getCollaborationHistory
};