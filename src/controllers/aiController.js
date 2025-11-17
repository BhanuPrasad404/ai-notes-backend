const { PrismaClient } = require('@prisma/client');
const aiService = require('../services/aiService');
const logger = require('../utils/logger'); // Add this line

const prisma = new PrismaClient();

const enhanceNote = async (req, res) => {
  try {
    const { noteId, content } = req.body;
    const userId = req.user.id;

    logger.debug('Enhance note request received', {
      userId,
      noteId: noteId || 'none',
      contentLength: content?.length
    });

    if (!content) {
      logger.warn('Enhance note request missing content', { userId });
      return res.status(400).json({ error: 'Content is required' });
    }

    if (noteId) {
      const note = await prisma.note.findFirst({
        where: { id: noteId, userId }
      });
      if (!note) {
        logger.warn('Note not found for enhancement', { userId, noteId });
        return res.status(404).json({ error: 'Note not found' });
      }
    }

    const enhancedContent = await aiService.enhanceContent(content);

    logger.info('Note enhanced successfully', {
      userId,
      noteId: noteId || 'new',
      originalLength: content.length,
      enhancedLength: enhancedContent?.length
    });

    res.json({
      success: true,
      originalContent: content,
      enhancedContent,
      noteId: noteId || null
    });

  } catch (error) {
    logger.error('Failed to enhance note', error, {
      userId: req.user?.id,
      noteId: req.body?.noteId
    });
    res.status(500).json({ error: 'Failed to enhance content' });
  }
};

const extractNoteActions = async (req, res) => {
  try {
    const { noteId, content } = req.body;
    const userId = req.user.id;

    logger.debug('Extract note actions request received', {
      userId,
      noteId: noteId || 'none',
      contentLength: content?.length
    });

    if (!content) {
      logger.warn('Extract actions request missing content', { userId });
      return res.status(400).json({ error: 'Content is required' });
    }

    if (noteId) {
      const note = await prisma.note.findFirst({
        where: { id: noteId, userId }
      });
      if (!note) {
        logger.warn('Note not found for action extraction', { userId, noteId });
        return res.status(404).json({ error: 'Note not found' });
      }
    }

    const actionItems = await aiService.extractActionItems(content);

    logger.info('Action items extracted successfully', {
      userId,
      noteId: noteId || 'new',
      contentLength: content.length,
      actionItemsCount: actionItems?.length || 0
    });

    res.json({
      success: true,
      originalContent: content,
      actionItems,
      noteId: noteId || null
    });

  } catch (error) {
    logger.error('Failed to extract action items', error, {
      userId: req.user?.id,
      noteId: req.body?.noteId
    });
    res.status(500).json({ error: 'Failed to extract action items' });
  }
};

const summarizeNoteManual = async (req, res) => {
  try {
    const { noteId, content } = req.body;
    const userId = req.user.id;

    logger.debug('Manual summarize request received', {
      userId,
      noteId: noteId || 'none',
      contentLength: content?.length
    });

    if (!content) {
      logger.warn('Manual summarize request missing content', { userId });
      return res.status(400).json({ error: 'Content is required' });
    }

    if (noteId) {
      const note = await prisma.note.findFirst({
        where: { id: noteId, userId }
      });
      if (!note) {
        logger.warn('Note not found for manual summarization', { userId, noteId });
        return res.status(404).json({ error: 'Note not found' });
      }
    }

    const summary = await aiService.summarizeContent(content);

    logger.info('Note summarized successfully', {
      userId,
      noteId: noteId || 'new',
      originalLength: content.length,
      summaryLength: summary?.length
    });

    res.json({
      success: true,
      originalContent: content,
      summary,
      noteId: noteId || null
    });

  } catch (error) {
    logger.error('Failed to summarize note manually', error, {
      userId: req.user?.id,
      noteId: req.body?.noteId
    });
    res.status(500).json({ error: 'Failed to summarize content' });
  }
};

const checkAIHealth = async (req, res) => {
  try {
    logger.debug('AI health check requested', { userId: req.user?.id });

    const health = await aiService.checkOllamaHealth();

    logger.info('AI health check completed', {
      status: health.status,
      responseTime: health.responseTime,
      model: health.model
    });

    res.json({
      service: 'AI Service',
      timestamp: new Date().toISOString(),
      ...health
    });
  } catch (error) {
    logger.error('AI health check failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'AI service health check failed' });
  }
};

module.exports = {
  enhanceNote,
  extractNoteActions,
  summarizeNoteManual,
  checkAIHealth
};