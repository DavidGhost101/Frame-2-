const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Rent A Room Soweto - Production REST API',
    version: '1.0.0',
    description: 'Scalable, modular, and secure backend REST API for township room listings, OTP landlord verification, room seekers, AI market advisory, and administrative management.'
  },
  servers: [
    {
      url: '/',
      description: 'Active Application Server'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'System health check',
        responses: {
          200: {
            description: 'System is healthy and operational'
          }
        }
      }
    },
    '/api/auth/request-otp': {
      post: {
        summary: 'Request OTP verification code for landlord registration/login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  phone: { type: 'string', example: '0821234567' }
                },
                required: ['phone']
              }
            }
          }
        },
        responses: {
          200: { description: 'OTP sent' }
        }
      }
    },
    '/api/auth/verify-otp': {
      post: {
        summary: 'Verify OTP code and authenticate',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  phone: { type: 'string', example: '0821234567' },
                  otp: { type: 'string', example: '123456' },
                  fullName: { type: 'string', example: 'Sipho Ndlovu' }
                },
                required: ['phone', 'otp']
              }
            }
          }
        },
        responses: {
          200: { description: 'Authenticated with JWT token' }
        }
      }
    },
    '/api/listings': {
      get: {
        summary: 'Get paginated and filtered room listings',
        parameters: [
          { name: 'suburb', in: 'query', schema: { type: 'string' } },
          { name: 'propertyType', in: 'query', schema: { type: 'string' } },
          { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }
        ],
        responses: {
          200: { description: 'Listings retrieved successfully' }
        }
      },
      post: {
        summary: 'Create a new room listing',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  suburb: { type: 'string' },
                  address: { type: 'string' },
                  monthlyRent: { type: 'number' },
                  propertyType: { type: 'string' },
                  amenities: { type: 'array', items: { type: 'string' } },
                  image: { type: 'string' }
                },
                required: ['title', 'suburb', 'address', 'monthlyRent']
              }
            }
          }
        },
        responses: {
          201: { description: 'Listing created' }
        }
      }
    },
    '/api/room-requests': {
      get: {
        summary: 'Get tenant room requests',
        parameters: [
          { name: 'suburb', in: 'query', schema: { type: 'string' } },
          { name: 'roomType', in: 'query', schema: { type: 'string' } },
          { name: 'maxBudget', in: 'query', schema: { type: 'number' } }
        ],
        responses: {
          200: { description: 'Room requests retrieved' }
        }
      },
      post: {
        summary: 'Post a room request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  seekerName: { type: 'string' },
                  phone: { type: 'string' },
                  suburb: { type: 'string' },
                  maxBudget: { type: 'number' },
                  roomType: { type: 'string' },
                  notes: { type: 'string' }
                },
                required: ['seekerName', 'phone', 'suburb', 'maxBudget']
              }
            }
          }
        },
        responses: {
          201: { description: 'Room request posted' }
        }
      }
    },
    '/api/ai/advisor': {
      post: {
        summary: 'Ask AI Housing Advisor about Soweto market pricing, areas, and tenant advice',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'What is the average price for an ensuite in Dobsonville?' }
                },
                required: ['message']
              }
            }
          }
        },
        responses: {
          200: { description: 'AI Advice generated' }
        }
      }
    },
    '/api/admin/stats': {
      get: {
        summary: 'Get platform analytics & metrics',
        security: [{ adminAuth: [] }],
        responses: {
          200: { description: 'Dashboard stats' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      adminAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-admin-key'
      }
    }
  }
};

router.get('/docs.json', (req, res) => res.json(openApiSpec));
router.use('/', swaggerUi.serve, swaggerUi.setup(openApiSpec));

module.exports = router;
