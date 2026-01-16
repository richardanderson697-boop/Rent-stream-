// ============================================================================
// RentStream API Testing Examples & Postman Collection Generator
// ============================================================================

// ============================================================================
// 1. JEST INTEGRATION TESTS
// ============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';

describe('RentStream API Integration Tests', () => {
  let app: INestApplication;
  let authToken: string;
  let landlordId: string;
  let propertyId: string;
  let unitId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [/* AppModule */],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ========================================
  // Authentication Tests
  // ========================================
  describe('Authentication', () => {
    it('POST /auth/register - should register new landlord', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email: 'test.landlord@example.com',
          password: 'SecurePass123!',
          userType: 'landlord',
          firstName: 'Test',
          lastName: 'Landlord',
          phoneNumber: '+1-555-0100',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('test.landlord@example.com');
      
      authToken = response.body.token;
      landlordId = response.body.user.id;
    });

    it('POST /auth/login - should login with credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'test.landlord@example.com',
          password: 'SecurePass123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      authToken = response.body.token;
    });

    it('POST /auth/login - should fail with invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'test.landlord@example.com',
          password: 'WrongPassword',
        })
        .expect(401);
    });

    it('POST /auth/mfa/enable - should enable MFA', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/mfa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('secret');
    });
  });

  // ========================================
  // Property Tests
  // ========================================
  describe('Properties', () => {
    it('POST /properties - should create new property', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/properties')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Apartment Complex',
          addressLine1: '123 Test Street',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          propertyType: 'apartment',
          yearBuilt: 2020,
          description: 'Modern apartment complex',
          amenities: ['Pool', 'Gym', 'Parking'],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Apartment Complex');
      propertyId = response.body.id;
    });

    it('GET /properties - should list all properties', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/properties')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('GET /properties/:id - should get property details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(propertyId);
      expect(response.body.name).toBe('Test Apartment Complex');
    });

    it('PATCH /properties/:id - should update property', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/properties/${propertyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Updated description',
          amenities: ['Pool', 'Gym', 'Parking', 'Lounge'],
        })
        .expect(200);

      expect(response.body.description).toBe('Updated description');
      expect(response.body.amenities).toHaveLength(4);
    });

    it('POST /properties/:id/units - should create unit', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/properties/${propertyId}/units`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unitNumber: '101',
          squareFootage: 850,
          bedrooms: 2,
          bathrooms: 1,
          rentAmount: 2200.00,
          depositAmount: 2200.00,
          floorNumber: 1,
          hasParking: true,
          petFriendly: true,
        })
        .expect(201);

      expect(response.body.unitNumber).toBe('101');
      unitId = response.body.id;
    });
  });

  // ========================================
  // Maintenance Tests
  // ========================================
  describe('Maintenance', () => {
    let maintenanceRequestId: string;

    it('POST /maintenance-requests - should create request', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/maintenance-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          unitId,
          title: 'Leaking Faucet',
          description: 'Kitchen faucet is dripping',
          category: 'plumbing',
          urgencyLevel: 'medium',
        })
        .expect(201);

      expect(response.body.title).toBe('Leaking Faucet');
      maintenanceRequestId = response.body.id;
    });

    it('GET /maintenance-requests - should list requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/maintenance-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'new', urgency: 'medium' })
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('PATCH /maintenance-requests/:id - should update status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/maintenance-requests/${maintenanceRequestId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'in_progress',
          estimatedCost: 150.00,
        })
        .expect(200);

      expect(response.body.status).toBe('in_progress');
    });

    it('POST /maintenance-requests/:id/comments - should add comment', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/maintenance-requests/${maintenanceRequestId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notes: 'Ordered replacement parts',
        })
        .expect(201);

      expect(response.body.notes).toBe('Ordered replacement parts');
    });
  });

  // ========================================
  // Payment Tests
  // ========================================
  describe('Payments', () => {
    it('GET /payments - should list payments', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'completed', startDate: '2024-01-01' })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('summary');
    });
  });

  // ========================================
  // Analytics Tests
  // ========================================
  describe('Analytics', () => {
    it('GET /analytics/dashboard - should get dashboard stats', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalProperties');
      expect(response.body).toHaveProperty('totalUnits');
      expect(response.body).toHaveProperty('occupancyRate');
    });

    it('GET /analytics/financial-report - should generate report', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/analytics/financial-report')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          format: 'json',
        })
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('totalRevenue');
    });
  });
});

// ============================================================================
// 2. POSTMAN COLLECTION GENERATOR
// ============================================================================

const generatePostmanCollection = () => {
  return {
    info: {
      name: 'RentStream API',
      description: 'Complete API collection for RentStream property management platform',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [
        {
          key: 'token',
          value: '{{authToken}}',
          type: 'string',
        },
      ],
    },
    variable: [
      {
        key: 'baseUrl',
        value: 'http://localhost:3000/v1',
        type: 'string',
      },
      {
        key: 'authToken',
        value: '',
        type: 'string',
      },
      {
        key: 'landlordId',
        value: '',
        type: 'string',
      },
      {
        key: 'propertyId',
        value: '',
        type: 'string',
      },
      {
        key: 'unitId',
        value: '',
        type: 'string',
      },
    ],
    item: [
      {
        name: 'Authentication',
        item: [
          {
            name: 'Register Landlord',
            event: [
              {
                listen: 'test',
                script: {
                  exec: [
                    'if (pm.response.code === 201) {',
                    '    const response = pm.response.json();',
                    '    pm.environment.set("authToken", response.token);',
                    '    pm.environment.set("landlordId", response.user.id);',
                    '}',
                  ],
                },
              },
            ],
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  email: 'landlord@example.com',
                  password: 'SecurePass123!',
                  userType: 'landlord',
                  firstName: 'John',
                  lastName: 'Smith',
                  phoneNumber: '+1-555-0100',
                }, null, 2),
              },
              url: {
                raw: '{{baseUrl}}/auth/register',
                host: ['{{baseUrl}}'],
                path: ['auth', 'register'],
              },
            },
          },
          {
            name: 'Login',
            event: [
              {
                listen: 'test',
                script: {
                  exec: [
                    'if (pm.response.code === 200) {',
                    '    const response = pm.response.json();',
                    '    pm.environment.set("authToken", response.token);',
                    '}',
                  ],
                },
              },
            ],
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  email: 'landlord@example.com',
                  password: 'SecurePass123!',
                }, null, 2),
              },
              url: {
                raw: '{{baseUrl}}/auth/login',
                host: ['{{baseUrl}}'],
                path: ['auth', 'login'],
              },
            },
          },
          {
            name: 'Logout',
            request: {
              method: 'POST',
              header: [],
              url: {
                raw: '{{baseUrl}}/auth/logout',
                host: ['{{baseUrl}}'],
                path: ['auth', 'logout'],
              },
            },
          },
          {
            name: 'Enable MFA',
            request: {
              method: 'POST',
              header: [],
              url: {
                raw: '{{baseUrl}}/auth/mfa/enable',
                host: ['{{baseUrl}}'],
                path: ['auth', 'mfa', 'enable'],
              },
            },
          },
        ],
      },
      {
        name: 'Properties',
        item: [
          {
            name: 'List Properties',
            request: {
              method: 'GET',
              header: [],
              url: {
                raw: '{{baseUrl}}/properties?page=1&limit=20',
                host: ['{{baseUrl}}'],
                path: ['properties'],
                query: [
                  { key: 'page', value: '1' },
                  { key: 'limit', value: '20' },
                ],
              },
            },
          },
          {
            name: 'Create Property',
            event: [
              {
                listen: 'test',
                script: {
                  exec: [
                    'if (pm.response.code === 201) {',
                    '    const response = pm.response.json();',
                    '    pm.environment.set("propertyId", response.id);',
                    '}',
                  ],
                },
              },
            ],
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  name: 'Sunset Apartments',
                  addressLine1: '100 Main Street',
                  city: 'San Francisco',
                  state: 'CA',
                  zipCode: '94102',
                  propertyType: 'apartment',
                  yearBuilt: 2020,
                  description: 'Modern luxury apartments',
                  amenities: ['Pool', 'Gym', 'Parking'],
                }, null, 2),
              },
              url: {
                raw: '{{baseUrl}}/properties',
                host: ['{{baseUrl}}'],
                path: ['properties'],
              },
            },
          },
          {
            name: 'Get Property',
            request: {
              method: 'GET',
              header: [],
              url: {
                raw: '{{baseUrl}}/properties/{{propertyId}}',
                host: ['{{baseUrl}}'],
                path: ['properties', '{{propertyId}}'],
              },
            },
          },
          {
            name: 'Update Property',
            request: {
              method: 'PATCH',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  description: 'Updated description',
                  amenities: ['Pool', 'Gym', 'Parking', 'Concierge'],
                }, null, 2),
              },
              url: {
                raw: '{{baseUrl}}/properties/{{propertyId}}',
                host: ['{{baseUrl}}'],
                path: ['properties', '{{propertyId}}'],
              },
            },
          },
          {
            name: 'Create Unit',
            event: [
              {
                listen: 'test',
                script: {
                  exec: [
                    'if (pm.response.code === 201) {',
                    '    const response = pm.response.json();',
                    '    pm.environment.set("unitId", response.id);',
                    '}',
                  ],
                },
              },
            ],
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  unitNumber: '101',
                  squareFootage: 850,
                  bedrooms: 2,
                  bathrooms: 1,
                  rentAmount: 2200.00,
                  depositAmount: 2200.00,
                  floorNumber: 1,
                  hasParking: true,
                  petFriendly: true,
                }, null, 2),
              },
              url: {
                raw: '{{baseUrl}}/properties/{{propertyId}}/units',
                host: ['{{baseUrl}}'],
                path: ['properties', '{{propertyId}}', 'units'],
              },
            },
          },
        ],
      },
      {
        name: 'Maintenance',
        item: [
          {
            name: 'List Maintenance Requests',
            request: {
              method: 'GET',
              header: [],
              url: {
                raw: '{{baseUrl}}/maintenance-requests?status=new',
                host: ['{{baseUrl}}'],
                path: ['maintenance-requests'],
                query: [{ key: 'status', value: 'new' }],
              },
            },
          },
          {
            name: 'Create Maintenance Request',
            request: {
              method: 'POST',
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  unitId: '{{unitId}}',
                  title: 'Leaking Faucet',
                  description: 'Kitchen faucet is dripping constantly',
                  category: 'plumbing',
                  urgencyLevel: 'medium',
                }, null, 2),
              },
              url: {
                raw: '{{baseUrl}}/maintenance-requests',
                host: ['{{baseUrl}}'],
                path: ['maintenance-requests'],
              },
            },
          },
        ],
      },
      {
        name: 'Payments',
        item: [
          {
            name: 'List Payments',
            request: {
              method: 'GET',
              header: [],
              url: {
                raw: '{{baseUrl}}/payments?status=completed',
                host: ['{{baseUrl}}'],
                path: ['payments'],
                query: [{ key: 'status', value: 'completed' }],
              },
            },
          },
        ],
      },
      {
        name: 'Analytics',
        item: [
          {
            name: 'Get Dashboard',
            request: {
              method: 'GET',
              header: [],
              url: {
                raw: '{{baseUrl}}/analytics/dashboard',
                host: ['{{baseUrl}}'],
                path: ['analytics', 'dashboard'],
              },
            },
          },
          {
            name: 'Financial Report',
            request: {
              method: 'GET',
              header: [],
              url: {
                raw: '{{baseUrl}}/analytics/financial-report?startDate=2024-01-01&endDate=2024-12-31&format=json',
                host: ['{{baseUrl}}'],
                path: ['analytics', 'financial-report'],
                query: [
                  { key: 'startDate', value: '2024-01-01' },
                  { key: 'endDate', value: '2024-12-31' },
                  { key: 'format', value: 'json' },
                ],
              },
            },
          },
        ],
      },
    ],
  };
};

// Save Postman collection to file
const fs = require('fs');
const collection = generatePostmanCollection();
fs.writeFileSync(
  'RentStream_API.postman_collection.json',
  JSON.stringify(collection, null, 2)
);

console.log('✓ Postman collection generated: RentStream_API.postman_collection.json');

// ============================================================================
// 3. CURL EXAMPLES
// ============================================================================

const curlExamples = `
# ============================================================================
# RentStream API - cURL Examples
# ============================================================================

# Set base URL
BASE_URL="http://localhost:3000/v1"

# ----------------------------------------
# Authentication
# ----------------------------------------

# Register new landlord
curl -X POST $BASE_URL/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "landlord@example.com",
    "password": "SecurePass123!",
    "userType": "landlord",
    "firstName": "John",
    "lastName": "Smith",
    "phoneNumber": "+1-555-0100"
  }'

# Login
TOKEN=$(curl -X POST $BASE_URL/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "landlord@example.com",
    "password": "SecurePass123!"
  }' | jq -r '.token')

echo "Auth Token: $TOKEN"

# ----------------------------------------
# Properties
# ----------------------------------------

# Create property
PROPERTY_ID=$(curl -X POST $BASE_URL/properties \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sunset Apartments",
    "addressLine1": "100 Main Street",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94102",
    "propertyType": "apartment",
    "yearBuilt": 2020,
    "description": "Modern luxury apartments",
    "amenities": ["Pool", "Gym", "Parking"]
  }' | jq -r '.id')

echo "Property ID: $PROPERTY_ID"

# List properties
curl -X GET "$BASE_URL/properties?page=1&limit=20" \\
  -H "Authorization: Bearer $TOKEN"

# Get property details
curl -X GET "$BASE_URL/properties/$PROPERTY_ID" \\
  -H "Authorization: Bearer $TOKEN"

# ----------------------------------------
# Units
# ----------------------------------------

# Create unit
UNIT_ID=$(curl -X POST "$BASE_URL/properties/$PROPERTY_ID/units" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "unitNumber": "101",
    "squareFootage": 850,
    "bedrooms": 2,
    "bathrooms": 1,
    "rentAmount": 2200.00,
    "depositAmount": 2200.00,
    "hasParking": true,
    "petFriendly": true
  }' | jq -r '.id')

echo "Unit ID: $UNIT_ID"

# ----------------------------------------
# Maintenance
# ----------------------------------------

# Create maintenance request
curl -X POST $BASE_URL/maintenance-requests \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "unitId": "'$UNIT_ID'",
    "title": "Leaking Faucet",
    "description": "Kitchen faucet is dripping",
    "category": "plumbing",
    "urgencyLevel": "medium"
  }'

# List maintenance requests
curl -X GET "$BASE_URL/maintenance-requests?status=new" \\
  -H "Authorization: Bearer $TOKEN"

# ----------------------------------------
# Analytics
# ----------------------------------------

# Get dashboard
curl -X GET $BASE_URL/analytics/dashboard \\
  -H "Authorization: Bearer $TOKEN"

# Generate financial report
curl -X GET "$BASE_URL/analytics/financial-report?startDate=2024-01-01&endDate=2024-12-31&format=json" \\
  -H "Authorization: Bearer $TOKEN"
`;

fs.writeFileSync('api_curl_examples.sh', curlExamples);
console.log('✓ cURL examples generated: api_curl_examples.sh');

console.log('\n✅ All API testing files generated successfully!');
console.log('\nGenerated files:');
console.log('  - RentStream_API.postman_collection.json');
console.log('  - api_curl_examples.sh');
console.log('\nTo use:');
console.log('  1. Import Postman collection into Postman');
console.log('  2. Set environment variables (baseUrl, authToken)');
console.log('  3. Run requests in sequence');
console.log('  4. Or use curl examples: chmod +x api_curl_examples.sh && ./api_curl_examples.sh');