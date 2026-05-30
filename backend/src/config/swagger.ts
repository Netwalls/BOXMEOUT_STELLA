import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { getEnv } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BOXMEOUT API',
      version: '1.0.0',
      description: 'Decentralized boxing prediction market API',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

let _spec: object | null = null;

function getSpec(): object {
  if (!_spec) _spec = swaggerJsdoc(options);
  return _spec;
}

export function setupSwagger(app: Express): void {
  const env = getEnv();
  const enabled = env.NODE_ENV === 'development' || env.ENABLE_SWAGGER;
  if (!enabled) return;

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(getSpec()));
  app.get('/docs/openapi.json', (_req, res) => res.json(getSpec()));
}
