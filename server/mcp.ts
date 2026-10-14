#!/usr/bin/env -S npx tsx
// Read-only MCP server for Research Thinking. Run: pnpm mcp  (stdio)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { propose, type Deps } from './research'

const ok = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] })
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }] })
const readOnly = { readOnlyHint: true, openWorldHint: true }

export function createServer(deps: Deps = {}): McpServer {
  const server = new McpServer({ name: 'research-thinking', version: '0.1.0' })

  server.registerTool(
    'propose_directions',
    {
      title: 'Propose research directions',
      description:
        'Turn a research interest into 3+ ranked research directions (hypothesis, method, first experiment, stop condition) ' +
        'backed by evidence. evidence="openalex" (default) uses real papers; every citation is checked and labelled ' +
        'verified / not-found / broken / search-link. evidence="demo" is illustrative only.',
      inputSchema: {
        interest: z.string().min(3).describe('The research interest, e.g. "graph RAG for legal question answering"'),
        domain: z.string().optional().describe('Problem domain, e.g. "case law"'),
        evidence: z.enum(['openalex', 'demo']).default('openalex'),
      },
      annotations: readOnly,
    },
    async ({ interest, domain, evidence }) => {
      try {
        return ok(await propose({ interest, domain, evidence }, deps))
      } catch (e) {
        return fail(e)
      }
    },
  )

  server.registerTool(
    'expand',
    {
      title: 'Expand one research direction',
      description:
        'Go deeper on one direction: returns the best-matching path with first experiment, stop condition, next 7 days, ' +
        'and supporting papers from OpenAlex with citation checks.',
      inputSchema: {
        direction: z.string().min(3).describe('The direction name or hypothesis to expand'),
        interest: z.string().min(3).describe('The broader research interest it belongs to'),
      },
      annotations: readOnly,
    },
    async ({ direction, interest }) => {
      try {
        const r = await propose({ interest: `${direction} ${interest}`, seed: direction }, deps)
        const best = r.directions.find((d) => d.id === r.recommended) ?? r.directions[0]
        return ok({ schemaVersion: 1, direction: best, nextSevenDays: r.nextSevenDays, evidence: r.evidence, stages: r.stages })
      } catch (e) {
        return fail(e)
      }
    },
  )
  return server
}

if (process.argv[1] && /server[/\\]mcp\.ts$/.test(process.argv[1])) {
  createServer().connect(new StdioServerTransport()).catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
