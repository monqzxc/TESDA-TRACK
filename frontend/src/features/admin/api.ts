import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type AdminUser = components['schemas']['LearnerPublic']
// A role key, not a fixed union: administrators compose their own roles, so the list comes from the API.
export type AdminRole = AdminUser['role']
export type Role = components['schemas']['RolePublic']
export type RoleCreate = components['schemas']['RoleCreate']
export type RoleUpdate = components['schemas']['RoleUpdate']
export type Permission = components['schemas']['PermissionPublic']
export type McpClient = components['schemas']['ApiClientPublic']
export type McpClientCreate = components['schemas']['ApiClientCreate']
export type McpCredentials = components['schemas']['ApiClientCredentials']
export const USER_PAGE_SIZE = 25

export const adminUsersQuery = (page: number) =>
  queryOptions<AdminUser[], ApiError>({
    queryKey: ['admin', 'users', page],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/users', {
          params: { query: { limit: USER_PAGE_SIZE + 1, offset: page * USER_PAGE_SIZE } },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  })

export const rolesQuery = queryOptions<Role[], ApiError>({
  queryKey: ['admin', 'roles'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/roles', { signal })),
})

export const permissionsQuery = queryOptions<Permission[], ApiError>({
  queryKey: ['admin', 'permissions'],
  // Fixed in the backend, so it never goes stale within a session.
  staleTime: Infinity,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/permissions', { signal })),
})

export const roleAssignmentsQuery = queryOptions<Record<string, number>, ApiError>({
  queryKey: ['admin', 'roles', 'assignments'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/roles/assignments', { signal })),
})

export const mcpToolsQuery = queryOptions<Record<string, string>, ApiError>({
  queryKey: ['admin', 'mcp', 'tools'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/mcp/tools', { signal })),
})

export const mcpClientsQuery = queryOptions<McpClient[], ApiError>({
  queryKey: ['admin', 'mcp', 'clients'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/mcp/clients', { signal })),
})

export type McpActivityItem = components['schemas']['McpActivityItem']
export type McpActivityFilters = {
  client_id?: string
  tool?: string
  outcome?:
    | 'ok'
    | 'tool_error'
    | 'denied_token'
    | 'denied_scope'
    | 'rate_limited'
    | 'invalid_request'
    | 'server_error'
  date_from?: string
  date_to?: string
}
export const ACTIVITY_PAGE_SIZE = 25
export const mcpActivityQuery = (filters: McpActivityFilters, page: number) =>
  queryOptions<components['schemas']['McpActivityPage'], ApiError>({
    queryKey: ['admin', 'mcp', 'activity', filters, page],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/mcp/activity', {
          params: {
            query: { ...filters, limit: ACTIVITY_PAGE_SIZE, offset: page * ACTIVITY_PAGE_SIZE },
          },
          signal,
        }),
      ),
  })

export const mcpUsageQuery = (date_from?: string, date_to?: string) =>
  queryOptions<components['schemas']['UsageReport'], ApiError>({
    queryKey: ['admin', 'mcp', 'usage', date_from, date_to],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/admin/mcp/usage', {
          params: { query: { date_from, date_to } },
          signal,
        }),
      ),
  })

export const assignRole = (userId: string, role: AdminRole) =>
  unwrap(
    api.PATCH('/api/v1/admin/users/{user_id}/role', {
      params: { path: { user_id: userId } },
      body: { role },
    }),
  )

export const createRole = (body: RoleCreate) => unwrap(api.POST('/api/v1/admin/roles', { body }))

export const updateRole = (key: string, body: RoleUpdate) =>
  unwrap(api.PATCH('/api/v1/admin/roles/{key}', { params: { path: { key } }, body }))

export const deleteRole = (key: string) =>
  unwrap(api.DELETE('/api/v1/admin/roles/{key}', { params: { path: { key } } }))

export const createMcpClient = (body: McpClientCreate) =>
  unwrap(api.POST('/api/v1/admin/mcp/clients', { body }))

export const rotateMcpSecret = (clientId: string) =>
  unwrap(
    api.POST('/api/v1/admin/mcp/clients/{client_id}/rotate-secret', {
      params: { path: { client_id: clientId } },
    }),
  )

export const revokeMcpClient = (clientId: string) =>
  unwrap(
    api.POST('/api/v1/admin/mcp/clients/{client_id}/revoke', {
      params: { path: { client_id: clientId } },
    }),
  )
