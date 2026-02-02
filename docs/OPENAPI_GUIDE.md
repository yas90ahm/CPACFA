# OpenAPI / Swagger Documentation Guide

## Overview

FinOS API includes comprehensive OpenAPI 3.0 documentation generated automatically from your Zod validation schemas. This ensures your API documentation is always in sync with your actual validation rules.

## Features

✅ **Auto-Generated** - Documentation generated from Zod schemas
✅ **Interactive** - Try out endpoints directly in the browser
✅ **Always Current** - Schemas are the single source of truth
✅ **Type-Safe** - Full TypeScript integration
✅ **JWT Auth** - Built-in authentication testing
✅ **Filtering** - Search and filter endpoints
✅ **Examples** - Request/response examples for all endpoints

## Accessing Documentation

### Option 1: Swagger UI (Interactive)
Start the server and visit:
```
http://localhost:3000/api-docs
```

### Option 2: Raw OpenAPI Spec (JSON)
```
http://localhost:3000/api-docs.json
```

### Option 3: Generate Static File
```bash
npm run generate:openapi
```

This creates `docs/openapi.json` which can be used with:
- Swagger Editor
- Postman (Import)
- API testing tools
- Code generators

## Usage in app.ts

Add to your Express app:

```typescript
import { setupSwaggerUI } from './middleware/swaggerSetup.js';

// After setting up routes
setupSwaggerUI(app);
```

## Testing Authenticated Endpoints

1. Visit `/api-docs`
2. Click "Authorize" button (top right)
3. Enter your JWT token: `Bearer YOUR_TOKEN_HERE`
4. Click "Authorize"
5. All subsequent requests will include the token

## API Structure

### CPA Routes (GAAP/IFRS)
- **Stock Compensation** - `/api/stock-comp/*`
- **Deferred Tax** - `/api/deferred-tax/*`
- **Impairment** - `/api/impairment/*`
- **Business Combinations** - `/api/business-combination/*`
- **Equity Method** - `/api/equity-method/*`
- **Revenue Recognition** - `/api/revenue-recognition/*`
- **Segment Reporting** - `/api/segment-reporting/*`
- **Month-End Close** - `/api/close/*`
- **Trial Balance** - `/api/trial-balance/*`

### CFA Routes (Valuation)
- **DCF Valuation** - `/api/valuation/dcf/*`
- **Comps** - `/api/valuation/comps/*`
- **Precedent Transactions** - `/api/valuation/precedent/*`
- **Portfolio** - `/api/valuation/portfolio/*`

### Audit Routes
- **DRL/PBC** - `/api/audit/*`

## Benefits

### For Developers
- See exact request/response formats
- Test endpoints without writing code
- Understand validation rules
- Export to Postman/Insomnia

### For API Consumers
- Self-service documentation
- Always up-to-date
- Interactive testing
- Code generation support

### For Teams
- Single source of truth
- No doc drift
- Easy onboarding
- Clear contracts

## Customization

Edit `scripts/generateOpenAPI.ts` to:
- Add more route definitions
- Customize descriptions
- Add examples
- Configure security schemes
- Adjust tags/grouping

## Integration with Tools

### Postman
1. Get JSON spec: `http://localhost:3000/api-docs.json`
2. In Postman: File > Import > Paste Link
3. All routes imported with validation

### VS Code REST Client
```http
### Get all DCF models
GET http://localhost:3000/api/valuation/dcf
Authorization: Bearer {{token}}
```

### curl
```bash
curl -X POST http://localhost:3000/api/valuation/dcf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"companyName": "Test", "cashFlows": [100,110,120], "wacc": 0.10, "terminalGrowthRate": 0.03}'
```

## Schema Coverage

All major schemas are documented:
- ✅ 15 domain schema files
- ✅ 132 Zod schemas
- ✅ All validation rules
- ✅ Field-level descriptions
- ✅ Type information
- ✅ Required vs optional fields
- ✅ Constraints (min/max, patterns)

## Next Steps

1. **Add to CI/CD**: Generate docs on every deployment
2. **Publish**: Host static docs site
3. **Version**: Track API changes across versions
4. **Monitor**: Track which endpoints are most used
5. **Feedback**: Collect API consumer feedback

## Maintenance

The documentation auto-updates when you:
- Add new Zod schemas
- Modify existing schemas
- Add new routes
- Change validation rules

**No manual doc updates needed!** 🎉
