# EquiLedger AI

EquiLedger AI is an intelligent, completely serverless web application designed to eliminate manual data-entry friction and debt procrastination. It offers a single, unified dashboard split into two tracks: a **Personal Wallet Tracker** to run household allocations paperless, and a **Group Contributed Ledger** featuring a smart single-phone pass-around mechanic.

### 🌐 Live Application
**Access the deployed application here:** [https://equiledger-ai.vercel.app](https://equiledger-ai.vercel.app) 

---

### The Market Gap Addressed
1. **The Automation Gap:** Traditional budgeting apps demand systematic, exhausting manual log entry, leading to sudden user drop-offs.
2. **The Calculation Procrastination Trap:** Peer-to-peer group apps fail when individual users order varied items on one bill. Calculating exact proportional tax allocations manually is a tedious mathematical chore, stalling settlement activities for weeks or months. 

EquiLedger AI fixes this by running a **cloud-native AI OCR pipeline** combined with an interactive pass-around interface requiring zero extra app downloads for friends at the table.

### Cloud Architecture & Native Tech Stack

* **Frontend Engine:** Pure Static `HTML`, `CSS`, and `Vanilla JavaScript` — Ensuring ultra-fast load times with no heavy frameworks.
* **Backend API & Compute:** `AWS Lambda (Python)` & `Amazon API Gateway` — A fully serverless routing and execution layer.
* **Authentication:** `Amazon Cognito` — Secure OAuth2 session tokens, user pools, and native email/password federated identity management.
* **AI Vision Layer:** `Google Gemini AI`  — A highly accurate OCR and data extraction pipeline triggered automatically via serverless events.
* **Persistent Database Storage:** `Amazon DynamoDB` — Managed NoSQL data platform running on AWS to evaluate active ledgers, activity logs, and debt tracking profiles.
* **Storage Architecture:** `Amazon S3` — Asset buckets that preserve raw receipt copies securely and automatically trigger the AI extraction Lambdas (`s3:ObjectCreated`).
* **Infrastructure as Code (IaC):** `AWS SAM` (Serverless Application Model) — Declarative YAML templating for seamless deployment and resource provisioning.