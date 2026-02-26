#!/usr/bin/env tsx
/**
 * Test script to validate Swagger/OpenAPI documentation
 * 
 * Usage: npm run test:swagger
 */

import { swaggerSpec } from '../src/config/swagger.js';

console.log('🔍 Validating Swagger/OpenAPI Specification...\n');

let hasErrors = false;

// Check basic structure
if (!swaggerSpec.openapi) {
  console.error('❌ Missing OpenAPI version');
  hasErrors = true;
} else {
  console.log(`✅ OpenAPI version: ${swaggerSpec.openapi}`);
}

if (!swaggerSpec.info) {
  console.error('❌ Missing API info');
  hasErrors = true;
} else {
  console.log(`✅ API Title: ${swaggerSpec.info.title}`);
  console.log(`✅ API Version: ${swaggerSpec.info.version}`);
}

// Check servers
if (!swaggerSpec.servers || swaggerSpec.servers.length === 0) {
  console.error('❌ No servers defined');
  hasErrors = true;
} else {
  console.log(`✅ Servers defined: ${swaggerSpec.servers.length}`);
  swaggerSpec.servers.forEach((server: any) => {
    console.log(`   - ${server.description}: ${server.url}`);
  });
}

// Check security schemes
if (!swaggerSpec.components?.securitySchemes) {
  console.error('❌ No security schemes defined');
  hasErrors = true;
} else {
  const schemes = Object.keys(swaggerSpec.components.securitySchemes);
  console.log(`✅ Security schemes: ${schemes.join(', ')}`);
}

// Check schemas
if (!swaggerSpec.components?.schemas) {
  console.error('❌ No schemas defined');
  hasErrors = true;
} else {
  const schemaCount = Object.keys(swaggerSpec.components.schemas).length;
  console.log(`✅ Schemas defined: ${schemaCount}`);
  
  // List key schemas
  const keySchemas = [
    'User',
    'Market',
    'Trade',
    'Prediction',
    'AuthResponse',
    'ErrorResponse',
    'WebSocketEvent',
    'OddsChangedEvent',
  ];
  
  const missingSchemas = keySchemas.filter(
    (schema) => !swaggerSpec.components.schemas[schema]
  );
  
  if (missingSchemas.length > 0) {
    console.warn(`⚠️  Missing key schemas: ${missingSchemas.join(', ')}`);
  } else {
    console.log('✅ All key schemas present');
  }
}

// Check paths
if (!swaggerSpec.paths || Object.keys(swaggerSpec.paths).length === 0) {
  console.error('❌ No API paths defined');
  hasErrors = true;
} else {
  const pathCount = Object.keys(swaggerSpec.paths).length;
  console.log(`✅ API paths defined: ${pathCount}`);
  
  // Count methods
  let methodCount = 0;
  Object.values(swaggerSpec.paths).forEach((path: any) => {
    methodCount += Object.keys(path).length;
  });
  console.log(`✅ Total endpoints: ${methodCount}`);
}

// Check tags
if (!swaggerSpec.tags || swaggerSpec.tags.length === 0) {
  console.warn('⚠️  No tags defined');
} else {
  console.log(`✅ Tags defined: ${swaggerSpec.tags.length}`);
  swaggerSpec.tags.forEach((tag: any) => {
    console.log(`   - ${tag.name}: ${tag.description}`);
  });
}

// Check WebSocket documentation
const hasWebSocketDocs = swaggerSpec.info.description?.includes('WebSocket API');
if (hasWebSocketDocs) {
  console.log('✅ WebSocket documentation included');
} else {
  console.warn('⚠️  WebSocket documentation not found');
}

// Check WebSocket event schemas
const wsEventSchemas = [
  'WebSocketEvent',
  'OddsChangedEvent',
  'MarketUpdatedEvent',
  'TradeExecutedEvent',
  'MarketResolvedEvent',
];

const missingWsSchemas = wsEventSchemas.filter(
  (schema) => !swaggerSpec.components?.schemas?.[schema]
);

if (missingWsSchemas.length === 0) {
  console.log('✅ All WebSocket event schemas present');
} else {
  console.warn(`⚠️  Missing WebSocket schemas: ${missingWsSchemas.join(', ')}`);
}

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
  console.error('❌ Validation failed with errors');
  process.exit(1);
} else {
  console.log('✅ Swagger/OpenAPI specification is valid!');
  console.log('\n📚 Documentation available at:');
  console.log('   - Swagger UI: http://localhost:3000/api-docs');
  console.log('   - OpenAPI JSON: http://localhost:3000/api-docs.json');
  console.log('   - Markdown: backend/API_DOCUMENTATION.md');
  process.exit(0);
}
