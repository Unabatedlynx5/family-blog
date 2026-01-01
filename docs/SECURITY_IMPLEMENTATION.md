You have completed a comprehensive security audit of this Astro + Cloudflare Workers codebase and identified multiple security vulnerabilities, type safety issues, and best practice violations.

# YOUR MISSION
Implement ALL fixes identified in the security audit, following the guidelines in `copilot-instructions.md`.

# IMPLEMENTATION PLAN

## PHASE 1: PREPARATION (Before Starting)
1. Read and understand `copilot-instructions.md`
2. Create a new branch: `security-audit-fixes-[date]`
3. Ask any clarifying questions you need answered before proceeding

## PHASE 2: THIS WEEK (CRITICAL & HIGH Priority)
Implement fixes for:
- All CRITICAL severity issues (SQL injection, exposed secrets, missing rate limiting)
- All HIGH severity issues (authentication gaps, input validation, major type safety issues)

For each fix:
- Reference the issue number from the audit
- Implement the recommended solution
- Add inline comments explaining the security improvement
- Update related tests if they exist

## PHASE 3: THIS MONTH (MEDIUM Priority)
Implement fixes for:
- All MEDIUM severity issues (remaining type safety issues, error handling, minor API security gaps)
- Cloudflare Workers optimization opportunities
- Remove all 'any' types with proper TypeScript types

## PHASE 4: NEXT QUARTER (LOW Priority + Enhancements)
- All LOW severity issues
- Additional security hardening
- Performance optimizations
- Documentation updates

## PHASE 5: BEYOND (Code Coverage)
After all security fixes are complete:
- Analyze current test coverage
- Identify untested critical paths (especially auth, database operations, API routes)
- Write comprehensive tests covering:
  - All authentication flows
  - Database query edge cases
  - API input validation
  - Rate limiting behavior
  - JWT token handling
  - Error scenarios
- Target: 80%+ coverage on critical security paths

# IMPLEMENTATION GUIDELINES

1. **Work systematically**: Complete one severity level before moving to the next
2. **Commit frequently**: One commit per logical fix or small group of related fixes
3. **Write clear commit messages**: 
   - Format: `security: [Issue #X] Fix [vulnerability type] in [component]`
   - Example: `security: [Issue #3] Fix SQL injection in user search endpoint`
4. **Test as you go**: Verify each fix works before moving on
5. **Document breaking changes**: Flag any changes that affect API contracts
6. **Ask before major refactors**: If a fix requires significant architectural changes, ask first

# BEFORE YOU START

Please confirm you understand the task and ask any clarifying questions about:
- The copilot-instructions.md guidelines
- Priority of specific issues
- Acceptable approaches for complex fixes
- Any business logic or constraints I should know about
- Testing requirements or existing test frameworks
- Deployment considerations

Once I answer your questions, proceed with the implementation starting with CRITICAL issues.

# PROGRESS TRACKING

As you work, provide updates in this format:

**Phase X Progress**: [X/Y issues completed]
- ✅ Fixed: [Issue #X - Brief description]
- ✅ Fixed: [Issue #Y - Brief description]
- 🚧 In Progress: [Issue #Z - Brief description]
- ⏸️ Blocked: [Issue description + what you need from me]

Ready to begin? Ask your clarifying questions now.