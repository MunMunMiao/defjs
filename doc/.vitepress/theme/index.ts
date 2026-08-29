import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'

import '@shikijs/vitepress-twoslash/style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
    app.use(TwoslashFloatingVue)
  },
} satisfies Theme
