const path = require('path')
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Notes API - Notion + Trello Hybrid',
      version: '1.0.0',
      description: 'A hybrid Notion-like notes and Trello-like tasks application with AI integration and real-time collaboration',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },

      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmgaun53c0000aaoeugnc62ot' },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', example: 'john@example.com' },
            createdAt: { type: 'string', format: 'date-time', example: '2025-10-03T12:57:37.417Z' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Validation failed' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  msg: { type: 'string' },
                  param: { type: 'string' },
                  location: { type: 'string' }
                }
              }
            }
          }
        },
        Note: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmgg44ztd0002quwpneqhbsnu' },
            title: { type: 'string', example: 'My First AI Note' },
            content: { type: 'string', example: 'This is the note content...' },
            aiSummary: { type: 'string', example: 'AI generated summary...' },
            aiTags: {
              type: 'array',
              items: { type: 'string' },
              example: ['tag1', 'tag2', 'tag3']
            },
            contentType: { type: 'string', enum: ['text', 'richText'], example: 'text' },
            isPublic: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmgg4ugxi00011hrf5moqm75y' },
            title: { type: 'string', example: 'Complete project documentation' },
            description: { type: 'string', example: 'Write comprehensive documentation' },
            status: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'], example: 'TODO' },
            deadline: { type: 'string', format: 'date-time', example: '2024-12-31T23:59:59.000Z' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User registration and login'
      },
      {
        name: 'Notes',
        description: 'Notion-like notes with AI processing'
      },
      {
        name: 'AI',
        description: 'AI-powered features using local Ollama'
      },
      {
        name: 'Tasks',
        description: 'Trello-like task management'
      },
      {
        name: 'Sharing',
        description: 'Note collaboration and sharing'
      }
    ]
  },
  apis: [path.join(__dirname, '../routes/*.js')],
};

const specs = swaggerJsdoc(options);

console.log(' Swagger looking for routes in:', './routes/*.js');
console.log(' Swagger spec generated:', Object.keys(specs.paths || {}).length, 'paths found');

module.exports = { swaggerUi, specs };