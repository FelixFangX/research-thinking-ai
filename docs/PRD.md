# Research Topic Agent PRD

## 1. Product goals

Give researchers a `pre-topic decision system` that turns a "vague interest" into an "actionable research path".

Core goals:
- Produce 3 candidate paths and a recommendation within 20 minutes.
- Every recommendation must be traceable to evidence, reviewable by a human, and falsifiable by experiment.
- For the user it is a "decision amplifier", not a black box that "replaces research judgment".

## 2. User segments and JTBD

- First-year master's / PhD students: need a sense of direction fast, to avoid major rework after the proposal.
- New lab members: need to find a direction they can start on quickly, within their advisor's constraints.
- Independent researchers: need high-quality direction screening with limited resources.

JTBD:
- When I only have an interest and some scattered ideas, I want comparable direction paths quickly, so that I can make a defensible choice before a group meeting or my proposal defense.

## 3. Scope

### In Scope
- Research interest input and constraint modeling
- Literature retrieval and evidence pool construction
- Candidate path comparison (novelty / feasibility / impact / risk / evidence)
- Converged recommendation and a 7-day action plan
- Two interaction modes: high involvement and low involvement

### Out of Scope
- Writing full papers
- A long-running experiment management platform
- Replacing general academic search engines

## 4. Key features

1. **Mode selection**
   - High involvement: human confirmation gates at each step
   - Low involvement: runs the whole pipeline automatically; the user corrects course at the end

2. **Complexity-aware routing**
   - Assess input complexity -> automatically choose an architecture:
   - Single agent / workflow orchestration / multi-agent / RAG / knowledge graph

3. **Evidence governance**
   - Source tiers: T1/T2/T3
   - Standardized citation template
   - Hard gate on conflicting evidence (no automatic final answer while conflicts are unresolved)

4. **Decision output**
   - Scoring matrix for candidate paths
   - Recommended path + fallback paths + falsifiable experiments + stop-loss conditions

## 5. Non-functional requirements

- Usability: desktop first, usable on mobile
- Performance: first screen < 2s, key interactions < 200ms (excluding LLM calls)
- Traceability: every key decision has an Evidence ID
- Security: minimize upload of sensitive data; audit logs can be replayed
- Observability: both product and AI metrics are observable

## 6. North star and guardrail metrics

North star:
- `accepted_recommendation_within_24h`

Guardrail metrics:
- Hallucination Incident Rate
- Conflict detection recall
- Human correction rate (too low or too high both indicate the system has drifted)
