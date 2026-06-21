import { describe, expect, inject, it } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { createHttpInterceptor, defineRequest, struct } from '@defjs/core'
import { ClientProvider, useClient, withEndpoint, withInterceptors } from './core'

const UserStruct = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  output: {
    200: struct.array(UserStruct),
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

  it('should resolve the nearest client provider in nested component trees', async () => {
    const endpoint = inject('testServerHost')
    const seenScopes: string[] = []
    let outerClient: unknown
    let outerSiblingClient: unknown
    let innerMiddleClient: unknown
    let innerLeafClient: unknown

    const scopedInterceptor = (scope: string) =>
      createHttpInterceptor(async (req, next) => {
        seenScopes.push(scope)
        req.headers?.set('x-defjs-scope', scope)
        return next(req)
      })

    function OuterRequestConsumer() {
      const client = useClient()
      const [count, setCount] = useState('loading')
      outerClient = client

      useEffect(() => {
        client.execute(getUsers()).then(([error, users]) => {
          if (error) {
            setCount('error')
            return
          }

          setCount(String((users as Array<{ id: number; name: string }>).length))
        })
      }, [client])

      return <span data-testid="outer-count">{count}</span>
    }

    function OuterSiblingConsumer() {
      outerSiblingClient = useClient()
      return null
    }

    function InnerMiddle() {
      innerMiddleClient = useClient()
      return <InnerLeaf />
    }

    function InnerLeaf() {
      const client = useClient()
      const [count, setCount] = useState('loading')
      innerLeafClient = client

      useEffect(() => {
        client.execute(getUsers()).then(([error, users]) => {
          if (error) {
            setCount('error')
            return
          }

          setCount(String((users as Array<{ id: number; name: string }>).length))
        })
      }, [client])

      return <span data-testid="inner-count">{count}</span>
    }

    render(
      <ClientProvider options={[withEndpoint(endpoint), withInterceptors(() => scopedInterceptor('outer'))]}>
        <OuterRequestConsumer />
        <ClientProvider options={[withEndpoint(endpoint), withInterceptors(() => scopedInterceptor('inner'))]}>
          <InnerMiddle />
        </ClientProvider>
        <OuterSiblingConsumer />
      </ClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('outer-count').textContent).toBe('2')
      expect(screen.getByTestId('inner-count').textContent).toBe('2')
    })

    expect(outerClient).toBeDefined()
    expect(outerSiblingClient).toBeDefined()
    expect(innerMiddleClient).toBeDefined()
    expect(innerLeafClient).toBeDefined()
    expect(outerClient).toBe(outerSiblingClient)
    expect(innerMiddleClient).toBe(innerLeafClient)
    expect(innerLeafClient).not.toBe(outerClient)
    expect([...seenScopes].sort()).toEqual(['inner', 'outer'])
  })
})
