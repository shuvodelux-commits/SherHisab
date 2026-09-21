# SherHisab Product, Architecture, and Migration Decisions

**Date:** 2026-09-21  
**Status:** Living decision log  
**Target repository:** `shuvodelux-commits/SherHisab`  
**Legacy ERP reference:** `shuvodelux-commits/sherERP_Mohim`

---

## 1. Core Product Direction

SherHisab will be built by modernizing the existing Google Apps Script ERP into a professional multi-tenant ERP.

The main principle is:

> Build the business ERP first. Keep Version 1 simple. Add subscriptions and monetization after the ERP is usable. Improve security, infrastructure, and advanced architecture later.

Priority order:

1. Core business functionality
2. Free / Pro / Premium isolation and monetization
3. Security hardening and stronger tenant isolation
4. Architectural and infrastructure improvements
5. Scaling improvements only when real usage requires them

Version 1 must not be slowed down by unnecessary complexity.

---

## 2. Version 1 Technology Stack

### Frontend

- React
- TypeScript
- Vite
- shadcn/ui

### Backend

- Hono
- TypeScript

### Database

- PostgreSQL

### Database Access

Use a lightweight repository layer.

```text
Business Logic
    ↓
Repository
    ↓
PostgreSQL
```

The repository layer should remain simple and should not become a complex abstraction framework.

---

## 3. Cloudflare and Future VPS Deployment

### Initial Version

Use Cloudflare where practical.

```text
React / Vite PWA
        ↓
Cloudflare
  ├─ Static frontend
  └─ Hono API
        ↓
PostgreSQL
```

PostgreSQL should remain the main database from the beginning.

If required, use Cloudflare-supported PostgreSQL connectivity such as Hyperdrive.

### Later Migration

After the first months, SherHisab should be easy to move to a normal VPS.

```text
Cloudflare Edge
      ↓
Docker VPS
  ├─ Hono API
  └─ Application
      ↓
PostgreSQL
```

Cloudflare can remain in front for DNS, CDN, and protection.

### Kubernetes

Kubernetes is not required for Version 1.

Consider Kubernetes only later if real usage creates a clear need for:

- multiple nodes
- high availability
- independent scaling
- complex deployment requirements
- larger operational infrastructure

---

## 4. Version 1 Architecture Philosophy

Use a simple modular application.

Do not introduce:

- microservices
- Kafka
- event sourcing
- full CQRS infrastructure
- Redis without a real need
- Kubernetes during the first build
- complicated distributed systems
- advanced queue systems before they are needed

Suggested application areas:

```text
auth/
tenants/
parties/
products/
purchases/
sales/
inventory/
expenses/
bank/
finance/
vendors/
reports/
settings/
```

Main rule:

> Simple architecture, serious business logic.

---

## 5. Multi-Tenant Direction

SherHisab is a multi-tenant ERP.

Important business records should contain:

```text
id
tenant_id
created_at
updated_at
```

Use UUID-style identifiers for the new system.

The application must always scope data to the authenticated tenant.

Advanced PostgreSQL Row Level Security can be added during the security-hardening phase.

Do not overbuild tenant infrastructure during the first business-functionality phase.

---

## 6. Google Apps Script Migration Strategy

The existing `sherERP_Mohim` Google Apps Script ERP is the behavioral reference.

Do not perform a big-bang rewrite.

Migrate in working business slices.

Recommended order:

1. Application foundation
2. Tenant-aware schema
3. Products and master data
4. Party system
5. Purchases
6. Inventory and FIFO lots
7. POS and Sales
8. Customer and Supplier ledgers
9. Expenses
10. Cash and Bank
11. Business Finance
12. Vendor workflows
13. Returns
14. Edit/Delete correction workflows
15. Dashboard
16. Reports
17. Invoice and printing
18. WhatsApp sharing
19. Legacy data migration
20. Pilot with a real business
21. Free / Pro / Premium
22. SMS and monetization
23. Referral system
24. Security hardening
25. Offline and scaling improvements when justified

---

## 7. Party Model

SherHisab will use one unified Party identity.

A Party can be either:

- a person
- an organization/business

Example structure:

```text
parties
-------
id
tenant_id
party_type
name
phone
normalized_phone
address
email
notes
status
created_at
updated_at
```

Party roles:

```text
party_roles
-----------
tenant_id
party_id
role
```

Supported roles include:

- CUSTOMER
- SUPPLIER
- VENDOR
- PAYEE
- OWNER
- LENDER
- BORROWER

One Party can have multiple roles.

Example:

```text
Mohammad Rahim

Roles:
CUSTOMER
SUPPLIER
OWNER
BORROWER
```

Do not create separate identity records for the same real-world person simply because the person has several business roles.

---

## 8. Party Identity and Accounting Balances

Identity is unified.

Accounting balances are not automatically unified or netted.

Example:

```text
Customer Due          = 5,000
Owner Capital         = 50,000
Borrower Receivable   = 10,000
Supplier Payable      = separate
```

These balances remain independent.

Do not automatically calculate a net balance across different Party roles.

---

## 9. Party User Interface

Keep familiar screens:

- Customers
- Suppliers
- Vendors
- Expense Payees
- Business Finance

These screens are role-filtered Party views.

A Party profile can show all roles and their independent balances.

Example:

```text
Mohammad Rahim
017xxxxxxxx

Roles:
Customer | Supplier | Borrower

Customer Due          5,000
Supplier Payable      8,000
Borrower Receivable  10,000
```

When an existing Party gets a new role, add the role instead of creating a duplicate Party.

---

## 10. Legacy Party Migration

When migrating old records from:

- Customers
- Suppliers
- Vendors
- Expense Payees
- Finance Persons

preserve:

- original legacy source
- original legacy ID

Do not automatically merge records only because names are equal.

Normalized phone numbers and other reliable evidence can be used to identify possible duplicates.

Use a controlled review/merge process.

---

## 11. Party Balance Adjustment

The fixed feature name is:

> **Party Balance Adjustment**

This feature allows an authorized user to explicitly adjust value between different roles of the same Party.

This is not automatic netting.

### Example

Initial position:

```text
Customer Due          5,000
Owner Capital        50,000
Borrower Receivable 10,000
```

Adjustment 1:

```text
From: Owner Capital
To: Customer Due
Amount: 5,000
```

Result:

```text
Customer Due          0
Owner Capital        45,000
Borrower Receivable 10,000
```

Adjustment 2:

```text
From: Owner Capital
To: Borrower Receivable
Amount: 5,000
```

Final result:

```text
Customer Due          0
Owner Capital        40,000
Borrower Receivable  5,000
```

### Accounting Rule

Party Balance Adjustment is an internal balance adjustment.

Therefore:

- no Cash Book movement
- no Bank Book movement
- linked ledger entries must be created
- the adjustment must be auditable

Store:

- adjustment ID
- tenant ID
- party ID
- source role
- destination role
- amount
- business date
- reason
- user
- timestamps

---

## 12. FIFO Lot Identity

Every stock lot should preserve original provenance.

Important information includes:

- original purchase/opening/acquisition date
- product
- variant where applicable
- source type
- source reference
- purchase price
- supplier
- original quantity
- remaining quantity
- selling price
- batch/expiry information when supported

FIFO ordering must use the original acquisition date.

---

## 13. Sales Return and FIFO

When a customer returns stock that originally came from a known lot:

> Restore the returned quantity to the exact original lot.

Do not create a new lot using the return date when the original lot is known.

Example:

```text
LOT-A purchased: 01 January
LOT-B purchased: 01 February

LOT-A becomes fully sold.

Customer returns 1 unit from LOT-A on 15 March.
```

The returned unit should restore:

```text
LOT-A
Original Date: 01 January
Remaining Quantity: 1
```

The next FIFO sale sees:

```text
1. LOT-A - 01 January
2. LOT-B - 01 February
```

Therefore the returned old stock sells according to its original FIFO position.

Restoring returned stock must not change:

- original acquisition date
- lot identity
- purchase cost
- supplier provenance
- batch/expiry provenance
- FIFO order

If original lot evidence is unavailable, use a clearly identified fallback lot rather than pretending the original lot is known.

---

## 14. Sale-to-Lot Evidence

Sales must preserve which stock lots were consumed.

Conceptual structure:

```text
sale_item_lots
--------------
sale_item_id
stock_lot_id
qty_consumed
qty_returned
unit_cost_at_sale
unit_sell_price_at_sale
```

This supports:

- accurate FIFO cost
- accurate historical profit
- correct sales returns
- restoration to the original lot
- auditing

---

## 15. Lot Selling Price

SherHisab will use the cleaner approach:

> **Edit Lot Selling Price**

Routine selling-price changes should not require editing the original Purchase Invoice.

Example:

```text
Lot      Source    Purchase Date   Cost   Sell Price   Remaining
LOT-001  PUR-001   01 Jan          80     100          5
LOT-002  PUR-005   15 Feb          90     120          50
```

A user can edit the selling price of a specific lot.

Changing a lot selling price must:

- affect future sales from that lot
- affect units later returned to that same original lot
- not change historical invoices
- not change historical profit
- not change purchase cost
- not change FIFO order
- not change original acquisition date
- not change stock quantity
- not create a new lot

---

## 16. Product Default Selling Price

When changing a lot selling price, provide an optional checkbox:

> **Also update Product Default Selling Price**

If selected:

- update the selected lot price
- update product default selling price

If not selected:

- only the selected lot price changes

This supports scenarios such as:

```text
LOT-001 = 100
LOT-002 = 120
Product Default = 120
```

---

## 17. Purchase Edit vs Lot Price Edit

These represent different intentions.

### Purchase Edit

Use Purchase Edit to correct the original purchase record.

Examples:

- incorrect quantity
- incorrect purchase price where safe
- incorrect supplier
- incorrectly entered selling price

### Edit Lot Selling Price

Use this when the original purchase was correct but the business later changes the future selling price of remaining stock.

---

## 18. Current Legacy Lot Pricing Behavior

The existing `sherERP_Mohim` repository already includes:

- per-lot Sell Price
- Purchase Item Sell Price
- Product Default Selling Price
- FIFO lot pricing
- POS automatic pricing based on FIFO lots
- sale-lot selling-price evidence
- Purchase Edit support for updating lot selling price

SherHisab will keep the useful behavior but improve the UX by separating Purchase correction from routine lot-price changes.

---

## 19. WhatsApp Direction

WhatsApp Version 1 will use manual sharing.

No automatic WhatsApp Business API integration is required initially.

Manual sharing should support:

1. prepared text summary
2. complete document sharing such as:
   - invoice
   - payment receipt
   - customer ledger
   - PDF or JPG

The user manually presses Send in WhatsApp.

WhatsApp is separate from SMS.

### Commercial Direction

Current intended direction:

- Free/trial: very limited WhatsApp usage
- Pro: unlimited text/manual sharing with limited full document sharing
- Premium: unlimited/fullest sharing allowance

Exact quotas can be finalized later.

---

## 20. SMS Direction

SherHisab should support:

- automatic transactional SMS
- manual SMS
- later promotional/bulk SMS campaigns

SMS is also a revenue source.

SherHisab buys SMS capacity from external providers.

Tenants buy fixed SMS packages from SherHisab.

Tenants see an SMS unit balance.

Provider credentials remain controlled by SherHisab.

### Initial Payment Flow

Initial SMS package purchase may use:

- bKash
- Nagad
- bank transfer
- manual payment verification

Flow:

```text
Choose Package
    ↓
Make Payment
    ↓
Submit Reference
    ↓
Platform Admin Verifies
    ↓
Approve / Reject
    ↓
SMS Units Credited
```

Platform Admin may adjust credited SMS quantity during approval.

Store both:

- original package quantity
- final credited quantity
- adjustment reason

---

## 21. SMS Segment Billing

SMS balance is deducted by actual SMS segments.

This is important for:

- Bangla Unicode SMS
- long messages

If the tenant does not have enough balance for the full message:

- do not partially send it
- the ERP transaction must still succeed
- SMS should be skipped
- record insufficient SMS balance
- warn the appropriate admin

SMS failure must not roll back a Sale, Payment, or other ERP transaction.

---

## 22. SMS Events and Templates

Tenant Administrators can configure notification events such as:

- Sale completed
- Due sale
- Payment received
- Fully paid
- Return
- Due reminder
- Warranty/service reminder
- future events

Each event can support behavior such as:

- automatic
- manual only
- disabled

Templates support:

- English
- Bangla

Tenant Administrators can edit their own templates.

Scheduled due reminders are part of the intended product.

Promotional SMS campaigns are also intended later.

Transactional messages should receive higher operational priority than promotional campaigns.

---

## 23. Subscription and Monetization Model

SherHisab can combine:

1. Base plans
   - Free
   - Pro
   - Premium

2. Feature add-ons
   - Invoice Printing
   - Advanced Reports
   - WhatsApp Customer Connect
   - Warranty
   - future paid modules

3. Capacity add-ons
   - example: +100 invoices per billing cycle

4. Usage products
   - SMS packages

5. Promotional grants

6. Referral rewards

---

## 24. Add-ons and Capacity

Feature add-ons can support:

- monthly billing
- yearly billing

Capacity packs can stack.

Example:

```text
+100 invoices
+100 invoices
+100 invoices
= +300 invoices
```

Unused recurring monthly capacity does not roll over.

Quota reset follows the tenant subscription billing cycle rather than a universal calendar-month reset.

Prefer soft limits/grace behavior where reasonable.

Existing historical data must remain accessible.

---

## 25. Free Trial / Free Access

Free access is time-limited.

The platform can configure a default free period such as:

- 30 days
- 60 days
- 90 days

A tenant-specific override may also be possible.

After access expires, use:

> **Restricted Read-Only Mode**

The tenant can still:

- log in
- view dashboard
- view history
- view invoices
- view ledgers
- view stock
- view balances
- export where allowed
- access billing/upgrade

New business write transactions are restricted until access is renewed or extended.

Do not delete tenant data because a plan expires.

---

## 26. Subscription Terms

Supported subscription terms:

- 1 month
- 3 months
- 6 months
- 12 months

Discounts are configurable by Platform Admin.

Plans should be data-driven/configurable.

When a tenant purchases a plan, preserve a purchase-time entitlement snapshot.

Later plan-definition changes should not silently remove already-purchased access before renewal.

---

## 27. Promotional Grants

Platform Admin can create promotions such as:

- temporary Pro access
- temporary Premium access
- discounted subscriptions
- additional quota
- bonus features
- bonus SMS where appropriate

---

## 28. Unified Commercial Purchase Flow

Use one general commercial flow where practical:

```text
Commercial Product
      ↓
Order
      ↓
Payment
      ↓
Approval / Verification
      ↓
Fulfillment
```

Fulfillment can mean:

- activate subscription
- activate add-on
- add capacity
- credit SMS units
- issue promotion
- apply referral reward

Version 1 can use manual payment verification.

Automatic payment gateways can be added later.

SherHisab platform billing must remain separate from the tenant shop's own Cash Book and Bank Book.

---

## 29. Referral System

Referral system is one level only.

Referral owners are SherHisab tenants.

Do not build a multi-level referral tree.

Default reward qualification:

- no reward for signup alone
- no reward for trial alone
- reward after the first qualifying paid purchase
- reward issued only once for that referral

Referral attribution is normally locked at signup.

Platform Admin can make an audited override when necessary.

### Referral Rewards

Campaigns can grant:

- platform account credit
- non-cash configurable benefits

Platform referral credit:

- can buy subscriptions
- can buy feature add-ons
- can buy capacity packs
- does not expire

By default, platform referral credit should not buy normal SMS packages because SMS has direct wholesale cost.

A campaign may separately award bonus SMS.

Platform credit remains separate from:

- tenant business accounting
- Cash Book
- Bank Book
- SMS balance

---

## 30. Deferred Decisions

The following are not fixed yet:

- exact WhatsApp quotas
- exact WhatsApp reset periods
- full offline synchronization architecture
- offline entitlement grace duration
- final SMS provider
- final SMS provider billing/failure settlement behavior
- ordinary-user manual SMS permissions
- customer-level SMS enabled/disabled setting
- promotional SMS marketing consent model
- advanced subscription expiry grace
- exact ORM choice
- Redis
- microservices
- Kubernetes
- advanced queue infrastructure
- final long-term hosting topology

These should be decided only when their implementation phase begins.

---

## 31. Fixed Guiding Rules

1. Build business functionality first.
2. Keep Version 1 simple.
3. Use React + TypeScript + Vite + shadcn/ui.
4. Use Hono + TypeScript for the API.
5. Use PostgreSQL as the main database.
6. Keep a lightweight repository layer.
7. Start on Cloudflare where practical.
8. Move to Docker/VPS later without rewriting business logic.
9. Do not require Kubernetes in Version 1.
10. Use one Party identity with multiple roles.
11. Keep each Party role balance independent.
12. Use Party Balance Adjustment for explicit role-to-role settlement.
13. Do not automatically net Party role balances.
14. Preserve exact stock-lot provenance.
15. Restore sales returns to the original lot whenever known.
16. Returned stock keeps its original FIFO position.
17. Preserve sale-to-lot allocation evidence.
18. Use dedicated Edit Lot Selling Price for routine price changes.
19. Do not change historical invoices or historical profit when lot selling price changes.
20. Use Purchase Edit only to correct the purchase record.
21. Add Free / Pro / Premium after the ERP is usable.
22. Keep platform billing separate from tenant business accounting.
23. Add security hardening after core functionality, without compromising basic V1 security.
24. Add scaling complexity only when real usage requires it.

---

## 32. Language Rule

All SherHisab project documentation, architecture documents, technical specifications, code comments, commit messages, and implementation plans should be written in **English** unless a future document is explicitly requested in another language.

User-facing product localization may support Bangla and English independently.

---

## 33. Change Policy

When a future decision changes something in this document:

1. update this file
2. clearly mark the previous decision as superseded when useful
3. record the new approved decision
4. do not silently reinterpret old requirements during implementation
