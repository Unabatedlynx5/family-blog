# Testing Guide

This document describes the test suite for the family blog project.

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (for development)
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

## Test Structure

The test suite is organized into the following files:

### `tests/auth.test.js`
Tests for authentication functionality:
- User creation (admin-only)
- Login flow
- Token refresh
- Logout
- Password hashing
- JWT token creation and verification

### `tests/admin-users.test.js`
Tests for admin user management:
- Listing users with pagination and filtering
- Creating new users
- Deleting users
- Admin authorization checks

### `tests/posts.test.js`
Tests for post creation and retrieval:
- Creating posts with authentication
- Listing posts
- Authorization checks
- Media references handling

### `tests/posts-pagination.test.js`
Tests for posts pagination:
- Verifies GET /api/posts pagination logic
- Checks limit, offset, and total counts

### `tests/media.test.js`
Tests for media upload functionality:
- File upload to R2
- Authorization checks
- Content-type validation
- Metadata storage in D1

### `tests/feed.test.js`
Tests for the feed endpoint:
- Fetching posts with user information
- Pagination
- Media refs parsing
- Cursor-based pagination

### `tests/chat.test.js`
Tests for the GlobalChat Durable Object:
- WebSocket connection handling
- Message broadcasting
- Socket management
- Message persistence

### `tests/integration.test.js`
Integration tests covering:
- Complete user flows
- Security validations
- Data validation
- Error handling
- Performance scenarios

## Test Coverage

The test suite aims to cover:

✅ **Authentication & Authorization**
- Admin user creation
- Login/logout flows
- Token refresh and rotation
- JWT validation
- Secure cookie handling

✅ **Data Validation**
- Email format validation
- Password requirements
- Required field checks
- JSON parsing errors

✅ **API Endpoints**
- All POST/GET endpoints
- Error responses
- Content-Type headers
- Status codes

✅ **Security**
- Password hashing (bcrypt)
- Refresh token hashing (SHA-256)
- Authorization checks
- No sensitive data leakage

✅ **Data Integrity**
- Media metadata storage
- JSON serialization
- Database operations

## Mock Environment

Tests use mock implementations for:
- **D1 Database**: In-memory mock that simulates D1 operations
- **R2 Storage**: Map-based mock for file storage
- **Environment Variables**: Test-specific JWT secrets and API keys

## Writing New Tests

When adding new features, please:

1. Create tests before or alongside implementation
2. Follow the existing test structure
3. Use descriptive test names: `it('should reject login with invalid credentials')`
4. Mock external dependencies (DB, R2, etc.)
5. Test both success and error cases
6. Ensure tests are isolated and don't depend on each other

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:

```bash
# In your CI pipeline
npm install
npm test
```

## Known Limitations

- Tests use mocks instead of real D1/R2 (for speed and isolation)
- WebSocket tests are limited due to environment constraints
- Some integration tests are placeholders for future implementation

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Test Durable Objects with Miniflare
- [ ] Add load testing
- [ ] Integration with real D1 local database
- [ ] Test WebSocket connections more thoroughly
