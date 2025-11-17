// controllers/aiAssitantController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger'); // Add this line

const TRAINED_RESPONSES = {
    "How do I create a new note?": `To create a new note: 1. Click "New Note" button 2. Add title/content 3. Use AI tools 4. Save`,
    "How do I share a note with someone?": `Sharing: 1. Open note 2. Click Share 3. Enter email 4. Choose permissions 5. Send`,
    "What AI features are available for notes?": `AI features for notes: Auto-summarization, Smart tagging, Content enhancement, Action item extraction, Meeting notes processing`,
    "How do I create a task?": `Create task: 1. Go to Tasks page 2. Click "New Task" 3. Add title, description, deadline 4. Set priority 5. Assign to project 6. Save`,
    "How does task priority work?": `Task priorities: URGENT (critical), HIGH (important deadlines), MEDIUM (normal), LOW (optional). AI suggests priorities based on deadlines and dependencies.`,
    "What are task dependencies?": `Task dependencies show which tasks must complete before others. AI analyzes relationships and suggests dependencies automatically for better workflow.`,
    "How can I improve my productivity?": `Productivity tips: Use AI summarization for quick reviews, convert notes to tasks automatically, set smart priorities, use tagging for organization, share with teams for collaboration.`,
    "How does this help team collaboration?": `Team features: Share notes/tasks with VIEW/EDIT permissions, comment and discuss tasks, attach files, real-time updates, AI workload insights for better team distribution.`,
    "What are the main AI utilities?": `Main AI utilities: Note enhancement (summarize/tag/enhance), Task intelligence (priority/time estimates), Content analysis, Productivity insights, Team collaboration tools.`,
    "How do I organize my notes effectively?": `Organization: Use AI-generated tags, create personal tags, utilize master tags (Work/Personal/Ideas), group tasks in projects, mark favorites, share related notes with teams.`,
    "Can I attach files to notes and tasks?": `Yes! Attach files to notes and task comments. Supported: Images, PDFs, Documents. Files are securely stored and accessible to shared users with permissions.`,
    "How do I use projects?": `Projects: Create projects to group related tasks, assign colors for visual organization, filter tasks by project, manage project-specific workloads.`,
    "What are personal tags?": `Personal tags: Custom tags you create in User Preferences for personal organization, separate from AI-generated tags, visible only to you.`,
    "How do I find shared notes?": `Shared notes: Check "Shared with me" section for notes others shared with you, "Shared by me" for notes you shared, manage permissions in sharing settings.`,
    "Can I collaborate on tasks?": `Yes! Share tasks with team members, assign comments and discussions, track progress together, get notifications for updates.`,
    "How do I change themes?": `Themes: Click your profile → Settings → toggle between Dark/Light theme. The app remembers your preference across devices.`,
    "What are task comments for?": `Task comments: Discuss tasks with team, ask questions, provide updates, attach files, reply to specific comments for threaded discussions.`,
    "How do I set deadlines?": `Deadlines: When creating/editing tasks, set due dates. AI uses deadlines to suggest priorities and send reminders for upcoming tasks.`,
    "Can I export my data?": `Export: Currently support note export as text files. More export options coming soon for tasks and projects.`,
    "How do I reset my password?": `Password reset: Go to Login → Forgot Password → enter email → check inbox for reset link → set new password.`
};

// Custom Gemini call using your setup
const callGemini = async (prompt, maxTokens = 200) => {
    try {
        const response = await fetch(
            `${process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/models'}/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `You are an AI assistant for a specific productivity app. Answer questions ONLY about this app's features.

APP FEATURES:
- Notes: Create, edit, share notes with AI tools (summarization, tagging, enhancement)
- Tasks: Manage tasks with priorities, deadlines, dependencies, projects
- AI Tools: Auto-summarization, smart tagging, content enhancement, action item extraction
- Sharing: Share notes/tasks with team members, set permissions
- Projects: Group tasks into colored projects
- File attachments: Attach files to notes and task comments

USER QUESTION: "${prompt}"

Provide a concise answer focused ONLY on how to use THIS app's features. If the question is not about this app, say "I specialize in helping with this productivity app's features."
`
                        }]
                    }],
                    generationConfig: {
                        maxOutputTokens: maxTokens,
                        temperature: 0.3,
                    }
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();

    } catch (error) {
        logger.error('Gemini API call failed', error, {
            promptLength: prompt?.length,
            maxTokens
        });
        return "Sorry, I'm having trouble connecting right now. Please try again.";
    }
};

// Get conversation WITH 30-day cleanup
const getConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const conversation = await prisma.aIAssistant.findUnique({
            where: { userId }
        });

        if (!conversation) {
            logger.debug('No existing conversation found', { userId });
            return res.json({ messages: [], conversationId: null });
        }

        // Calculate 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Filter out messages older than 30 days
        const recentMessages = conversation.messages.filter(message => {
            const messageDate = new Date(message.timestamp);
            return messageDate >= thirtyDaysAgo;
        });

        // Update with only recent messages
        if (recentMessages.length !== conversation.messages.length) {
            logger.debug('Cleaning up old conversation messages', {
                userId,
                originalCount: conversation.messages.length,
                recentCount: recentMessages.length,
                removedCount: conversation.messages.length - recentMessages.length
            });

            await prisma.aIAssistant.update({
                where: { userId },
                data: {
                    messages: recentMessages,
                    updatedAt: new Date()
                }
            });
        }

        logger.info('Conversation retrieved successfully', {
            userId,
            messageCount: recentMessages.length
        });

        res.json({
            messages: recentMessages,
            conversationId: conversation.id
        });
    } catch (error) {
        logger.error('Failed to get conversation', error, {
            userId: req.user?.id
        });
        res.status(500).json({ error: "Internal server error" });
    }
};

// Save conversation
const saveConversation = async (req, res) => {
    try {
        const userId = req.user.id;
        const { messages } = req.body;

        logger.debug('Saving conversation', {
            userId,
            messageCount: messages?.length
        });

        const conversation = await prisma.aIAssistant.upsert({
            where: { userId },
            update: { messages, updatedAt: new Date() },
            create: { userId, messages }
        });

        logger.info('Conversation saved successfully', {
            userId,
            conversationId: conversation.id,
            messageCount: messages?.length
        });

        res.json(conversation);
    } catch (error) {
        logger.error('Failed to save conversation', error, {
            userId: req.user?.id,
            messageCount: req.body?.messages?.length
        });
        res.status(500).json({ error: "Internal server error" });
    }
};

// Get AI response
const getAIResponse = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            logger.warn('AI response request missing message', {
                userId: req.user?.id
            });
            return res.status(400).json({ error: "Message is required" });
        }

        logger.debug('Processing AI response request', {
            userId: req.user.id,
            messageLength: message.length
        });

        // Check trained responses
        const trainedResponse = getTrainedResponse(message);
        if (trainedResponse) {
            logger.info('Used trained response for question', {
                userId: req.user.id,
                question: message.substring(0, 50) // Log first 50 chars
            });
            return res.json({ answer: trainedResponse, isTrained: true });
        }

        // Use your working Gemini call
        const geminiResponse = await callGemini(message);

        logger.info('Generated AI response successfully', {
            userId: req.user.id,
            responseLength: geminiResponse?.length,
            usedGemini: true
        });

        res.json({ answer: geminiResponse, isTrained: false });

    } catch (error) {
        logger.error('Failed to get AI response', error, {
            userId: req.user?.id,
            message: req.body?.message?.substring(0, 50)
        });
        res.status(500).json({ error: "Internal server error" });
    }
};

// Clear conversation
const clearConversation = async (req, res) => {
    try {
        const userId = req.user.id;

        logger.debug('Clearing conversation', { userId });

        await prisma.aIAssistant.delete({ where: { userId } });

        logger.info('Conversation cleared successfully', { userId });

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to clear conversation', error, {
            userId: req.user?.id
        });
        res.status(500).json({ error: "Internal server error" });
    }
};

// Helper
const getTrainedResponse = (question) => {
    const normalized = question.toLowerCase().trim();
    if (TRAINED_RESPONSES[question]) return TRAINED_RESPONSES[question];
    for (const [trainedQ, response] of Object.entries(TRAINED_RESPONSES)) {
        if (normalized.includes(trainedQ.toLowerCase()) || trainedQ.toLowerCase().includes(normalized)) {
            return response;
        }
    }
    return null;
};

module.exports = { getAIResponse, getConversation, saveConversation, clearConversation };