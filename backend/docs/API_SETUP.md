# API Documentation Setup Guide

## Overview

The BoxMeOut Stella API includes comprehensive OpenAPI/Swagger documentation that is automatically generated from JSDoc comments in the codebase.

## Accessing Documentation

### Swagger UI (Interactive)

Once the server is running, access the interactive API documentation at:

```
http://localhost:3000/api-docs
```

Features:
- Browse all endpoints organized by tags
- View request/response schemas
- Try out API calls directly from the browser
- See authentication requirements
- View WebSocket event documentation

### OpenAPI Spec (JSON)

The raw OpenAPI specification is available at:

```
http://localhost:3000/api-docs.json
```

Use this for:
- Generating client SDKs
- Importing into API testing tools (Postman, Insomnia)
- CI/CD validation
- Third-party integrations

### Markdown Documentation

A comprehensive markdown guide is available at:

```
backend/API_DOCUMENTATION.md
```

## Documentation Structure

### 1. OpenAPI Configuration

Location: `backend/src/config/swagger.ts`

This file contains:
- API metadata (title, version, description)
- Server configurations (dev, staging, production)
- Security schemes (Bearer JWT, Stellar Auth)
- Reusable schemas for all data models
- Standard response formats
- WebSocket event schemas

### 2. Route Documentation

Each route file includes JSDoc comments with OpenAPI annotations:

- `backend/src/routes/auth.routes.ts` - Authentication endpoints
- `backend/src/routes/markets.routes.ts` - Market management
- `backend/src/routes/trading.ts` - Trading operations
- `backend/src/routes/oracle.ts` - Oracle and resolution
- `backend/src/routes/treasury.routes.ts` - Treasury operations

### 3. WebSocket Documentation

WebSocket events are documented in the swagger config with:
- Event schemas
- Connection examples
- Subscribe/unsubscribe patterns
- Event type descriptions

## Adding New Endpoints

When adding a new endpoint, follow this pattern:

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   post:
 *     summary: Brief description
 *     description: Detailed description
 *     tags: [TagName]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ParameterName'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SchemaName'
 *     responses:
 *       200:
 *         description: Success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ResponseSchema'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/your-endpoint', requireAuth, (req, res) =>
  controller.yourMethod(req, res)
);
```

## Adding New Schemas

Add reusable schemas in `backend/src/config/swagger.ts`:

```typescript
YourSchema: {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 3, maxLength: 100 },
    status: {
      type: 'string',
      enum: ['ACTIVE', 'INACTIVE'],
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'status'],
},
```

## Tags

Current API tags:
- `Authentication` - User authentication and sessions
- `Markets` - Market creation and management
- `Trading` - Share trading operations
- `Oracle` - Market resolution and attestations
- `Treasury` - Treasury and reward distribution
- `Health` - Health checks and monitoring

## Testing the Documentation

### 1. Start the Server

```bash
cd backend
npm run dev
```

### 2. Open Swagger UI

Navigate to `http://localhost:3000/api-docs`

### 3. Test Authentication Flow

1. Click on "Authentication" tag
2. Try the `/api/auth/challenge` endpoint
3. Use the response to test `/api/auth/login`
4. Click "Authorize" button and enter the access token
5. Test protected endpoints

### 4. Validate OpenAPI Spec

```bash
# Install validator
npm install -g @apidevtools/swagger-cli

# Validate spec
swagger-cli validate http://localhost:3000/api-docs.json
```

## Generating Client SDKs

### TypeScript/JavaScript

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api-docs.json \
  -g typescript-axios \
  -o ./generated/typescript-client
```

### Python

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/api-docs.json \
  -g python \
  -o ./generated/python-client
```

### Other Languages

OpenAPI Generator supports 50+ languages. See: https://openapi-generator.tech/docs/generators

## Customization

### Swagger UI Theme

Modify the `customCss` in `backend/src/config/swagger.ts` to customize the appearance.

### API Description

Update the `info.description` field in the swagger options to modify the main documentation page.

### Server URLs

Add or modify server configurations in the `servers` array:

```typescript
servers: [
  {
    url: 'http://localhost:3000',
    description: 'Development server',
  },
  {
    url: 'https://api.boxmeout.com',
    description: 'Production server',
  },
],
```

## Best Practices

### 1. Keep Schemas DRY

Use `$ref` to reference reusable schemas instead of duplicating definitions.

### 2. Document All Fields

Include descriptions for all schema properties to help API consumers.

### 3. Provide Examples

Add example values to make the documentation more useful:

```typescript
properties: {
  email: {
    type: 'string',
    format: 'email',
    example: 'user@example.com',
  },
}
```

### 4. Document Error Responses

Always document possible error responses for each endpoint.

### 5. Use Standard HTTP Status Codes

- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 409: Conflict
- 429: Too Many Requests
- 500: Internal Server Error

## Troubleshooting

### Documentation Not Updating

1. Restart the server
2. Clear browser cache
3. Check for syntax errors in JSDoc comments

### Schemas Not Appearing

1. Verify schema is defined in `swagger.ts`
2. Check for typos in `$ref` paths
3. Ensure proper nesting in components.schemas

### Routes Not Showing

1. Verify JSDoc comment format
2. Check that route file is in the `apis` array
3. Ensure proper indentation in YAML-like JSDoc

## Maintenance

### Regular Updates

- Update API version when making breaking changes
- Keep examples current with actual API behavior
- Document new endpoints as they're added
- Update WebSocket events when adding new event types

### Version Control

- Commit swagger config changes with route changes
- Tag releases with API version numbers
- Maintain changelog for API changes

## Resources

- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger JSDoc](https://github.com/Surnet/swagger-jsdoc)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [OpenAPI Generator](https://openapi-generator.tech/)
