import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs'
import { defineConfig } from 'vitepress'

const navEn = [
  { text: 'Guide', link: '/guide/getting-started' },
  { text: 'Core', link: '/core/client' },
  {
    text: 'Plugins',
    items: [
      { text: 'Vue', link: '/plugins/vue' },
      { text: 'React', link: '/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarEn = {
  '/guide/': [
    {
      text: 'Guide',
      items: [
        { text: 'Getting Started', link: '/guide/getting-started' },
        { text: 'Examples', link: '/guide/examples' },
        { text: 'Design Decisions', link: '/guide/design-decisions' },
      ],
    },
  ],
  '/core/': [
    {
      text: 'Core',
      items: [
        { text: 'Client', link: '/core/client' },
        { text: 'Commands', link: '/core/commands' },
        { text: 'Context', link: '/core/context' },
        { text: 'Errors', link: '/core/errors' },
        { text: 'HTTP', link: '/core/http' },
        { text: 'Interceptors', link: '/core/interceptors' },
        { text: 'SSE', link: '/core/sse' },
        { text: 'Struct', link: '/core/struct' },
        { text: 'WebSocket', link: '/core/web-socket' },
      ],
    },
  ],
  '/plugins/': [
    {
      text: 'Plugins',
      items: [
        { text: 'Vue', link: '/plugins/vue' },
        { text: 'React', link: '/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navZh = [
  { text: '指南', link: '/zh-Hans/guide/getting-started' },
  { text: '核心', link: '/zh-Hans/core/client' },
  {
    text: '插件',
    items: [
      { text: 'Vue', link: '/zh-Hans/plugins/vue' },
      { text: 'React', link: '/zh-Hans/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/zh-Hans/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarZh = {
  '/zh-Hans/guide/': [
    {
      text: '指南',
      items: [
        { text: '快速开始', link: '/zh-Hans/guide/getting-started' },
        { text: '示例', link: '/zh-Hans/guide/examples' },
        { text: '设计决策', link: '/zh-Hans/guide/design-decisions' },
      ],
    },
  ],
  '/zh-Hans/core/': [
    {
      text: '核心',
      items: [
        { text: '客户端', link: '/zh-Hans/core/client' },
        { text: '命令', link: '/zh-Hans/core/commands' },
        { text: '上下文', link: '/zh-Hans/core/context' },
        { text: '错误处理', link: '/zh-Hans/core/errors' },
        { text: 'HTTP', link: '/zh-Hans/core/http' },
        { text: '拦截器', link: '/zh-Hans/core/interceptors' },
        { text: 'SSE', link: '/zh-Hans/core/sse' },
        { text: 'Struct', link: '/zh-Hans/core/struct' },
        { text: 'WebSocket', link: '/zh-Hans/core/web-socket' },
      ],
    },
  ],
  '/zh-Hans/plugins/': [
    {
      text: '插件',
      items: [
        { text: 'Vue', link: '/zh-Hans/plugins/vue' },
        { text: 'React', link: '/zh-Hans/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/zh-Hans/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navZhTw = [
  { text: '指南', link: '/zh-Hant-TW/guide/getting-started' },
  { text: '核心', link: '/zh-Hant-TW/core/client' },
  {
    text: '外掛程式',
    items: [
      { text: 'Vue', link: '/zh-Hant-TW/plugins/vue' },
      { text: 'React', link: '/zh-Hant-TW/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/zh-Hant-TW/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarZhTw = {
  '/zh-Hant-TW/guide/': [
    {
      text: '指南',
      items: [
        { text: '快速上手', link: '/zh-Hant-TW/guide/getting-started' },
        { text: '範例', link: '/zh-Hant-TW/guide/examples' },
        { text: '設計決策', link: '/zh-Hant-TW/guide/design-decisions' },
      ],
    },
  ],
  '/zh-Hant-TW/core/': [
    {
      text: '核心',
      items: [
        { text: '用戶端', link: '/zh-Hant-TW/core/client' },
        { text: '指令', link: '/zh-Hant-TW/core/commands' },
        { text: '脈絡', link: '/zh-Hant-TW/core/context' },
        { text: '錯誤處理', link: '/zh-Hant-TW/core/errors' },
        { text: 'HTTP', link: '/zh-Hant-TW/core/http' },
        { text: '攔截器', link: '/zh-Hant-TW/core/interceptors' },
        { text: 'SSE', link: '/zh-Hant-TW/core/sse' },
        { text: 'Struct', link: '/zh-Hant-TW/core/struct' },
        { text: 'WebSocket', link: '/zh-Hant-TW/core/web-socket' },
      ],
    },
  ],
  '/zh-Hant-TW/plugins/': [
    {
      text: '外掛程式',
      items: [
        { text: 'Vue', link: '/zh-Hant-TW/plugins/vue' },
        { text: 'React', link: '/zh-Hant-TW/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/zh-Hant-TW/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navZhHk = [
  { text: '指南', link: '/zh-Hant-HK/guide/getting-started' },
  { text: '核心', link: '/zh-Hant-HK/core/client' },
  {
    text: '外掛',
    items: [
      { text: 'Vue', link: '/zh-Hant-HK/plugins/vue' },
      { text: 'React', link: '/zh-Hant-HK/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/zh-Hant-HK/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarZhHk = {
  '/zh-Hant-HK/guide/': [
    {
      text: '指南',
      items: [
        { text: '快速開始', link: '/zh-Hant-HK/guide/getting-started' },
        { text: '範例', link: '/zh-Hant-HK/guide/examples' },
        { text: '設計決策', link: '/zh-Hant-HK/guide/design-decisions' },
      ],
    },
  ],
  '/zh-Hant-HK/core/': [
    {
      text: '核心',
      items: [
        { text: '用戶端', link: '/zh-Hant-HK/core/client' },
        { text: '指令', link: '/zh-Hant-HK/core/commands' },
        { text: '上下文', link: '/zh-Hant-HK/core/context' },
        { text: '錯誤處理', link: '/zh-Hant-HK/core/errors' },
        { text: 'HTTP', link: '/zh-Hant-HK/core/http' },
        { text: '攔截器', link: '/zh-Hant-HK/core/interceptors' },
        { text: 'SSE', link: '/zh-Hant-HK/core/sse' },
        { text: 'Struct', link: '/zh-Hant-HK/core/struct' },
        { text: 'WebSocket', link: '/zh-Hant-HK/core/web-socket' },
      ],
    },
  ],
  '/zh-Hant-HK/plugins/': [
    {
      text: '外掛',
      items: [
        { text: 'Vue', link: '/zh-Hant-HK/plugins/vue' },
        { text: 'React', link: '/zh-Hant-HK/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/zh-Hant-HK/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navDe = [
  { text: 'Handbuch', link: '/de-DE/guide/getting-started' },
  { text: 'Kern', link: '/de-DE/core/client' },
  {
    text: 'Plugins',
    items: [
      { text: 'Vue', link: '/de-DE/plugins/vue' },
      { text: 'React', link: '/de-DE/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/de-DE/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarDe = {
  '/de-DE/guide/': [
    {
      text: 'Handbuch',
      items: [
        { text: 'Erste Schritte', link: '/de-DE/guide/getting-started' },
        { text: 'Beispiele', link: '/de-DE/guide/examples' },
        { text: 'Design-Entscheidungen', link: '/de-DE/guide/design-decisions' },
      ],
    },
  ],
  '/de-DE/core/': [
    {
      text: 'Kern',
      items: [
        { text: 'Client', link: '/de-DE/core/client' },
        { text: 'Befehle', link: '/de-DE/core/commands' },
        { text: 'Kontext', link: '/de-DE/core/context' },
        { text: 'Fehler', link: '/de-DE/core/errors' },
        { text: 'HTTP', link: '/de-DE/core/http' },
        { text: 'Interceptor', link: '/de-DE/core/interceptors' },
        { text: 'SSE', link: '/de-DE/core/sse' },
        { text: 'Struct', link: '/de-DE/core/struct' },
        { text: 'WebSocket', link: '/de-DE/core/web-socket' },
      ],
    },
  ],
  '/de-DE/plugins/': [
    {
      text: 'Plugins',
      items: [
        { text: 'Vue', link: '/de-DE/plugins/vue' },
        { text: 'React', link: '/de-DE/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/de-DE/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navJa = [
  { text: 'ガイド', link: '/ja-JP/guide/getting-started' },
  { text: 'コア', link: '/ja-JP/core/client' },
  {
    text: 'プラグイン',
    items: [
      { text: 'Vue', link: '/ja-JP/plugins/vue' },
      { text: 'React', link: '/ja-JP/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/ja-JP/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarJa = {
  '/ja-JP/guide/': [
    {
      text: 'ガイド',
      items: [
        { text: 'クイックスタート', link: '/ja-JP/guide/getting-started' },
        { text: 'サンプル', link: '/ja-JP/guide/examples' },
        { text: '設計上の決定事項', link: '/ja-JP/guide/design-decisions' },
      ],
    },
  ],
  '/ja-JP/core/': [
    {
      text: 'コア',
      items: [
        { text: 'Client', link: '/ja-JP/core/client' },
        { text: 'Commands', link: '/ja-JP/core/commands' },
        { text: 'Context', link: '/ja-JP/core/context' },
        { text: 'Errors', link: '/ja-JP/core/errors' },
        { text: 'HTTP', link: '/ja-JP/core/http' },
        { text: 'Interceptors', link: '/ja-JP/core/interceptors' },
        { text: 'SSE', link: '/ja-JP/core/sse' },
        { text: 'Struct', link: '/ja-JP/core/struct' },
        { text: 'WebSocket', link: '/ja-JP/core/web-socket' },
      ],
    },
  ],
  '/ja-JP/plugins/': [
    {
      text: 'プラグイン',
      items: [
        { text: 'Vue', link: '/ja-JP/plugins/vue' },
        { text: 'React', link: '/ja-JP/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/ja-JP/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navKo = [
  { text: '가이드', link: '/ko-KR/guide/getting-started' },
  { text: '코어', link: '/ko-KR/core/client' },
  {
    text: '플러그인',
    items: [
      { text: 'Vue', link: '/ko-KR/plugins/vue' },
      { text: 'React', link: '/ko-KR/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/ko-KR/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarKo = {
  '/ko-KR/guide/': [
    {
      text: '가이드',
      items: [
        { text: '시작하기', link: '/ko-KR/guide/getting-started' },
        { text: '예제', link: '/ko-KR/guide/examples' },
        { text: '설계 결정', link: '/ko-KR/guide/design-decisions' },
      ],
    },
  ],
  '/ko-KR/core/': [
    {
      text: '코어',
      items: [
        { text: 'Client', link: '/ko-KR/core/client' },
        { text: 'Commands', link: '/ko-KR/core/commands' },
        { text: 'Context', link: '/ko-KR/core/context' },
        { text: 'Errors', link: '/ko-KR/core/errors' },
        { text: 'HTTP', link: '/ko-KR/core/http' },
        { text: 'Interceptors', link: '/ko-KR/core/interceptors' },
        { text: 'SSE', link: '/ko-KR/core/sse' },
        { text: 'Struct', link: '/ko-KR/core/struct' },
        { text: 'WebSocket', link: '/ko-KR/core/web-socket' },
      ],
    },
  ],
  '/ko-KR/plugins/': [
    {
      text: '플러그인',
      items: [
        { text: 'Vue', link: '/ko-KR/plugins/vue' },
        { text: 'React', link: '/ko-KR/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/ko-KR/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navAr = [
  { text: 'الدليل', link: '/ar/guide/getting-started' },
  { text: 'النواة', link: '/ar/core/client' },
  {
    text: 'الإضافات',
    items: [
      { text: 'Vue', link: '/ar/plugins/vue' },
      { text: 'React', link: '/ar/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/ar/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarAr = {
  '/ar/guide/': [
    {
      text: 'الدليل',
      items: [
        { text: 'البدء السريع', link: '/ar/guide/getting-started' },
        { text: 'أمثلة', link: '/ar/guide/examples' },
        { text: 'قرارات التصميم', link: '/ar/guide/design-decisions' },
      ],
    },
  ],
  '/ar/core/': [
    {
      text: 'النواة',
      items: [
        { text: 'العميل', link: '/ar/core/client' },
        { text: 'الأوامر', link: '/ar/core/commands' },
        { text: 'السياق', link: '/ar/core/context' },
        { text: 'الأخطاء', link: '/ar/core/errors' },
        { text: 'HTTP', link: '/ar/core/http' },
        { text: 'المعترضات', link: '/ar/core/interceptors' },
        { text: 'SSE', link: '/ar/core/sse' },
        { text: 'Struct', link: '/ar/core/struct' },
        { text: 'WebSocket', link: '/ar/core/web-socket' },
      ],
    },
  ],
  '/ar/plugins/': [
    {
      text: 'الإضافات',
      items: [
        { text: 'Vue', link: '/ar/plugins/vue' },
        { text: 'React', link: '/ar/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/ar/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navEs = [
  { text: 'Guía', link: '/es-ES/guide/getting-started' },
  { text: 'Núcleo', link: '/es-ES/core/client' },
  {
    text: 'Plugins',
    items: [
      { text: 'Vue', link: '/es-ES/plugins/vue' },
      { text: 'React', link: '/es-ES/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/es-ES/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarEs = {
  '/es-ES/guide/': [
    {
      text: 'Guía',
      items: [
        { text: 'Primeros Pasos', link: '/es-ES/guide/getting-started' },
        { text: 'Ejemplos', link: '/es-ES/guide/examples' },
        { text: 'Decisiones de Diseño', link: '/es-ES/guide/design-decisions' },
      ],
    },
  ],
  '/es-ES/core/': [
    {
      text: 'Núcleo',
      items: [
        { text: 'Client', link: '/es-ES/core/client' },
        { text: 'Commands', link: '/es-ES/core/commands' },
        { text: 'Context', link: '/es-ES/core/context' },
        { text: 'Errors', link: '/es-ES/core/errors' },
        { text: 'HTTP', link: '/es-ES/core/http' },
        { text: 'Interceptors', link: '/es-ES/core/interceptors' },
        { text: 'SSE', link: '/es-ES/core/sse' },
        { text: 'Struct', link: '/es-ES/core/struct' },
        { text: 'WebSocket', link: '/es-ES/core/web-socket' },
      ],
    },
  ],
  '/es-ES/plugins/': [
    {
      text: 'Plugins',
      items: [
        { text: 'Vue', link: '/es-ES/plugins/vue' },
        { text: 'React', link: '/es-ES/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/es-ES/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navRu = [
  { text: 'Руководство', link: '/ru-RU/guide/getting-started' },
  { text: 'Ядро', link: '/ru-RU/core/client' },
  {
    text: 'Плагины',
    items: [
      { text: 'Vue', link: '/ru-RU/plugins/vue' },
      { text: 'React', link: '/ru-RU/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/ru-RU/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarRu = {
  '/ru-RU/guide/': [
    {
      text: 'Руководство',
      items: [
        { text: 'Быстрый старт', link: '/ru-RU/guide/getting-started' },
        { text: 'Примеры', link: '/ru-RU/guide/examples' },
        { text: 'Проектные решения', link: '/ru-RU/guide/design-decisions' },
      ],
    },
  ],
  '/ru-RU/core/': [
    {
      text: 'Ядро',
      items: [
        { text: 'Клиент', link: '/ru-RU/core/client' },
        { text: 'Команды', link: '/ru-RU/core/commands' },
        { text: 'Контекст', link: '/ru-RU/core/context' },
        { text: 'Ошибки', link: '/ru-RU/core/errors' },
        { text: 'HTTP', link: '/ru-RU/core/http' },
        { text: 'Интерцепторы', link: '/ru-RU/core/interceptors' },
        { text: 'SSE', link: '/ru-RU/core/sse' },
        { text: 'Struct', link: '/ru-RU/core/struct' },
        { text: 'WebSocket', link: '/ru-RU/core/web-socket' },
      ],
    },
  ],
  '/ru-RU/plugins/': [
    {
      text: 'Плагины',
      items: [
        { text: 'Vue', link: '/ru-RU/plugins/vue' },
        { text: 'React', link: '/ru-RU/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/ru-RU/plugins/opentelemetry-server' },
      ],
    },
  ],
}

const navFr = [
  { text: 'Guide', link: '/fr-FR/guide/getting-started' },
  { text: 'Cœur', link: '/fr-FR/core/client' },
  {
    text: 'Plugins',
    items: [
      { text: 'Vue', link: '/fr-FR/plugins/vue' },
      { text: 'React', link: '/fr-FR/plugins/react' },
      { text: 'OpenTelemetry Server', link: '/fr-FR/plugins/opentelemetry-server' },
    ],
  },
]

const sidebarFr = {
  '/fr-FR/guide/': [
    {
      text: 'Guide',
      items: [
        { text: 'Démarrage', link: '/fr-FR/guide/getting-started' },
        { text: 'Exemples', link: '/fr-FR/guide/examples' },
        { text: 'Décisions de conception', link: '/fr-FR/guide/design-decisions' },
      ],
    },
  ],
  '/fr-FR/core/': [
    {
      text: 'Cœur',
      items: [
        { text: 'Client', link: '/fr-FR/core/client' },
        { text: 'Commandes', link: '/fr-FR/core/commands' },
        { text: 'Contexte', link: '/fr-FR/core/context' },
        { text: 'Erreurs', link: '/fr-FR/core/errors' },
        { text: 'HTTP', link: '/fr-FR/core/http' },
        { text: 'Intercepteurs', link: '/fr-FR/core/interceptors' },
        { text: 'SSE', link: '/fr-FR/core/sse' },
        { text: 'Struct', link: '/fr-FR/core/struct' },
        { text: 'WebSocket', link: '/fr-FR/core/web-socket' },
      ],
    },
  ],
  '/fr-FR/plugins/': [
    {
      text: 'Plugins',
      items: [
        { text: 'Vue', link: '/fr-FR/plugins/vue' },
        { text: 'React', link: '/fr-FR/plugins/react' },
        { text: 'OpenTelemetry Server', link: '/fr-FR/plugins/opentelemetry-server' },
      ],
    },
  ],
}

export default defineConfig({
  title: 'Defjs',
  description: 'Typed request APIs across transports and runtimes',
  cleanUrls: true,

  vite: {
    build: {
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/@vueuse/core/')) {
            return
          }

          defaultHandler(warning)
        },
      },
    },
  },

  markdown: {
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache(),
      }),
    ],
    languages: ['js', 'jsx', 'ts', 'tsx'],
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: navEn,
        sidebar: sidebarEn,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'Edit this page on GitHub',
        },
        docFooter: {
          prev: 'Previous',
          next: 'Next',
        },
        outline: {
          label: 'On this page',
        },
      },
    },
    'zh-Hans': {
      label: '简体中文',
      lang: 'zh-Hans',
      themeConfig: {
        nav: navZh,
        sidebar: sidebarZh,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: '在 GitHub 上编辑此页',
        },
        docFooter: {
          prev: '上一页',
          next: '下一页',
        },
        outline: {
          label: '本页目录',
        },
      },
    },
    'zh-Hant-TW': {
      label: '繁體中文（台灣）',
      lang: 'zh-Hant-TW',
      themeConfig: {
        nav: navZhTw,
        sidebar: sidebarZhTw,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: '在 GitHub 上編輯此頁',
        },
        docFooter: {
          prev: '上一頁',
          next: '下一頁',
        },
        outline: {
          label: '本頁目錄',
        },
      },
    },
    'zh-Hant-HK': {
      label: '繁體中文（香港）',
      lang: 'zh-Hant-HK',
      themeConfig: {
        nav: navZhHk,
        sidebar: sidebarZhHk,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: '在 GitHub 上編輯此頁',
        },
        docFooter: {
          prev: '上一頁',
          next: '下一頁',
        },
        outline: {
          label: '本頁目錄',
        },
      },
    },
    'de-DE': {
      label: 'Deutsch',
      lang: 'de-DE',
      themeConfig: {
        nav: navDe,
        sidebar: sidebarDe,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'Diese Seite auf GitHub bearbeiten',
        },
        docFooter: {
          prev: 'Vorherige',
          next: 'Nächste',
        },
        outline: {
          label: 'Auf dieser Seite',
        },
      },
    },
    'ja-JP': {
      label: '日本語',
      lang: 'ja-JP',
      themeConfig: {
        nav: navJa,
        sidebar: sidebarJa,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'GitHub でこのページを編集',
        },
        docFooter: {
          prev: '前へ',
          next: '次へ',
        },
        outline: {
          label: '目次',
        },
      },
    },
    'ko-KR': {
      label: '한국어',
      lang: 'ko-KR',
      themeConfig: {
        nav: navKo,
        sidebar: sidebarKo,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'GitHub에서 이 페이지 편집',
        },
        docFooter: {
          prev: '이전',
          next: '다음',
        },
        outline: {
          label: '목차',
        },
      },
    },
    ar: {
      label: 'العربية',
      lang: 'ar',
      dir: 'rtl',
      themeConfig: {
        nav: navAr,
        sidebar: sidebarAr,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'تحرير هذه الصفحة على GitHub',
        },
        docFooter: {
          prev: 'السابق',
          next: 'التالي',
        },
        outline: {
          label: 'محتويات الصفحة',
        },
      },
    },
    'es-ES': {
      label: 'Español',
      lang: 'es-ES',
      themeConfig: {
        nav: navEs,
        sidebar: sidebarEs,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'Editar esta página en GitHub',
        },
        docFooter: {
          prev: 'Anterior',
          next: 'Siguiente',
        },
        outline: {
          label: 'En esta página',
        },
      },
    },
    'ru-RU': {
      label: 'Русский',
      lang: 'ru-RU',
      themeConfig: {
        nav: navRu,
        sidebar: sidebarRu,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'Редактировать эту страницу на GitHub',
        },
        docFooter: {
          prev: 'Предыдущая',
          next: 'Следующая',
        },
        outline: {
          label: 'Содержание страницы',
        },
      },
    },
    'fr-FR': {
      label: 'Français',
      lang: 'fr-FR',
      themeConfig: {
        nav: navFr,
        sidebar: sidebarFr,
        editLink: {
          pattern: 'https://github.com/defjs/defjs/edit/main/doc/:path',
          text: 'Modifier cette page sur GitHub',
        },
        docFooter: {
          prev: 'Précédent',
          next: 'Suivant',
        },
        outline: {
          label: 'Sur cette page',
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo.jpg',
    siteTitle: 'Defjs',
    socialLinks: [{ icon: 'github', link: 'https://github.com/defjs/defjs' }],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 MunMunMiao',
    },
  },
})
