import { type ServerType, serve } from '@hono/node-server'
import { Hono } from 'hono'

export async function startHonoServer() {
  const app = new Hono()

  // 定义测试路由
  app.get('/api/users', c => {
    return c.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  app.get('/api/users/:id', c => {
    const id = c.req.param('id')
    return c.json({ id: Number(id), name: 'John' })
  })

  // 启动服务器并等待就绪
  let serverRef: ServerType | undefined
  const port = await new Promise<number>((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        port: 0, // 随机端口
      },
      info => {
        resolve(info.port)
      },
    )
    server.once('error', reject)
    serverRef = server
  })

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        const server = serverRef
        if (!server) {
          resolve()
          return
        }
        server.close((error: Error | undefined) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}
