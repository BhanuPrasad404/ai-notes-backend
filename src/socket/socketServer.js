const { Server } = require('socket.io');
const { createServer } = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", // Next.js frontend
        methods: ["GET", "POST"]
    }
});

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

io.on('connection', (socket) => {
    console.log(`User ${socket.user.name} connected: ${socket.id}`);

    // Add user to active users
    activeUsers.set(socket.userId, socket.id);

    // Broadcast user online status
    socket.broadcast.emit('user-online', {
        userId: socket.userId,
        user: socket.user
    });

    // Join note room for collaboration
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
                        select: { id: true, name: true, email: true }
                    });
                    return user;
                })
            );
            // Filter out any null users and send to the joining user
            const validCollaborators = collaborators.filter(collab => collab !== null);
            socket.emit('note-collaborators', {
                noteId,
                collaborators: validCollaborators
            });
            console.log(`User ${socket.user.name} joined note ${noteId}`);
        } catch (error) {
            console.error('Join note error:', error);
            socket.emit('error', { message: 'Failed to join note' });
        }
    });
    // Handle real-time note editing
    socket.on('note-content-change', (data) => {
        const { noteId, content, cursorPosition } = data;
        const roomName = `note-${noteId}`;

        // Broadcast to others in the room (except sender)
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

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User ${socket.user.name} disconnected: ${socket.id}`);

        // Remove from active users
        activeUsers.delete(socket.userId);

        // Remove from note rooms
        noteRooms.forEach((users, noteId) => {
            users.delete(socket.userId);
            if (users.size === 0) {
                noteRooms.delete(noteId);
            }
        });

        // Broadcast user offline status
        socket.broadcast.emit('user-offline', {
            userId: socket.userId
        });
    });
});

// Helper function (we'll add this from our notesController)
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

module.exports = { io, server };