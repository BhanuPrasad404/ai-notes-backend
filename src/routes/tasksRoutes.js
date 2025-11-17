const express = require('express');
const {
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
} = require('../controllers/tasksController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateTask, handleValidationErrors } = require('../middleware/validation');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient()

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/has-new-messages', async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(' Fetching tasks with new messages for user:', userId);

    const tasksWithNewMessages = await prisma.$queryRaw`
      SELECT 
        t.id as "taskId"
      FROM "Task" t
      LEFT JOIN "TaskLastRead" tlr ON t.id = tlr."taskId" AND tlr."userId" = ${userId}
      WHERE EXISTS (
        SELECT 1 FROM "TaskComment" tc 
        WHERE tc."taskId" = t.id 
        AND tc."createdAt" > COALESCE(tlr."lastReadAt", '1970-01-01'::timestamp)
        LIMIT 1
      )
      AND (t."userId" = ${userId} 
        OR t.id IN (SELECT "taskId" FROM "SharedTask" WHERE "sharedWithUserId" = ${userId})
      )
    `;

    console.log(' Tasks with new messages:', tasksWithNewMessages);
    const taskIds = tasksWithNewMessages.map(item => item.taskId);
    res.json({ tasksWithNewMessages: taskIds });
  } catch (error) {
    console.error(' Error in has-new-messages:', error);
    res.status(500).json({ error: 'Failed to fetch tasks with new messages' });
  }
});

router.post('/:taskId/last-read', async (req, res) => {
  try {
    console.log(' LAST-READ ENDPOINT CALLED');

    const { taskId } = req.params;
    const userId = req.user?.id;

    console.log('Params:', { taskId, userId });

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    // Test if TaskLastRead table exists with a simple query
    try {
      console.log(' Testing TaskLastRead table access...');
      const testRecord = await prisma.taskLastRead.findFirst({
        take: 1
      });
      console.log(' TaskLastRead table accessible');
    } catch (tableError) {
      console.error(' TaskLastRead table error:', tableError);
      return res.status(500).json({
        error: 'TaskLastRead table not accessible',
        details: 'Run: npx prisma migrate dev --name add-task-last-read-table'
      });
    }

    // Verify task exists (optional but good for debugging)
    try {
      const taskExists = await prisma.task.findUnique({
        where: { id: taskId }
      });
      console.log(' Task exists:', !!taskExists);
    } catch (taskError) {
      console.error(' Task check error:', taskError);
    }

    // Perform the upsert

    const result = await prisma.taskLastRead.upsert({
      where: {
        taskId_userId: { taskId, userId }
      },
      update: {
        lastReadAt: new Date()
      },
      create: {
        taskId,
        userId,
        lastReadAt: new Date()
      }
    });

    console.log('Last read updated successfully');
    res.json({ success: true });

  } catch (error) {
    console.error(' SERVER ERROR in last-read:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);

    res.status(500).json({
      error: 'Database operation failed',
      details: error.message,
      code: error.code
    });
  }
});

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: "Create a new task"
 *     description: "Create a task with status tracking"
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Complete project documentation"
 *               description:
 *                 type: string
 *                 example: "Write documentation"
 *               status:
 *                 type: string
 *                 enum: ['TODO', 'IN_PROGRESS', 'DONE']
 *                 default: 'TODO'
 *                 example: 'TODO'
 *               deadline:
 *                 type: string
 *                 example: "2024-12-31T23:59:59.000Z"
 *     responses:
 *       201:
 *         description: "Task created successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Task created successfully"
 *                 task:
 *                   type: object
 *       400:
 *         description: "Validation error"
 *       401:
 *         description: "Unauthorized"
 */
router.post('/', validateTask, handleValidationErrors, createTask);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: "Get tasks statistics"
 *     description: "Returns task counts and overdue items"
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Task statistics retrieved"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *       401:
 *         description: "Unauthorized"
 */
router.get('/stats', getTasksStats);
/**
 * @swagger
 * /api/tasks/shared-by-me:
 *   get:
 *     summary: "Get tasks shared by current user"
 *     description: "Returns all tasks that the current user has shared with others"
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Tasks shared by user retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tasks shared by you retrieved successfully"
 *                 sharedTasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: integer
 *       401:
 *         description: "Unauthorized"
 */

/**
 * @swagger
 * /api/tasks/projects:
 *   post:
 *     summary: "Create a new project"
 *     description: "Create a project to organize tasks"
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Website Redesign"
 *               color:
 *                 type: string
 *                 example: "#3B82F6"
 *     responses:
 *       201:
 *         description: "Project created successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Project created successfully"
 *                 project:
 *                   type: object
 *       400:
 *         description: "Validation error"
 *       401:
 *         description: "Unauthorized"
 */
router.post('/projects', createProject);


/**
 * @swagger
 * /api/tasks/projects/{id}:
 *   put:
 *     summary: "Update a project"
 *     description: "Update project name or color"
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Project Name"
 *               color:
 *                 type: string
 *                 example: "#EF4444"
 *     responses:
 *       200:
 *         description: "Project updated successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Project updated successfully"
 *                 project:
 *                   type: object
 *       404:
 *         description: "Project not found"
 *       401:
 *         description: "Unauthorized"
 */
router.put('/projects/:id', updateProject);

/**
 * @swagger
 * /api/tasks/projects/{id}:
 *   delete:
 *     summary: "Delete a project"
 *     description: "Delete project and unlink its tasks"
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: "Project deleted successfully"
 *       404:
 *         description: "Project not found"
 *       401:
 *         description: "Unauthorized"
 */
router.delete('/projects/:id', deleteProject);

router.get('/shared-by-me', getTasksSharedByMe)
router.get('/shared', getSharedTasks);

router.get('/urgent', getUrgentTasks);

router.get('/', getTasks);
router.get('/analytics', getTaskAnalytics);
router.get('/projects', getProjects);
router.get('/:id', getTask);
router.get('/collaboration/history', getCollaborationHistory)
router.put('/:id', validateTask, handleValidationErrors, updateTask);
router.delete('/:id', deleteTask);
module.exports = router;
