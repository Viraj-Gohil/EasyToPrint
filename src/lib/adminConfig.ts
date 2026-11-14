/**
 * Secure Non-Guessable Administration Portal Configuration
 *
 * Notice: NEVER place administrator credentials, emails, or passwords in this file.
 * This module defines only the obscured routing prefix and auth endpoint path shared
 * between the React router and Express server.
 */

export const ADMIN_BASE_PATH = '/etp-ctrl-9x4k7m2p';
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/gate`;
export const ADMIN_DASHBOARD_PATH = `${ADMIN_BASE_PATH}/dashboard`;
export const ADMIN_API_LOGIN_PATH = '/api/etp-ctrl-9x4k7m2p/auth';

export function adminPath(subPath: string = 'dashboard'): string {
  const clean = subPath.replace(/^\/+/, '');
  return clean ? `${ADMIN_BASE_PATH}/${clean}` : ADMIN_BASE_PATH;
}

export function isAdminRoutePath(pathname: string): boolean {
  const clean = (pathname || '/').split('?')[0].split('#')[0];
  return clean === ADMIN_BASE_PATH || clean.startsWith(`${ADMIN_BASE_PATH}/`);
}
