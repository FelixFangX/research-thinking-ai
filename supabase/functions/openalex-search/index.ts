// Supabase Edge Function: openalex-search
// Replaces buildEvidence() Mock data with real OpenAlex API calls
// API docs: https://api.openalex.org

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OpenAlexWork {
  id: string           // e.g. "W2893098453"
  title: string
  publication_year: number
  primary_location?: {
    source?: {
      display_name?: string
      host_organization_name?: string
    }
  }
  open_access?: { is_oa: boolean }
  cited_by_count: number
  summary ?: string
  concepts?: Array<{ display_name: string; level: number; score: number }>
}

interface EvidenceItem {
  id: string
  title: string
  source: string
  url: string
  year: number
  tier: 'T1' | 'T2' | 'T3'
  claim: string
  relevance: number
  credibility: number
  conflictsWith: string[]
}

function classifyTier(work: OpenAlexWork): 'T1' | 'T2' | 'T3' {
  const source = work.primary_location?.source
  const hostOrg = source?.host_organization_name ?? ''
  const citedBy = work.cited_by_count

  // T1: High-cited journals, top publishers, major conferences
  if (
    citedBy > 100 ||
    /nature|science|pnas|ieee|acm|arxiv|springer|elsevier|oxford|cambridge|mit press/i.test(hostOrg)
  ) {
    return 'T1'
  }

  // T2: Preprints, moderate citation, specialized venues
  if (/arxiv|biorxiv|medrxiv|ceur|scholarworks/i.test(hostOrg) || citedBy > 10) {
    return 'T2'
  }

  // T3: Everything else
  return 'T3'
}

function buildSearchQuery(topic: string, domain: string, seedIdea: string): string {
  const keywords = [topic, domain, seedIdea]
    .join(' ')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 8)
  return keywords.join(' ')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { topic, domain, seedIdea, locale = 'en' } = await req.json()

    if (!topic && !seedIdea) {
      return new Response(JSON.stringify({ error: 'topic or seedIdea required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const searchQuery = buildSearchQuery(topic, domain, seedIdea)
    const encodedQuery = encodeURIComponent(searchQuery)

    // Fetch from OpenAlex API
    const openAlexUrl = `https://api.openalex.org/works?search=${encodedQuery}&per-page=12&sort=cited_by_count:desc`
    const response = await fetch(openAlexUrl, {
      headers: { 'User-Agent': 'Research-Topic-Agent/1.0 (https://github.com/ColeFang/research-thinking-ai)' },
    })

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`)
    }

    const data = await response.json()
    const works: OpenAlexWork[] = data.results ?? []

    // Build evidence items
    const evidence: EvidenceItem[] = works.slice(0, 8).map((work, index) => {
      const tier = classifyTier(work)
      const title = work.title || 'Untitled'
      const year = work.publication_year || new Date().getFullYear()
      const sourceName = work.primary_location?.source?.display_name || 'OpenAlex'
      const citedBy = work.cited_by_count

      // Generate conflict pairs: high-cited "scaled LLM" vs recent "causal/interpretable"
      const conflictsWith: string[] = []
      if (index === 0 && works.length > 2) {
        // First (most cited) conflicts with recent preprints
        const recentIndex = works.findIndex(w => w.publication_year >= 2025)
        if (recentIndex > 0) {
          conflictsWith.push(`E${recentIndex + 1}`)
        }
      }

      // Build claim based on tier and content
      let claim = ''
      if (tier === 'T1') {
        claim = locale === 'zh'
          ? `高被引(${citedBy})学术工作，发表在${sourceName}，需验证方法论可复现性。`
          : `Highly-cited (${citedBy}) academic work from ${sourceName}; verify methodological reproducibility.`
      } else if (tier === 'T2') {
        claim = locale === 'zh'
          ? `近年前沿工作(${year})，关注度${citedBy > 20 ? '较高' : '中等'}，需注意证据时效性。`
          : `Recent frontier work (${year}), ${citedBy > 20 ? 'high' : 'moderate'} attention (cited ${citedBy}×); verify currency.`
      } else {
        claim = locale === 'zh'
          ? `补充来源(${sourceName})，作为背景参考，不作为核心证据。`
          : `Supplementary source (${sourceName}); use as background only.`
      }

      return {
        id: `E${index + 1}`,
        title,
        source: `OpenAlex | ${sourceName}`,
        url: work.id.replace('https://openalex.org/', 'https://doi.org/'),
        year,
        tier,
        claim,
        relevance: Math.min(95, 60 + (citedBy > 50 ? 20 : citedBy)),
        credibility: tier === 'T1' ? 88 : tier === 'T2' ? 72 : 55,
        conflictsWith,
      }
    })

    // Detect additional conflicts: T1(causal/interpretable) vs T2(scaled end-to-end)
    // if we find evidence of both types, mark conflict
    const hasInterpretability = evidence.some(e =>
      /interpret|xai|explain|causal|transparency|faithful/i.test(e.title)
    )
    const hasEndToEnd = evidence.some(e =>
      /end-to-end|scaling|large model|gpt|bert|transformer/i.test(e.title) && e.tier === 'T2'
    )

    if (hasInterpretability && hasEndToEnd) {
      const intIdx = evidence.findIndex(e =>
        /interpret|xai|explain|causal|transparency|faithful/i.test(e.title)
      )
      const eeIdx = evidence.findIndex(e =>
        /end-to-end|scaling|large model|gpt|bert|transformer/i.test(e.title) && e.tier === 'T2'
      )
      if (intIdx >= 0 && eeIdx >= 0 && intIdx !== eeIdx) {
        if (!evidence[intIdx].conflictsWith.includes(`E${eeIdx + 1}`)) {
          evidence[intIdx].conflictsWith.push(`E${eeIdx + 1}`)
        }
        if (!evidence[eeIdx].conflictsWith.includes(`E${intIdx + 1}`)) {
          evidence[eeIdx].conflictsWith.push(`E${intIdx + 1}`)
        }
      }
    }

    return new Response(JSON.stringify({ evidence, works: data.results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('openalex-search error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
