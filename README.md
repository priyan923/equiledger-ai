# equiledger-ai
EquiLedger AI is an intelligent, completely serverless web application designed to eliminate manual data-entry friction and debt procrastination. It offers a single, unified dashboard split into two tracks: a **Personal Wallet Tracker** to run household allocations paperless, and a **Group Contributed Ledger** featuring a smart single-phone pass-around mechanic.
The Market Gap Addressed
1. **The Automation Gap:** Traditional budgeting apps demand systematic, exhausting manual log entry, leading to sudden user drop-offs.
2. **The Calculation Procrastination Trap:** Peer-to-peer group apps fail when individual users order varied items on one bill. Calculating exact proportional tax allocations manually is a tedious mathematical chore, stalling settlement activities for weeks or months. 

EquiLedger AI fixes this by running **localized client-side OCR automation** combined with an interactive pass-around interface requiring zero extra app downloads for friends at the table.
 Cloud Architecture & Native Tech Stack

Our system utilizes a hybrid model engineered to operate completely inside zero-overhead, cost-free pricing tiers:

* **Frontend Engine & Backend Routing:** `Next.js` running on `Vercel Serverless Architecture` (Continuous Deployment tied directly to GitHub production loops).
* **AI Vision Layer:** `Tesseract.js` — An open-source Optical Character Recognition subsystem executing inside the user's local web client, bypassing expensive cloud AI billing parameters.
* **Persistent Database Storage:** `Amazon DynamoDB` — Managed NoSQL data platform running on the AWS Always-Free Tier to evaluate active ledgers and debt tracking profiles.
* **Backup Object Architecture:** `Amazon S3` — Asset bucket preserving raw receipt copies securely for future cloud compliance checks.
