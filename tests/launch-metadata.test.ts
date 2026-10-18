import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('launch metadata', () => {
  it('declares canonical and social preview metadata', () => {
    const html = read('../index.html')
    expect(html).toContain('<link rel="canonical" href="https://research.ledring.dev/"')
    expect(html).toContain('<meta property="og:image" content="https://research.ledring.dev/og.png"')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
  })
  it('advertises the sitemap to crawlers', () => {
    expect(read('../public/robots.txt').split('\n')).toContain('Sitemap: https://research.ledring.dev/sitemap.xml')
  })
})
