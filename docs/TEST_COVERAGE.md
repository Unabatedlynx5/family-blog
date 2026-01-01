You are conducting a thorough test coverage analysis and implementation for an Astro blog website deployed on Cloudflare Workers. This codebase has approximately 29,435 lines of TypeScript code with identified gaps in test coverage.

# PROJECT CONTEXT
- Framework: Astro + Cloudflare Workers
- Database: Cloudflare D1, R2, Durable Objects
- Authentication: JWT (access + refresh tokens)
- Language: TypeScript (strict typing required)
- Secrets Management: Wrangler .dev.vars

# PRIMARY TESTING GOALS
1. **Achieve 80%+ coverage** on critical security paths (auth, database, API routes)
2. **Prevent regressions** from recent security fixes
3. **Cover edge cases** that could lead to security vulnerabilities or cost overruns
4. **Document behavior** through comprehensive test suites

# CRITICAL AREAS REQUIRING COVERAGE

## 1. AUTHENTICATION & AUTHORIZATION
- JWT token generation and validation
- Access token expiration handling
- Refresh token rotation
- Invalid token scenarios
- Missing/malformed authorization headers
- Token tampering detection
- Session hijacking prevention
- Logout and token revocation

## 2. DATABASE OPERATIONS (D1)
- Parameterized query validation
- SQL injection attempt handling
- Transaction rollback scenarios
- Concurrent access patterns
- Database connection failures
- Query timeout handling
- Data validation before writes
- Cascade delete operations
- Migration edge cases

## 3. API ROUTES & ENDPOINTS
- Authentication middleware on protected routes
- Input validation (valid, invalid, malicious inputs)
- Rate limiting enforcement
- CORS policy enforcement
- Request payload size limits
- Error response formats (no information leakage)
- Status code accuracy
- Content-Type validation

## 4. RATE LIMITING & COST PREVENTION
- Rate limit enforcement per endpoint
- Rate limit reset behavior
- Multiple concurrent requests handling
- Distributed rate limiting (Durable Objects)
- IP-based vs token-based limiting
- Rate limit bypass attempt detection
- Graceful degradation under load

## 5. R2 STORAGE OPERATIONS
- File upload validation (size, type, content)
- Unauthorized access prevention
- Object lifecycle management
- Presigned URL generation and expiration
- Concurrent upload handling
- Storage quota enforcement
- Malicious file upload prevention

## 6. DURABLE OBJECTS
- State persistence and recovery
- Concurrent request handling
- Alarm scheduling and execution
- Memory cleanup and garbage collection
- Network partition handling
- Rate limiting state consistency

## 7. ERROR HANDLING
- Graceful degradation scenarios
- Error message sanitization
- Stack trace prevention in production
- Retry logic for transient failures
- Circuit breaker behavior
- Timeout handling

## 8. INPUT VALIDATION & SANITIZATION
- XSS prevention in user content
- Markdown/HTML sanitization
- File upload validation
- Query parameter validation
- JSON payload validation
- URL validation and sanitization

# TESTING FRAMEWORK ASSESSMENT

## BEFORE STARTING
Analyze and document:
1. **Current Testing Setup**:
   - What test framework is currently used? (Vitest, Jest, Mocha, etc.)
   - What assertion library? (expect, chai, etc.)
   - What mocking utilities? (MSW, sinon, etc.)
   - Current test structure and conventions

2. **Current Coverage**:
   - Run coverage report and analyze gaps
   - Identify completely untested modules
   - Identify partially tested critical paths
   - Calculate current coverage percentage

3. **Testing Gaps**:
   - Which critical paths have zero tests?
   - Which edge cases are not covered?
   - Which error scenarios are not tested?
   - Which security-critical code lacks tests?

# IMPLEMENTATION PLAN

## PHASE 1: ASSESSMENT & SETUP (Day 1)
1. Read and understand `copilot-instructions.md`
2. Create a new branch: `test-coverage-enhancement-[date]`
3. Analyze current test setup and coverage
4. Document testing strategy and priorities
5. Ask clarifying questions before proceeding

## PHASE 2: CRITICAL PATH COVERAGE (Week 1)
**Target**: 80%+ coverage on security-critical code

### Authentication Tests (Priority 1)
- [ ] JWT token lifecycle tests
- [ ] Token validation edge cases
- [ ] Refresh token rotation
- [ ] Unauthorized access attempts
- [ ] Token expiration scenarios

### Database Security Tests (Priority 2)
- [ ] SQL injection prevention tests
- [ ] Parameterized query validation
- [ ] Transaction integrity tests
- [ ] Database error handling

### API Security Tests (Priority 3)
- [ ] Protected endpoint authentication
- [ ] Input validation for all endpoints
- [ ] Rate limiting enforcement
- [ ] Error response sanitization

## PHASE 3: COMPREHENSIVE COVERAGE (Week 2-3)
**Target**: 70%+ overall coverage

### R2 Storage Tests
- [ ] Upload validation (size, type, content)
- [ ] Access control tests
- [ ] Presigned URL tests
- [ ] Storage quota tests

### Durable Objects Tests
- [ ] State persistence tests
- [ ] Concurrent access tests
- [ ] Alarm functionality tests
- [ ] Rate limiting state tests

### Rate Limiting Tests
- [ ] Per-endpoint limit tests
- [ ] Distributed limiting tests
- [ ] Limit reset behavior
- [ ] Bypass attempt detection

### Error Handling Tests
- [ ] All error code paths
- [ ] Error message sanitization
- [ ] Retry logic tests
- [ ] Timeout scenarios

## PHASE 4: EDGE CASES & INTEGRATION (Week 4)
**Target**: Cover remaining edge cases

- [ ] Boundary value tests
- [ ] Race condition tests
- [ ] Network failure simulations
- [ ] Load testing scenarios
- [ ] Integration test suites
- [ ] End-to-end critical flows

## PHASE 5: MAINTENANCE & DOCUMENTATION (Ongoing)
- [ ] Document testing patterns and conventions
- [ ] Create test templates for common scenarios
- [ ] Set up CI/CD coverage gates
- [ ] Document known limitations
- [ ] Create testing best practices guide

# TEST STRUCTURE & CONVENTIONS

## Test Organization
```
src/
├── __tests__/
│   ├── unit/           # Unit tests for individual functions
│   ├── integration/    # Integration tests for modules
│   ├── e2e/           # End-to-end tests for critical flows
│   ├── fixtures/      # Test data and mocks
│   └── helpers/       # Test utilities and helpers
```

## Test Naming Convention
```typescript
describe('[Component/Module Name]', () => {
  describe('[Function/Method Name]', () => {
    it('should [expected behavior] when [condition]', () => {
      // Test implementation
    });
    
    it('should throw [error type] when [invalid condition]', () => {
      // Test implementation
    });
  });
});
```

## Mock Strategy
- Mock external dependencies (D1, R2, Durable Objects)
- Use real implementations for critical security logic
- Create reusable mock factories
- Document mock limitations

# OUTPUT FORMAT

Provide a **structured report** with the following format:

## COVERAGE ANALYSIS REPORT

### Current State
- **Overall Coverage**: X%
- **Critical Path Coverage**: X%
- **Untested Files**: X files
- **Partially Tested Files**: X files

### Coverage by Category
| Category | Current % | Target % | Status |
|----------|-----------|----------|--------|
| Authentication | X% | 90% | 🔴/🟡/🟢 |
| Database Operations | X% | 85% | 🔴/🟡/🟢 |
| API Routes | X% | 85% | 🔴/🟡/🟢 |
| Rate Limiting | X% | 90% | 🔴/🟡/🟢 |
| R2 Operations | X% | 75% | 🔴/🟡/🟢 |
| Durable Objects | X% | 80% | 🔴/🟡/🟢 |
| Error Handling | X% | 70% | 🔴/🟡/🟢 |
| Input Validation | X% | 85% | 🔴/🟡/🟢 |

### Critical Gaps
1. **[Module/Component Name]**
   - Current Coverage: X%
   - Risk Level: CRITICAL/HIGH/MEDIUM
   - Missing Tests: [List specific scenarios]

## TEST IMPLEMENTATION

For each test suite created, provide:

### [Category] - [Component/Module Name]
**File**: `__tests__/[category]/[component].test.ts`
**Coverage Added**: +X%
**Tests Implemented**: X tests

```typescript
// Show the complete test suite with examples
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('JWT Authentication', () => {
  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      // Test implementation
    });
    
    it('should reject an expired token', async () => {
      // Test implementation
    });
    
    it('should reject a tampered token', async () => {
      // Test implementation
    });
  });
});
```

**Scenarios Covered**:
- ✅ Valid token validation
- ✅ Expired token rejection
- ✅ Tampered token detection
- ✅ Missing token handling
- ✅ Malformed token handling

**Edge Cases**:
- Token expiration boundary (exactly at expiry time)
- Concurrent token validation requests
- Invalid signature algorithms

---

# TESTING BEST PRACTICES

## 1. Test Security-Critical Code First
Prioritize tests for:
- Authentication and authorization
- Input validation and sanitization
- Database queries (SQL injection prevention)
- Rate limiting

## 2. Use AAA Pattern (Arrange, Act, Assert)
```typescript
it('should reject invalid JWT token', async () => {
  // Arrange: Set up test data and mocks
  const invalidToken = 'invalid.jwt.token';
  
  // Act: Execute the function being tested
  const result = await validateToken(invalidToken);
  
  // Assert: Verify the expected outcome
  expect(result).toBe(null);
  expect(logSpy).toHaveBeenCalledWith('Invalid token');
});
```

## 3. Test Happy Path AND Error Paths
- Valid inputs (happy path)
- Invalid inputs (error handling)
- Boundary values
- Edge cases
- Race conditions

## 4. Mock External Dependencies
- D1 database calls
- R2 storage operations
- Durable Objects
- External API calls
- Time-dependent functions

## 5. Use Descriptive Test Names
- Start with "should"
- Describe the expected behavior
- Include the condition/context
- Example: "should return 429 when rate limit is exceeded"

## 6. Keep Tests Independent
- Each test should run in isolation
- Use `beforeEach` for setup
- Use `afterEach` for cleanup
- Don't rely on test execution order

## 7. Test One Thing Per Test
- Each test should verify one specific behavior
- Makes failures easier to diagnose
- Improves test maintainability

# COVERAGE GATES

Set up the following coverage requirements:

```json
{
  "coverageThreshold": {
    "global": {
      "branches": 70,
      "functions": 80,
      "lines": 75,
      "statements": 75
    },
    "./src/auth/**": {
      "branches": 90,
      "functions": 95,
      "lines": 90,
      "statements": 90
    },
    "./src/api/**": {
      "branches": 85,
      "functions": 90,
      "lines": 85,
      "statements": 85
    },
    "./src/db/**": {
      "branches": 85,
      "functions": 90,
      "lines": 85,
      "statements": 85
    }
  }
}
```

# BEFORE YOU START

Please confirm you understand the task and ask any clarifying questions about:

1. **Testing Framework**:
   - What test framework should I use? (Vitest recommended for Vite/Astro)
   - Are there existing test utilities or helpers?
   - What's the current test command? (`npm test`, `npm run test:coverage`)

2. **Mocking Strategy**:
   - How should I mock D1 database calls?
   - How should I mock R2 operations?
   - How should I mock Durable Objects?
   - Are there existing mock utilities?

3. **Testing Environment**:
   - How do I run tests locally?
   - How are environment variables handled in tests?
   - Are there test-specific configurations?

4. **Coverage Goals**:
   - Are the coverage targets (80% critical, 70% overall) acceptable?
   - Should any specific modules have higher coverage requirements?
   - Are there any modules that can have lower coverage?

5. **CI/CD Integration**:
   - Should tests run on every commit?
   - Should coverage gates block PRs?
   - Where should coverage reports be published?

6. **Edge Cases & Limitations**:
   - Are there known untestable scenarios?
   - Are there third-party dependencies that are hard to test?
   - Are there any performance testing requirements?

7. **Documentation**:
   - Should I create a testing guide/README?
   - Should I document testing patterns and conventions?
   - Should I create test templates for future use?

Once I answer your questions, proceed with:
1. Coverage analysis and gap identification
2. Test implementation starting with critical paths
3. Progress updates using the format below

# PROGRESS TRACKING

As you work, provide updates in this format:

**Phase X Progress**: [X/Y test suites completed] | Coverage: X% → Y%

**Completed Test Suites**:
- ✅ **Auth - JWT Validation** (+12% coverage)
  - 15 tests: token validation, expiration, tampering
  - File: `__tests__/unit/auth/jwt.test.ts`

- ✅ **DB - Query Parameterization** (+8% coverage)
  - 10 tests: SQL injection prevention, edge cases
  - File: `__tests__/unit/db/queries.test.ts`

**In Progress**:
- 🚧 **API - Rate Limiting** (5/12 tests complete)
  - ETA: End of day
  - Blocked on: Durable Objects mocking strategy

**Upcoming**:
- ⏳ R2 - Upload Validation (12 tests planned)
- ⏳ API - Input Validation (18 tests planned)

**Questions/Blockers**:
- ❓ How should I handle Durable Objects in tests? Mock or integration?
- ⚠️ D1 database mocking is slow - should I use in-memory SQLite?

Ready to begin? Ask your clarifying questions now.