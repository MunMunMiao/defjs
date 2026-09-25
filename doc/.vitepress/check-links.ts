import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = new URL('./dist/', import.meta.url).pathname
const pages = new Map<string, { ids: Set<string>; links: string[] }>()

for await (const filename of new Bun.Glob('**/*.html').scan(directory)) {
  const page = { ids: new Set<string>(), links: [] as string[] }
  await new HTMLRewriter()
    .on('[id]', {
      element(element) {
        const id = element.getAttribute('id')
        if (id !== null) page.ids.add(id)
      },
    })
    .on('a[href]', {
      element(element) {
        const href = element.getAttribute('href')
        if (href !== null) page.links.push(href)
      },
    })
    .transform(new Response(Bun.file(resolve(directory, filename))))
    .text()
  pages.set(resolve(directory, filename), page)
}

if (pages.size === 0) throw new Error('No generated documentation pages found; build the site before checking links.')

const failures = new Set<string>()
for (const [filename, page] of pages) {
  const base = new URL(filename.slice(directory.length), 'https://docs.invalid/')
  for (const href of page.links) {
    const url = new URL(href, base)
    if (url.origin !== base.origin) continue

    const path = resolve(directory, `.${decodeURIComponent(url.pathname)}`)
    const target = [path, `${path}.html`, resolve(path, 'index.html')].find((candidate) => pages.has(candidate))
    if (!target) {
      if (!existsSync(path)) failures.add(`${base.pathname}: missing page ${href}`)
      continue
    }
    if (url.hash && !pages.get(target)?.ids.has(decodeURIComponent(url.hash.slice(1)))) {
      failures.add(`${base.pathname}: missing anchor ${href}`)
    }
  }
}

if (failures.size > 0) throw new Error(`Broken documentation links (${failures.size}):\n${[...failures].join('\n')}`)
console.log(`Documentation links verified across ${pages.size} generated pages`)
