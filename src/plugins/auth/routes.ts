export const publicRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth/logout",
  "/docs",
  "/docs/static/swagger-ui-standalone-preset.js",
  "/docs/static/index.css",
  "/docs/static/swagger-ui.css",
  "/docs/static/swagger-ui-bundle.js",
  "/docs/static/swagger-initializer.js",
  "/docs/static/favicon-32x32.png",
  "/docs/static/favicon-16x16.png",
  "/docs/json",
  "/health",
  "/",
]; // Add more public routes as needed

export const adminRoutes: Record<string, Record<string, boolean>> = {
  POST: {
    "/users/invite": true,
    "/projects": true,
    "/projects/:id/users": true,
    "/workspaces": true,
    "/workspaces/:id/invitations": true,
  },
  GET: {
    "/users/:id": true,
    "/activities/user-select/:id": true,
    "/workspaces/:id/invitations": true,
  },
  PUT: {
    "/users/:id": true,
    "/projects/:id": true,
    "/workspaces/:id": true,
  },
  DELETE: {
    "/users/:id": true,
    "/projects/:id": true,
    "/projects/:id/users/:userId": true,
    "/workspaces/:id": true,
    "/workspaces/:workspaceId/invitations/:id": true,
  },
};

/**
 * Matches a dynamic route pattern against an actual URL
 * @param pattern - The route pattern (e.g., "/users/:id")
 * @param url - The actual URL (e.g., "/users/123")
 * @returns true if the URL matches the pattern, false otherwise
 */
export function matchRoute(pattern: string, url: string): boolean {
  // Split both pattern and URL into segments
  const patternSegments = pattern.split("/").filter(Boolean);
  const urlSegments = url.split("/").filter(Boolean);

  // If segment counts don't match, it's not a match
  if (patternSegments.length !== urlSegments.length) {
    return false;
  }

  // Check each segment
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i];
    const urlSegment = urlSegments[i];

    // If pattern segment starts with ':', it's a parameter and matches any value
    if (patternSegment.startsWith(":")) {
      continue;
    }

    // For non-parameter segments, they must match exactly
    if (patternSegment !== urlSegment) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a URL matches any of the admin routes for a given method
 * @param method - HTTP method
 * @param url - The actual URL to check
 * @returns true if the URL matches any admin route pattern
 */
export function isAdminRoute(method: string, url: string): boolean {
  const methodRoutes = adminRoutes[method] || {};

  // First check for exact matches
  if (methodRoutes[url]) {
    return true;
  }

  // Then check for dynamic route matches
  for (const pattern of Object.keys(methodRoutes)) {
    if (matchRoute(pattern, url)) {
      return true;
    }
  }

  return false;
}
