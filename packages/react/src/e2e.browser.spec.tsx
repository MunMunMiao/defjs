import { describe, expect, inject, it } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { defineRequest, struct } from '@defjs/core'
import { ClientProvider, useClient, withEndpoint } from './core'

const UserSchema = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  output: {
    200: struct.array(UserSchema),
  },
})

function UserList() {
  const client = useClient()
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    client.execute(getUsers()).then(([, users]) => {
      if (users) {
        setUsers(users as Array<{ id: number; name: string }>)
      }
    })
  }, [client])

  return (
    <ul data-testid="user-list">
      {users.map((user) => (
        <li key={user.id} data-testid={`user-${user.id}`}>
          {user.name}
        </li>
      ))}
    </ul>
  )
}

function App({ endpoint }: { endpoint: string }) {
  return (
    <ClientProvider options={[withEndpoint(endpoint)]}>
      <div>
        <h1>Users</h1>
        <UserList />
      </div>
    </ClientProvider>
  )
}

describe('React wrapper e2e', () => {
  it('should fetch and render real data through useClient', async () => {
    const endpoint = inject('testServerHost')

    render(<App endpoint={endpoint} />)

    await waitFor(() => {
      expect(screen.getByTestId('user-1').textContent).toBe('John')
      expect(screen.getByTestId('user-2').textContent).toBe('Jane')
    })
  })

  it('should provide the same client instance to nested components', () => {
    const endpoint = inject('testServerHost')
    const clients: unknown[] = []

    function DeepChild() {
      clients.push(useClient())
      return null
    }

    function MiddleChild() {
      clients.push(useClient())
      return <DeepChild />
    }

    render(
      <ClientProvider options={[withEndpoint(endpoint)]}>
        <MiddleChild />
      </ClientProvider>,
    )

    expect(clients.length).toBe(2)
    expect(clients[0]).toBe(clients[1])
  })
})
