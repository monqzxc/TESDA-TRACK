import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type AdminUser = components['schemas']['LearnerPublic']
export type AdminRole = AdminUser['role']
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

export const rolesQuery = queryOptions<Record<string, string[]>, ApiError>({
  queryKey: ['admin', 'roles'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/roles', { signal })),
})

export const mcpToolsQuery = queryOptions<Record<string, string>, ApiError>({
  queryKey: ['admin', 'mcp', 'tools'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/mcp/tools', { signal })),
})

export const mcpClientsQuery = queryOptions<McpClient[], ApiError>({
  queryKey: ['admin', 'mcp', 'clients'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/admin/mcp/clients', { signal })),
})

export const assignRole = (userId: string, role: AdminRole) =>
  unwrap(
    api.PATCH('/api/v1/admin/users/{user_id}/role', {
      params: { path: { user_id: userId } },
      body: { role },
    }),
  )

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
