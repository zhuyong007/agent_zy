﻿﻿﻿﻿﻿# Debug Session: startup-white-screen
- **Status**: [OPEN]
- **Issue**: Project starts but the web app shows a white screen instead of rendering the expected home page.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-startup-white-screen.ndjson

## Reproduction Steps
1. Start the project.
2. Open the web app in the browser.
3. Observe the page renders as a white screen.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Frontend throws before React finishes initial render | High | Low | Instrumented |
| B | Home page data/query initialization throws and leaves the app blank | High | Low | Instrumented |
| C | Static entry asset or client bundle fails to load | Medium | Low | Waiting for reproduction |
| D | Hidden startup process leaves stale services/ports and the app connects to a bad instance | Medium | Medium | Pending |

## Log Evidence
- Debug server started at `http://127.0.0.1:7777/event`
- Instrumented files: `apps/web/src/main.tsx`, `apps/web/src/components/dashboard-page.tsx`

## Verification Conclusion
- Pending
