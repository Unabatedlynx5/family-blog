# Test Coverage Plan

Current coverage is approximately 64%. The goal is to increase this by targeting the following low-coverage areas.

## 1. Authentication (Critical)

### `src/pages/api/auth/refresh.ts` (Current: 8.69%)
- [ ] **Test Valid Refresh**: Send a valid refresh token cookie and verify a new access token is returned.
- [ ] **Test Token Rotation**: Verify that using a refresh token invalidates the old one and issues a new one.
- [ ] **Test Invalid/Expired Token**: Verify 401 response for invalid or expired refresh tokens.
- [ ] **Test Reuse Detection**: (Optional) Verify that reusing a revoked token triggers a security alert or invalidates the chain.

### `src/pages/api/auth/logout.ts` (Current: 16.66%)
- [ ] **Test Logout**: Verify that calling this endpoint clears the `accessToken` and `refresh` cookies.

### `workers/utils/auth.js` (Current: 55.55%)
- [ ] **Test `rotateRefreshToken`**: Unit test this function specifically to ensure it correctly updates the database and returns a new token.

## 2. Feed & Content

### `src/pages/api/feed.ts` (Current: 43.63%)
- [ ] **Test Merging Logic**: Create scenarios with:
    - Only Markdown posts.
    - Only DB posts.
    - Interleaved posts (verify correct date sorting).
- [ ] **Test Pagination Edge Cases**: Test requesting a page that is out of bounds or empty.
- [ ] **Test Error Handling**: Mock `getCollection` failure or DB failure.

## 3. Error Handling & Edge Cases

### `src/pages/api/admin/users.ts`
- [ ] **Test Invalid JSON**: Send malformed JSON to verify 400 response.
- [ ] **Test Missing Fields**: Send partial body to verify validation.
- [ ] **Test DB Errors**: Mock a DB error during insertion to verify 500 response.

### `src/pages/api/posts/index.ts` & `[id].ts`
- [ ] **Test Invalid Media ID**: Try to create a post with a non-existent `media_id`.
- [ ] **Test Unauthorized Access**: Verify 401 when no token is provided (already partially covered, check branches).

### `src/pages/api/media/upload.ts`
- [ ] **Test Large Files**: Mock a file larger than the limit.
- [ ] **Test R2 Errors**: Mock an R2 `put` failure.

## 4. Integration Tests
- [ ] **Full Auth Cycle**: Login -> Refresh -> Logout -> Try Access (should fail).
