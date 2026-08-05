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

Here is an expanded, production-ready version of your **EquiLedger AI README**. It retains your original vision while adding structured sections for the system architecture, detailed end-to-end workflows, technical installation steps, and future possibilities.

---

## 🏗️ System Architecture

```text
[ User / Browser Client ]
         │
         ├─── (1) Auth & Identity ───────────► Amazon Cognito
         ├─── (2) Upload Raw Receipt ─────────► Amazon S3 (Asset Bucket)
         │                                              │
         │                                   (3) s3:ObjectCreated Event
         │                                              ▼
         │                                    AWS Lambda (OCR Engine)
         │                                              │
         │                                   (4) Extract Structured Data
         │                                              ▼
         │                                      Google Gemini AI
         │                                              │
         ├─── (5) Fetch & Mutate API Gateways ◄─────────┘
         │               │
         ▼               ▼
 AWS API Gateway ──► AWS Lambda ────────────► Amazon DynamoDB (Ledger Storage)

```

---


## 🔄 End-to-End Execution Workflow

### 1. The Group "Pass-Around" Bill Split Workflow

1. **Receipt Capture:** A user uploads a receipt image directly through the client app to an S3 bucket.
2. **Automated Parsing:** The `s3:ObjectCreated` trigger invokes a Python AWS Lambda function, passing the image payload to **Google Gemini AI**.
3. **Structured Extraction:** Gemini extracts line items, base prices, tax, tips, and service charges, returning a structured JSON payload to the client.
4. **Interactive Assignment (Single-Phone Pass):**
* The host user passes the phone around the table.
* Each participant taps the items they consumed.
* The app automatically calculates proportional tax and tip multipliers for each individual item.


5. **Ledger Commit:** The final calculated balances are committed to **Amazon DynamoDB**, updating the group ledger instantly.

### 2. The Personal Wallet Tracking Workflow

1. **Expense Ingestion:** Receipts or digital invoices are uploaded to the personal vault.
2. **Category Classification:** The AI pipeline categorizes the expense (e.g., Groceries, Utilities, Subscriptions).
3. **Budget Tracking:** DynamoDB updates running totals against monthly budget thresholds.

---

## 🔮 Future Possibilities & Roadmap

* **UPI & Venmo Deep Linking:** One-tap settlement triggers directly from the final ledger view into instant payment apps (UPI, Venmo, PayPal).
* **Multi-Currency Real-time Conversion:** Automated FX rate fetching for cross-border trips and international split-expenses.
* **Predictive Expense Analytics:** Utilizing historical DynamoDB expense patterns to forecast upcoming monthly fixed overheads and group contribution requirements.
* **Offline-First PWA Support:** Service Worker implementation allowing users to capture bills in zero-connectivity environments (e.g., remote camping trips) and sync upon reconnection.
* **Automated WhatsApp/Telegram Reminders:** Webhook-driven settlement notifications sent to debtors via messaging bots.

---

## 💻 Local Development Setup

### Prerequisites

* AWS CLI configured with valid deployment credentials
* AWS SAM CLI installed
* Python 3.10+
* Google Gemini API Key

### Deployment

1. **Clone the repository:**
```bash
git clone https://github.com/your-username/equiledger-ai.git
cd equiledger-ai

```


2. **Deploy Infrastructure via AWS SAM:**
```bash
sam build
sam deploy --guided

```


3. **Configure Environment Variables:**
Set your `GEMINI_API_KEY` and `COGNITO_USER_POOL_ID` in the AWS Lambda environment configuration.
