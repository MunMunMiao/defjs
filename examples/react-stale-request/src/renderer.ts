import type { ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

// Mount through React's act boundary and restore the temporary test globals on unmount.

type ReactTestGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
  IS_REACT_NATIVE_TEST_ENVIRONMENT?: boolean
}

export async function mountReactFixture(element: ReactElement) {
  const globals = globalThis as ReactTestGlobals
  const previousAct = globals.IS_REACT_ACT_ENVIRONMENT
  const previousNative = globals.IS_REACT_NATIVE_TEST_ENVIRONMENT
  let renderer: ReactTestRenderer | undefined

  const restore = () => {
    if (previousAct === undefined) delete globals.IS_REACT_ACT_ENVIRONMENT
    else globals.IS_REACT_ACT_ENVIRONMENT = previousAct
    if (previousNative === undefined) delete globals.IS_REACT_NATIVE_TEST_ENVIRONMENT
    else globals.IS_REACT_NATIVE_TEST_ENVIRONMENT = previousNative
  }

  globals.IS_REACT_ACT_ENVIRONMENT = true
  globals.IS_REACT_NATIVE_TEST_ENVIRONMENT = true
  try {
    await act(async () => {
      renderer = create(element)
    })
  } catch (error) {
    restore()
    throw error
  }

  if (!renderer) {
    restore()
    throw new Error('React fixture did not mount')
  }
  const mounted = renderer
  let active = true

  return {
    async update(next: ReactElement) {
      await act(async () => mounted.update(next))
    },
    async unmount() {
      if (!active) return
      active = false
      try {
        await act(async () => mounted.unmount())
      } finally {
        restore()
      }
    },
  }
}
