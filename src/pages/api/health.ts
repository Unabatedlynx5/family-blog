/**
 * Health Check Endpoint
 * 
 * LOW Issue #29 Fix: Provide a health check endpoint for monitoring
 * 
 * This endpoint provides:
 * - Basic health status
 * - Database connectivity check
 * - R2 storage connectivity check
 * - Timestamp for monitoring freshness
 */

import type { APIRoute } from 'astro';
import type { CloudflareEnv } from '../../types/cloudflare';
import { secureJsonResponse, errorResponse } from '../../../workers/utils/security-headers.ts';

export const prerender = false;

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  checks: {
    database: CheckResult;
    storage: CheckResult;
  };
  responseTimeMs?: number;
}

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  responseTimeMs?: number;
  message?: string;
}

/**
 * Check database connectivity
 */
async function checkDatabase(db: D1Database): Promise<CheckResult> {
  const start = Date.now();
  try {
    // Simple query to verify database is accessible
    await db.prepare('SELECT 1 as health_check').first();
    return {
      status: 'pass',
      responseTimeMs: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTimeMs: Date.now() - start,
      message: 'Database connection failed'
    };
  }
}

/**
 * Check R2 storage connectivity
 */
async function checkStorage(bucket: R2Bucket): Promise<CheckResult> {
  const start = Date.now();
  try {
    // List with limit 1 to verify bucket is accessible
    await bucket.list({ limit: 1 });
    return {
      status: 'pass',
      responseTimeMs: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTimeMs: Date.now() - start,
      message: 'Storage connection failed'
    };
  }
}

/**
 * Determine overall health status based on individual checks
 */
function determineOverallStatus(checks: HealthStatus['checks']): HealthStatus['status'] {
  const results = Object.values(checks);
  
  if (results.every(c => c.status === 'pass')) {
    return 'healthy';
  }
  if (results.some(c => c.status === 'fail')) {
    // If database fails, system is unhealthy
    if (checks.database.status === 'fail') {
      return 'unhealthy';
    }
    // If only storage fails, system is degraded
    return 'degraded';
  }
  return 'degraded';
}

export const GET: APIRoute = async ({ locals }) => {
  const startTime = Date.now();
  
  try {
    const env = locals.runtime?.env as CloudflareEnv | undefined;
    
    // If no env (e.g., during static build), return minimal health check
    if (!env) {
      return secureJsonResponse({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'pass', message: 'Static context - no runtime check' },
          storage: { status: 'pass', message: 'Static context - no runtime check' }
        }
      }, 200);
    }
    
    // Run health checks in parallel
    const [databaseCheck, storageCheck] = await Promise.all([
      checkDatabase(env.DB),
      checkStorage(env.MEDIA)
    ]);
    
    const checks = {
      database: databaseCheck,
      storage: storageCheck
    };
    
    const status = determineOverallStatus(checks);
    const responseTimeMs = Date.now() - startTime;
    
    const healthStatus: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      checks,
      responseTimeMs
    };
    
    // Return appropriate HTTP status based on health
    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    
    return secureJsonResponse(healthStatus, httpStatus);
    
  } catch (error) {
    // If health check itself fails, system is unhealthy
    return secureJsonResponse({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'fail', message: 'Health check error' },
        storage: { status: 'fail', message: 'Health check error' }
      },
      responseTimeMs: Date.now() - startTime
    }, 503);
  }
};

/**
 * HEAD request for simple uptime checks
 * Returns 200 if server is responding
 */
export const HEAD: APIRoute = async () => {
  return new Response(null, { status: 200 });
};
