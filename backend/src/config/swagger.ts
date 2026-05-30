import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import type { Express } from 'express';

export function setupSwagger(app: Express): void {
  try {
    const swaggerPath = path.join(__dirname, '../../openapi.yaml');
    const swaggerFile = fs.readFileSync(swaggerPath, 'utf8');
    const swaggerSpec = yaml.parse(swaggerFile);

    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        url: '/openapi.yaml',
      },
    }));

    app.get('/openapi.yaml', (_req, res) => {
      res.type('application/yaml').send(swaggerFile);
    });
  } catch (err) {
    console.error('Failed to load OpenAPI spec:', err);
  }
}
