const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

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

        logger.debug('Tasks retrieved for analytics', {
            userId,
            totalTasksCount: allTasks.length
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

        const analyticsResult = {
            totalTasks,
            completedTasks,
            completionRate,
            overdueTasks,
            averageCompletionTime: Math.round(averageCompletionTime * 10) / 10,
            statusDistribution,
            taskOwnership,
            priorityBreakdown,
            weeklyTrend
        };

        logger.info('Task analytics generated successfully', {
            userId,
            totalTasks,
            completedTasks,
            completionRate: Math.round(completionRate * 10) / 10,
            overdueTasks,
            averageCompletionTime: Math.round(averageCompletionTime * 10) / 10
        });

        res.json(analyticsResult);

    } catch (error) {
        logger.error('Task analytics operation failed', error, {
            userId: req.user?.id
        });
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = { getTaskAnalytics }