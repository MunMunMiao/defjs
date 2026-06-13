import { struct } from '../struct'
import { buildRequest } from './request_builder'

const input = struct.request({
  body: struct.json(
    struct.object({
      users: struct.array(
        struct.object({
          id: struct.number(),
          name: struct.string(),
        }),
      ),
    }),
  ),
  headers: struct.object({
    token: struct.string(),
  }),
  query: struct.object({
    page: struct.number().optional(),
  }),
})

buildRequest(
  { body: { users: [{ id: 1, name: 'Ada' }] }, headers: { token: 't' }, query: { page: 1 } },
  (request, view) => {
    request.setHeaders({ token: view.headers.token })
    request.setQueryParams({ page: view.query.page })
    request.setJson({ users: view.body.users.map((user) => ({ id: user.id, name: user.name })) })
  },
  { input },
)

buildRequest(
  { body: { users: [{ id: 1, name: 'Ada' }] } },
  (request, view) => {
    // @ts-expect-error unknown body fields are rejected by the typed build view.
    request.setJson({ users: view.body.users.map((user) => ({ missing: user.missing })) })
  },
  { input },
)
