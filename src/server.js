const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
require('dotenv').config();
const { setIO } = require('./lib/socketIO');
const {
  generalLimiter,
  authLimiter,
  aiLimiter,
  noteCreationLimiter
} = require('./middleware/rateLimit');

const prisma = new PrismaClient();
const app = express();
const server = createServer(app); // Use http server instead of app.listen()

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

setIO(io);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

app.use(generalLimiter);

// Import routes
const authRoutes = require('./routes/authRoutes');
const notesRoutes = require('./routes/notesRoutes');
const aiRoutes = require('./routes/aiRoutes');
const tasksRoutes = require('./routes/tasksRoutes.js');
const taskSharingRoutes = require('./routes/taskSharingRoutes.js');
const sharingRoutes = require('./routes/sharingRoutes');
const { swaggerUi, specs } = require('./config/swagger');
const taskCommentsRoutes = require('./routes/taskCommentsRoutes');
const reactionRoutes = require('./routes/reactionRoutes');
const fileRoutes = require('./routes/fileRoutes');
const userNotePreferences = require('./routes/userNotePreferences.js')
const avatarRoutes = require('./routes/avatarRoutes');
const userRoutes = require('./routes/userRoutes.js')
const deleteAccount = require('./routes/profileRoutes.js')
const getTaskAnalytics = require('./routes/getTaskAnalyticsRoutes.js')
const aiAssistantRoutes = require('./routes/aiAssistantRoutes.js');
const activityRoutes = require('./routes/activities.js')

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/tasks', generalLimiter, tasksRoutes);
app.use('/api/tasks', taskSharingRoutes);
app.use('/api/notes', noteCreationLimiter, notesRoutes);
app.use('/api/notes', sharingRoutes);
app.use('/api/tasks', taskCommentsRoutes);
app.use('/api/comments', reactionRoutes);
app.use('/api/user-preferences', userNotePreferences)
app.use('/api/user', userRoutes)
app.use('/api/profile/update-profile', deleteAccount)
app.use('./', getTaskAnalytics)
app.use('/api/ai', aiAssistantRoutes);
app.use('/api/activities', activityRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add file routes
app.use('/api/files', fileRoutes);

// Serve uploaded files statically
app.use('/api/files', express.static('uploads', {
  maxAge: '1d', // Cache for 1 day
  etag: true
}));

app.use('/api/avatars', avatarRoutes);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
app.get('/api/debug-swagger', (req, res) => {
  const paths = Object.keys(specs.paths || {});
  const tags = (specs.tags || []).map(t => t.name);

  res.json({
    success: true,
    message: 'Swagger debug - found routes and tags',
    total_paths: paths.length,
    paths: paths,
    tags: tags,
    components: Object.keys(specs.components || {})
  });
});
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Client-Data"]
}));

app.options("*", cors());

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'AI Notes Backend is running!',
    timestamp: new Date().toISOString(),
    routes: {
      auth: '/api/auth',
      notes: '/api/notes',
      ai: '/api/ai',
      tasks: '/api/tasks',
      sharing: '/api/notes'
    }
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'AI Notes Backend',
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

// Socket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true }
    });

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.userId = user.id;
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

// Store active users and their rooms
const activeUsers = new Map(); // userId -> socketId
const noteRooms = new Map();   // noteId -> Set of userIds
const taskRooms = new Map();

io.on('connection', (socket) => {
  logger.info(`User connected`, {
    userId: socket.userId,
    userName: socket.user.name,
    socketId: socket.id
  });
  socket.join(`user-${socket.userId}`);

  socket.on('join-user-room', () => {
    // Double-ensure user is in personal room
    socket.join(`user-${socket.userId}`);

    console.log(` User ${socket.userId} confirmed in personal room`);
  });

  // Add user to active users
  activeUsers.set(socket.userId, socket.id);

  // Broadcast user online status
  socket.broadcast.emit('user-online', {
    userId: socket.userId,
    user: socket.user
  });

  // Join note room for collaboration
  socket.on('join-note', async (noteId) => {
    try {
      // Check if user has access to note
      const canAccess = await canAccessNote(socket.userId, noteId);
      if (!canAccess) {
        socket.emit('access-denied', { noteId });
        return;
      }

      // Leave previous note rooms
      const previousRooms = Array.from(socket.rooms).filter(room => room.startsWith('note-'));
      previousRooms.forEach(room => socket.leave(room));

      // Join new note room
      const roomName = `note-${noteId}`;
      socket.join(roomName);

      // Track users in note room
      if (!noteRooms.has(noteId)) {
        noteRooms.set(noteId, new Set());
      }
      noteRooms.get(noteId).add(socket.userId);

      // Notify others in the room
      socket.to(roomName).emit('user-joined-note', {
        noteId,
        user: socket.user
      });

      // Get actual user data for all collaborators
      const collaboratorUserIds = Array.from(noteRooms.get(noteId));
      const collaborators = await Promise.all(
        collaboratorUserIds.map(async (userId) => {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, avatarUrl: true }
          });
          return user;
        })
      );

      const validCollaborators = collaborators.filter(collab => collab !== null);
      socket.emit('note-collaborators', {
        noteId,
        collaborators: validCollaborators
      });

      logger.debug(`User joined note room`, {
        userId: socket.userId,
        userName: socket.user.name,
        noteId
      });
    } catch (error) {
      logger.error('Join note operation failed', error, {
        userId: socket.userId,
        noteId
      });
      socket.emit('error', { message: 'Failed to join note' });
    }
  });

  // Handle real-time note editing
  socket.on('note-content-change', (data) => {
    const { noteId, content, cursorPosition } = data;
    const roomName = `note-${noteId}`;

    socket.to(roomName).emit('note-content-updated', {
      noteId,
      content,
      updatedBy: socket.user,
      cursorPosition,
      timestamp: new Date().toISOString()
    });
  });

  // Handle cursor movement
  socket.on('cursor-move', (data) => {
    const { noteId, position } = data;
    const roomName = `note-${noteId}`;

    socket.to(roomName).emit('user-cursor-move', {
      noteId,
      userId: socket.userId,
      user: socket.user,
      position,
      timestamp: new Date().toISOString()
    });
  });

  // Handle user typing
  socket.on('user-typing', (data) => {
    const { noteId, isTyping } = data;
    const roomName = `note-${noteId}`;

    socket.to(roomName).emit('user-typing-update', {
      noteId,
      userId: socket.userId,
      user: socket.user,
      isTyping,
      timestamp: new Date().toISOString()
    });
  });

  // Handle user leaving note room
  socket.on('leave-note', (noteId) => {
    logger.debug(`User leaving note room`, {
      userId: socket.userId,
      userName: socket.user.name,
      noteId
    });
    const roomName = `note-${noteId}`;

    // Leave the room
    socket.leave(roomName);

    // Remove user from tracking
    if (noteRooms.has(noteId)) {
      noteRooms.get(noteId).delete(socket.userId);
      if (noteRooms.get(noteId).size === 0) {
        noteRooms.delete(noteId);
      }
    }

    // Notify others
    socket.to(roomName).emit('user-left-note', {
      noteId,
      userId: socket.userId
    });
  });

  // Handle new attachments
  socket.on('attachment-added', (data) => {
    const { noteId, attachment } = data;
    const roomName = `note-${noteId}`;

    socket.to(roomName).emit('attachment-added', {
      noteId,
      attachment,
      updatedBy: socket.user
    });
  });

  // Handle attachment deletions
  socket.on('attachment-deleted', (data) => {
    const { noteId, attachmentId } = data;
    const roomName = `note-${noteId}`;

    socket.to(roomName).emit('attachment-deleted', {
      noteId,
      attachmentId,
      updatedBy: socket.user
    });
  });

  // Handle real-time share notifications - GLOBAL
  socket.on('share-note', async (data) => {
    try {
      logger.debug('Share note event received', data);
      const { targetUserId, noteId, sharedBy } = data;

      // Send to EVERYONE
      io.emit('global-note-shared', {
        targetUserId, // Who it's for
        noteId,
        sharedBy: sharedBy || socket.user,
        message: `${sharedBy?.name || socket.user.name} shared a note with you!`,
        timestamp: new Date().toISOString()
      });

      logger.info('Global note share notification sent', {
        sharedById: socket.userId,
        targetUserId,
        noteId
      });

    } catch (error) {
      logger.error('Share note notification failed', error, {
        userId: socket.userId,
        noteId
      });
    }
  });

  // Handle real-time revoke notifications - GLOBAL
  socket.on('revoke-access', async (data) => {
    try {
      logger.debug('Revoke access event received', data);
      const { targetUserId, noteId, revokedBy } = data;

      // Send to EVERYONE
      io.emit('global-access-revoked', {
        targetUserId,
        noteId,
        revokedBy: revokedBy || socket.user,
        message: `${revokedBy?.name || socket.user.name} revoked your access to a note`,
        timestamp: new Date().toISOString()
      });

      logger.info('Global access revoked notification sent', {
        revokedById: socket.userId,
        targetUserId,
        noteId
      });

    } catch (error) {
      logger.error('Revoke access notification failed', error, {
        userId: socket.userId,
        noteId
      });
    }
  });

  // Add this to your backend socket.js
  socket.on('revoke-access-bulk', async (data) => {
    try {
      logger.debug('Bulk revoke event received', data);
      const { revocations, revokedBy } = data;

      // Send individual events for EACH user
      revocations.forEach((revocation, index) => {
        io.emit('global-access-revoked', {
          targetUserId: revocation.targetUserId,
          noteId: revocation.noteId,
          revokedBy: revokedBy,
          message: `${revokedBy?.name} revoked your access to a note`,
          timestamp: new Date().toISOString()
        });
      });

      logger.info('Bulk revoke notifications sent', {
        revokedById: socket.userId,
        revocationCount: revocations.length
      });
    } catch (error) {
      logger.error('Bulk revoke notification failed', error, {
        userId: socket.userId
      });
    }
  });

  // Helper function: Check if user can access task
  const canAccessTask = async (userId, taskId) => {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
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
      }
    });
    return !!task;
  };

  // Helper function: Check if user can edit task  
  const canEditTask = async (userId, taskId) => {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        OR: [
          { userId }, // User is owner (can do anything)
          {
            sharedTasks: {
              some: {
                sharedWithUserId: userId,
                permission: 'EDIT' // User has EDIT permission
              }
            }
          }
        ]
      }
    });
    return !!task;
  };

  // Task Collaboration Socket Events
  socket.on('join-task', async (taskId) => {
    try {
      logger.debug('User attempting to join task', {
        userId: socket.userId,
        userName: socket.user.name,
        taskId
      });

      // Check if user can access task
      const canAccess = await canAccessTask(socket.userId, taskId);
      if (!canAccess) {
        socket.emit('task-access-denied', { taskId });
        logger.warn('Task access denied', {
          userId: socket.userId,
          taskId
        });
        return;
      }

      // Leave previous task rooms
      const previousRooms = Array.from(socket.rooms).filter(room => room.startsWith('task-'));
      previousRooms.forEach(room => socket.leave(room));

      // Join new task room
      const roomName = `task-${taskId}`;
      socket.join(roomName);

      if (!taskRooms.has(taskId)) {
        taskRooms.set(taskId, new Set());
      }
      taskRooms.get(taskId).add(socket.userId);

      // Notify others in the room
      socket.to(roomName).emit('user-joined-task', {
        taskId,
        user: socket.user
      });

      // Get current collaborators
      const collaboratorUserIds = Array.from(taskRooms.get(taskId));
      const collaborators = await Promise.all(
        collaboratorUserIds.map(async (userId) => {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true, name: true, email: true, avatarUrl: true
            }
          });
          return user;
        })
      );

      const validCollaborators = collaborators.filter(collab => collab !== null);

      // Send current collaborators to the joining user
      socket.emit('task-collaborators', {
        taskId,
        collaborators: validCollaborators
      });

      logger.info('User joined task room successfully', {
        userId: socket.userId,
        taskId,
        collaboratorCount: validCollaborators.length
      });

    } catch (error) {
      logger.error('Join task operation failed', error, {
        userId: socket.userId,
        taskId
      });
      socket.emit('task-error', { message: 'Failed to join task' });
    }
  });

  // Real-time Task Status Updates
  socket.on('task-status-update', async (data) => {
    try {
      const { taskId, status } = data;
      const userId = socket.userId;

      logger.debug('Task status update requested', {
        userId,
        userName: socket.user.name,
        taskId,
        status
      });

      // Check if user can edit this task
      const canEdit = await canEditTask(userId, taskId);
      if (!canEdit) {
        socket.emit('task-update-denied', { taskId });
        logger.warn('Task update denied - no permission', {
          userId,
          taskId
        });
        return;
      }

      // Validate status
      const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
      if (!validStatuses.includes(status)) {
        socket.emit('task-update-error', { error: 'Invalid status' });
        return;
      }

      // Update task in database
      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: { status },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      // Notify all users in this task room
      const roomName = `task-${taskId}`;
      io.to(roomName).emit('task-status-changed', {
        taskId,
        status,
        updatedBy: socket.user,
        task: updatedTask,
        timestamp: new Date().toISOString()
      });

      // Also send to the user who made the change (for confirmation)
      socket.emit('task-status-changed', {
        taskId,
        status,
        updatedBy: socket.user,
        task: updatedTask,
        timestamp: new Date().toISOString()
      });

      logger.info('Task status updated successfully', {
        userId,
        taskId,
        fromStatus: data.previousStatus,
        toStatus: status
      });

    } catch (error) {
      logger.error('Task status update failed', error, {
        userId: socket.userId,
        taskId
      });
      socket.emit('task-update-error', { error: 'Failed to update task status' });
    }
  });

  // Real-time Task Sharing Notification
  socket.on('share-task', async (data) => {
    try {
      const { taskId, targetUserId, permission = 'VIEW' } = data;
      const userId = socket.userId;

      logger.debug('Task sharing notification requested', {
        userId,
        taskId,
        targetUserId,
        permission
      });

      // Check if user can share this task (must be owner)
      const canEdit = await canEditTask(userId, taskId);
      if (!canEdit) {
        logger.warn('Task share denied - no permission', {
          userId,
          taskId
        });
        socket.emit('share-denied', { taskId });
        return;
      }

      // Send notification to SPECIFIC target user
      io.to(`user-${targetUserId}`).emit('global-task-shared', {
        targetUserId: targetUserId,
        taskId: taskId,
        sharedBy: socket.user,
        permission: permission,
        message: `${socket.user.name} shared a task with you!`,
        timestamp: new Date().toISOString()
      });

      // Also notify the sharer (optional)
      socket.emit('task-share-success', {
        taskId: taskId,
        targetUserId: targetUserId,
        permission: permission,
        message: `Task shared successfully`
      });

      logger.info('Task share notification sent', {
        userId,
        taskId,
        targetUserId
      });

    } catch (error) {
      logger.error('Task sharing notification failed', error, {
        userId: socket.userId,
        taskId
      });
      socket.emit('share-error', { error: 'Failed to send share notification' });
    }
  });

  // Real-time Task Access Revocation Notification
  socket.on('revoke-task-access', async (data) => {
    try {
      const { taskId, targetUserId } = data;
      const userId = socket.userId;

      logger.debug('Task access revocation requested', {
        userId,
        taskId,
        targetUserId
      });

      // Check if user can revoke (must be owner)
      const canEdit = await canEditTask(userId, taskId);
      if (!canEdit) {
        logger.warn('Task revoke denied - no permission', {
          userId,
          taskId
        });
        socket.emit('revoke-denied', { taskId });
        return;
      }

      // Notify target user
      io.to(`user-${targetUserId}`).emit('global-task-access-revoked', {
        targetUserId: targetUserId,
        taskId: taskId,
        revokedBy: socket.user,
        message: `${socket.user.name} revoked your access to a task`,
        timestamp: new Date().toISOString()
      });

      // Notify revoker
      socket.emit('task-revoke-success', {
        taskId: taskId,
        targetUserId: targetUserId,
        message: `Access revocation notification sent`
      });

      logger.info('Task access revocation notification sent', {
        userId,
        taskId,
        targetUserId
      });

    } catch (error) {
      logger.error('Task revoke notification failed', error, {
        userId: socket.userId,
        taskId
      });
      socket.emit('revoke-error', { error: 'Failed to send revoke notification' });
    }
  });

  // Bulk task revoke
  socket.on('revoke-task-access-bulk', async (data) => {
    try {
      logger.debug('Bulk task revoke event received', data);
      const { revocations, revokedBy } = data;

      revocations.forEach((revocation, index) => {
        io.emit('global-task-access-revoked', {
          targetUserId: revocation.targetUserId,
          taskId: revocation.taskId,
          revokedBy: revokedBy,
          message: `${revokedBy?.name} revoked your access to a task`,
          timestamp: new Date().toISOString()
        });
      });

      logger.info('Bulk task revoke notifications sent', {
        revokedById: socket.userId,
        revocationCount: revocations.length
      });
    } catch (error) {
      logger.error('Bulk task revoke notification failed', error, {
        userId: socket.userId
      });
    }
  });

  socket.on('current-task-deleted', async (data) => {
    try {
      const { taskId } = data;
      const userId = socket.userId;

      // Check if user can revoke (must be owner)
      const canEdit = await canEditTask(userId, taskId);
      if (!canEdit) {
        logger.warn('Task delete notification denied - no permission', {
          userId,
          taskId
        });
        socket.emit('revoke-denied', { taskId });
        return;
      }

      const roomName = `task-${taskId}`;
      // Notify target user
      socket.to(roomName).emit('task-deleted', {
        taskId: taskId,
        revokedBy: socket.user,
        message: `${socket.user.name} revoked your access to a task`,
        timestamp: new Date().toISOString()
      });

      // Notify revoker
      socket.emit('task-revoke-success', {
        taskId: taskId,
        message: `Access revocation notification sent`
      });

      logger.info('Task deletion notification sent', {
        userId,
        taskId
      });

    } catch (error) {
      logger.error('Task deletion notification failed', error, {
        userId: socket.userId,
        taskId
      });
      socket.emit('revoke-error', { error: 'Failed to send revoke notification' });
    }
  });

  // Real-time Task Updates (title, description, deadline)
  socket.on('task-update', async (data) => {
    try {
      const { taskId, updates } = data; // updates: { title?, description?, deadline? }
      const userId = socket.userId;

      logger.debug('Task update requested', {
        userId,
        taskId,
        updates
      });

      // Check if user can edit this task
      const canEdit = await canEditTask(userId, taskId);
      if (!canEdit) {
        socket.emit('task-update-denied', { taskId });
        return;
      }

      // Notify all users in task room
      const roomName = `task-${taskId}`;
      io.to(roomName).emit('task-updated', {
        taskId,
        updates,
        updatedBy: socket.user,
        timestamp: new Date().toISOString()
      });

      logger.info('Task update notification sent', {
        userId,
        taskId
      });

    } catch (error) {
      logger.error('Task update failed', error, {
        userId: socket.userId,
        taskId
      });
      socket.emit('task-update-error', { error: 'Failed to update task' });
    }
  });

  // User typing in task (for comments/description)
  socket.on('task-typing', (data) => {
    const { taskId, isTyping } = data;
    const roomName = `task-${taskId}`;

    socket.to(roomName).emit('user-task-typing', {
      taskId,
      userId: socket.userId,
      user: socket.user,
      isTyping,
      timestamp: new Date().toISOString()
    });
  });

  // User leaving task room
  socket.on('leave-task', (taskId) => {
    logger.debug('User leaving task room', {
      userId: socket.userId,
      userName: socket.user.name,
      taskId
    });
    const roomName = `task-${taskId}`;

    // Leave the room
    socket.leave(roomName);

    // Remove user from tracking
    if (taskRooms.has(taskId)) {
      taskRooms.get(taskId).delete(socket.userId);
      if (taskRooms.get(taskId).size === 0) {
        taskRooms.delete(taskId);
      }
    }

    // Notify others
    socket.to(roomName).emit('user-left-task', {
      taskId,
      userId: socket.userId,
      user: socket.user.name
    });
  });

  // Handle new comment
  socket.on('task-comment', async (data) => {
    try {
      const { taskId, content, commentId, repliedToCommentId, repliedToContent, repliedToUserId, repliedToUserName, repliedToUserEmail, repliedToCreatedAt, fileAttachments, repliedToFileAttachments } = data;
      const userId = socket.userId;
      const roomName = `task-${taskId}`;

      socket.to(roomName).emit('new-task-comment', {
        taskId,
        comment: { // Create temporary comment object
          id: commentId,
          content,
          taskId,
          userId,
          user: socket.user,
          fileAttachments,
          repliedToCommentId: repliedToCommentId || null,
          repliedToContent: repliedToContent || null,
          repliedToUserId: repliedToUserId || null,
          repliedToUserName: repliedToUserName || null,
          repliedToUserEmail: repliedToUserEmail || null,
          repliedToCreatedAt: repliedToCreatedAt || null,
          repliedToFileAttachments: repliedToFileAttachments || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        addedBy: socket.user,
        timestamp: new Date().toISOString()
      });

      logger.debug('New task comment broadcasted', {
        userId,
        taskId,
        commentId
      });

    } catch (error) {
      logger.error('Socket comment operation failed', error, {
        userId: socket.userId,
        taskId: data.taskId
      });
    }
  });

  // Handle comment typing indicator (SEPARATE event - not nested!)
  socket.on('comment-typing', (data) => {
    const { taskId, isTyping } = data;
    const roomName = `task-${taskId}`;

    socket.to(roomName).emit('user-comment-typing', {
      taskId,
      userId: socket.userId,
      user: socket.user,
      isTyping,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('comment-deleted', (data) => {
    const { taskId, commentId } = data;
    const roomName = `task-${taskId}`;

    io.to(roomName).emit('comment-delete-confirmed', {
      taskId,
      commentId,
      user: socket.user,
      timestamp: new Date().toISOString()
    });

    logger.info('Comment deletion confirmed', {
      userId: socket.userId,
      taskId,
      commentId
    });
  });

  // Clean up task rooms or notes on disconnect
  socket.on('disconnect', () => {
    logger.info(`User disconnected`, {
      userId: socket.userId,
      userName: socket.user.name,
      socketId: socket.id
    });

    // Clean up active users
    activeUsers.delete(socket.userId);

    // Clean up note rooms
    noteRooms.forEach((users, noteId) => {
      users.delete(socket.userId);
      if (users.size === 0) {
        noteRooms.delete(noteId);
      }
    });

    // Clean up task rooms  
    taskRooms.forEach((users, taskId) => {
      users.delete(socket.userId);
      if (users.size === 0) {
        taskRooms.delete(taskId);
      }
    });

    // Notify others user went offline
    socket.broadcast.emit('user-offline', {
      userId: socket.userId
    });

    logger.debug(`User cleanup completed`, {
      userId: socket.userId
    });
  });
});

const createPrompt = (tasks) => {
  const tasksText = tasks.map((task, index) => `
TASK ${index + 1}:
ID: ${task.id}
TITLE: ${task.title}
PROJECT: ${task.project?.name || 'No Project'}
STATUS: ${task.status}
DESCRIPTION: ${task.description || 'None'}
    `).join('\n');

  return `
ANALYZE THESE TASKS AND RETURN JSON. YOU MUST INCLUDE DEPENDENCIES.

TASKS:
${tasksText}

RULES FOR DEPENDENCIES:
1. Tasks in same project = CREATE DEPENDENCIES between them
2. Use natural order: Planning → Design → Develop → Test → Launch
3. Make logical connections between related tasks
4. You MUST return at least 2 dependencies

JSON FORMAT:
{
  "priorities": [
    {"taskId": "id1", "priority": "HIGH", "reason": "...", "suggestedOrder": 1}
  ],
  "timeEstimates": [
    {"taskId": "id1", "aiEstimate": "2 hours", "confidence": "HIGH", "reasoning": ["..."]}
  ],
  "dependencies": [
    {
      "taskId": "id1",
      "requiredTasks": ["id2"],
      "reason": "Project workflow dependency"
    }
  ],
  "productivity": {
    "overallScore": 75,
    "weeklyTrend": "STABLE",
    "strengths": ["..."],
    "improvementAreas": ["..."],
    "personalizedTips": ["..."],
    "peakHours": ["9-11 AM"],
    "focusAreas": ["..."],
    "estimatedWeeklyCapacity": "15 tasks"
  }
}

CRITICAL: dependencies array MUST NOT be empty. Find at least 2 logical connections.
Use only the task IDs provided above.

RESPOND WITH JSON ONLY.
`;
};

// Parse AI Response function
const parseAIResponse = (response) => {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const jsonString = jsonMatch[0]
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    return JSON.parse(jsonString);
  } catch (error) {
    console.log('Failed to parse AI response, using simple parsing');
    return simpleParse(response);
  }
};

const simpleParse = (response) => {
  const lines = response.split('\n');
  const priorities = lines
    .filter(line => line.includes('HIGH') || line.includes('MEDIUM') || line.includes('LOW'))
    .slice(0, 3)
    .map((line, index) => ({
      taskId: `task-${index}`,
      priority: line.includes('HIGH') ? 'HIGH' : line.includes('MEDIUM') ? 'MEDIUM' : 'LOW',
      reason: line,
      suggestedOrder: index + 1
    }));

  const timeEstimates = lines
    .filter(line => line.includes('hour') || line.includes('day') || line.includes('minute'))
    .slice(0, 3)
    .map((line, index) => ({
      taskId: `task-${index}`,
      aiEstimate: getTimeFromText(line),
      confidence: 'MEDIUM',
      reasoning: [line]
    }));

  return {
    priorities,
    timeEstimates,
    dependencies: [],
    productivity: getDefaultProductivity()
  };
};

const getTimeFromText = (text) => {
  const match = text.match(/(\d+[\s-]*(?:hour|hr|day|minute)s?)/i);
  return match ? match[0] : '1-2 hours';
};

const formatAIData = (aiData, tasks) => {
  const taskMap = new Map(tasks.map(task => [task.id, task]));

  const priorities = (aiData.priorities || [])
    .filter((p) => p && p.taskId && taskMap.has(p.taskId))
    .slice(0, 5)
    .map((p) => ({
      taskId: p.taskId,
      taskTitle: taskMap.get(p.taskId)?.title || 'Unknown',
      priority: getValidPriority(p.priority),
      reason: p.reason || 'AI recommendation',
      suggestedOrder: p.suggestedOrder || 1
    }));

  const timeEstimates = (aiData.timeEstimates || [])
    .filter((te) => te && te.taskId && taskMap.has(te.taskId))
    .slice(0, 5)
    .map((te) => ({
      taskId: te.taskId,
      taskTitle: taskMap.get(te.taskId)?.title || 'Unknown',
      aiEstimate: te.aiEstimate || '1-2 hours',
      confidence: getValidConfidence(te.confidence),
      reasoning: Array.isArray(te.reasoning) ? te.reasoning : [te.reasoning || 'Based on analysis']
    }));

  const dependencies = (aiData.dependencies || [])
    .filter((dep) => dep && dep.taskId && taskMap.has(dep.taskId))
    .slice(0, 5)
    .map((dep) => ({
      taskId: dep.taskId,
      taskTitle: taskMap.get(dep.taskId)?.title || 'Unknown',
      requiredTasks: Array.isArray(dep.requiredTasks) ?
        dep.requiredTasks.filter((id) => taskMap.has(id)) : [],
      reason: dep.reason || 'Workflow dependency'
    }));

  const productivityData = aiData.productivity || {};
  const productivity = {
    overallScore: Math.min(100, Math.max(0, productivityData.overallScore || 70)),
    weeklyTrend: ['IMPROVING', 'STABLE', 'DECLINING'].includes(productivityData.weeklyTrend) ?
      productivityData.weeklyTrend : 'STABLE',
    strengths: Array.isArray(productivityData.strengths) ?
      productivityData.strengths : ['Good task management'],
    improvementAreas: Array.isArray(productivityData.improvementAreas) ?
      productivityData.improvementAreas : ['Time estimation'],
    personalizedTips: Array.isArray(productivityData.personalizedTips) ?
      productivityData.personalizedTips : ['Try time blocking'],
    peakHours: Array.isArray(productivityData.peakHours) ? productivityData.peakHours : ['9-11 AM'],
    focusAreas: Array.isArray(productivityData.focusAreas) ? productivityData.focusAreas : ['Important tasks'],
    estimatedWeeklyCapacity: productivityData.estimatedWeeklyCapacity || '15-20 tasks'
  };

  return {
    priorities: priorities.length > 0 ? priorities : getSimplePriorities(tasks),
    timeEstimates: timeEstimates.length > 0 ? timeEstimates : getSimpleTimeEstimates(tasks),
    dependencies,
    productivity
  };
};

const getSimplePriorities = (tasks) => {
  return tasks.slice(0, 3).map((task, index) => ({
    taskId: task.id,
    taskTitle: task.title,
    priority: index === 0 ? 'HIGH' : index === 1 ? 'MEDIUM' : 'LOW',
    reason: 'Based on task order',
    suggestedOrder: index + 1
  }));
};

const getSimpleTimeEstimates = (tasks) => {
  return tasks.slice(0, 3).map(task => ({
    taskId: task.id,
    taskTitle: task.title,
    aiEstimate: '1-3 hours',
    confidence: 'MEDIUM',
    reasoning: ['Standard task estimate']
  }));
};

const getDefaultProductivity = () => {
  return {
    overallScore: 70,
    weeklyTrend: 'STABLE',
    strengths: ['Consistency', 'Organization'],
    improvementAreas: ['Time management', 'Planning'],
    personalizedTips: ['Break tasks into chunks', 'Schedule focus time'],
    peakHours: ['9-11 AM', '2-4 PM'],
    focusAreas: ['Complex work', 'Planning'],
    estimatedWeeklyCapacity: '12-15 tasks'
  };
};

const getValidPriority = (priority) => {
  const prio = String(priority).toUpperCase();
  return prio === 'HIGH' || prio === 'MEDIUM' || prio === 'LOW' ? prio : 'MEDIUM';
};

const getValidConfidence = (confidence) => {
  const conf = String(confidence).toUpperCase();
  return conf === 'HIGH' || conf === 'MEDIUM' || conf === 'LOW' ? conf : 'MEDIUM';
};

app.post('/api/ai-suggestions', async (req, res) => {
  try {
    const { tasks } = req.body;
    console.log('Processing AI suggestions for', tasks.length, 'tasks');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log(' No API key in backend');
      return res.json({
        priorities: getSimplePriorities(tasks),
        timeEstimates: getSimpleTimeEstimates(tasks),
        dependencies: [],
        productivity: getDefaultProductivity()
      });
    }

    const prompt = createPrompt(tasks);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 2000,
            temperature: 0.1,
          }
        }),
      }
    );

    if (!response.ok) throw new Error('AI service error');

    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;
    const parsedData = parseAIResponse(aiText);
    const suggestions = formatAIData(parsedData, tasks);

    console.log(' AI suggestions generated successfully');
    res.json(suggestions);

  } catch (error) {
    console.error(' AI service error:', error);
    res.json({
      priorities: getSimplePriorities(req.body.tasks || []),
      timeEstimates: getSimpleTimeEstimates(req.body.tasks || []),
      dependencies: [],
      productivity: getDefaultProductivity()
    });
  }
});

// Helper function
const canAccessNote = async (userId, noteId) => {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      OR: [
        { userId },
        {
          sharedNotes: {
            some: {
              sharedWithUserId: userId
            }
          }
        }
      ]
    }
  });
  return !!note;
};

server.listen(PORT, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });

  console.log(` Server running on port ${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health`);
  console.log(` Auth routes: http://localhost:${PORT}/api/auth`);
  console.log(` Notes routes: http://localhost:${PORT}/api/notes`);
  console.log(` AI routes: http://localhost:${PORT}/api/ai`);
  console.log(` Tasks routes: http://localhost:${PORT}/api/tasks`);
  console.log(` Sharing routes: http://localhost:${PORT}/api/notes`);
  console.log(` Socket.IO enabled: ws://localhost:${PORT}`);
});