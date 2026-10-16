# UX / UI Design Handoff Spec

## 1. Information architecture (IA)

- Topic workbench
  - Onboarding (high / low involvement)
  - Intake (input + weights)
  - Pipeline (stage progress)
  - Results (evidence, comparison, convergence)
- Product and UX
  - Personas, journeys, metrics, strategy
- Architecture and operations
  - Service topology, security policy, release plan

## 2. Key flows

### High-involvement flow
1. The user fills in the input
2. Each stage shows its automatic actions and stage results
3. A human confirmation gate is triggered at the convergence stage
4. "Adopt recommended path" is enabled only after every item is confirmed

### Low-involvement flow
1. The user fills in the input
2. The system runs the whole pipeline automatically
3. A recommendation is output
4. In the post-hoc correction module, the user can pick a different path and add a note

### Conflicting-evidence fallback flow
1. Conflict detection fires
2. The UI shows the conflicting Evidence IDs
3. The automatic final answer is blocked
4. The user performs a manual review, then continues

## 3. Page states

- Empty: when there are no past sessions, guide the user through the first run
- Loading: stage progress is visible, so the wait never feels like a black box
- Error: offer retry suggestions and hints for correcting the input
- Success: show the recommendation and next actions

## 4. Components

- `PipelineItem`
  - States: idle/running/done/error
  - Fields: name / detail / progress

- `EvidenceTable`
  - Required: source tier, relevance, credibility, conflict flag
  - Clicking a source link fires an analytics event

- `PathComparisonTable`
  - Fixed columns: novelty / feasibility / impact / risk / evidence coverage / overall score / confidence
  - Highlights the currently selected path

- `HumanGateChecklist`
  - Hard gate in high-involvement mode
  - Final adoption is disabled until every item is confirmed

## 5. Accessibility

- Every interactive element is keyboard-accessible
- Color is never the only indicator of state
- Tables scroll horizontally on narrow screens
- Every input has a label

## 6. Visual and interaction principles

- Information first: structure complex problems before visualizing them
- Visible risk: highlight conflicts and low-credibility sources
- Transparent decisions: every conclusion traces back to evidence
- Correctable: always provide a human override

## 7. Boot and auth flow

### Boot Screen
1. Pixel-style system boot sequence (10 log lines printed one by one + progress bar)
2. Logo reveal animation (glow pulse + particle effect)
3. Transition to the Auth page

### Auth Gate
- Terminal-style sign-in / sign-up form
- Custom logo + product name "Research Topic Agent v1.0"
- Toggle between sign-in and sign-up

## 8. Subscription and export

### Paywall
- Free / Pro side-by-side comparison
- Free: full pipeline, Mock data, 8 history entries, i18n, themes
- Pro: Markdown/PDF export, unlimited LLM calls, priority support, run comparison, team collaboration
- On Free, export buttons show a [PRO] tag; clicking one opens the paywall

### No-LLM Guard
- Clicking Run without an API key configured opens a dialog
- Three buttons: Go to settings / Mock preview / Cancel

## 9. Sessions and persistence

- Session records are stored in IndexedDB (no size limit)
- The sidebar history list replays the full result on click
- Iteration plans are also persisted to IndexedDB
- Legacy data is migrated from localStorage automatically

## 10. Scrolling and navigation

- While the pipeline runs, the view follows the latest content
- Auto-follow pauses when the user scrolls manually
- Fixed quick-navigation anchors (input, thinking, architecture, evidence, paths)

## 11. Auth page

- The sign-in / sign-up (Auth Gate) page has a **floating toolbar**: theme toggle (light / dark) and language toggle (Chinese / English).
- The toolbar is **fixed** to the **top-right corner** of the viewport and does not scroll away with the form, so appearance and language can be changed at any point during auth.

## 12. AI thinking visualization

- **`StreamPanel`**: shows the pipeline's **4 stages**, with **step navigation** between stages (switch to view any stage).
- **Each stage**: a **collapsible Markdown thinking area** (streamed / summary text) + **structured DataCards** (the stage's core structured data).
- **Convergence stage**: dedicated layouts for the final decision, including the **recommendation card** (with a numbered list of reasons), a **vertical timeline for the 7-day plan**, and **confirmation cards**.
- **Anthropic**: `thinking_delta` reasoning content renders in a separate **collapsible `ThinkingBlock`**, kept apart from the main answer and structured blocks so it is not confused with the regular `content` stream.
