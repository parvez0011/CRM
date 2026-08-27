# Akbar Handicrafts CRM — GitHub Copilot Agent Instructions

## 1. PROJECT PURPOSE

Build a production-ready CRM + Manufacturing + Export Management + Costing system for Akbar Handicrafts.

Akbar Handicrafts is a manufacturing and export business based in Moradabad, India.

The system must NOT be a generic CRM.

It must manage the complete business lifecycle:

Customer
→ Purchase Order (PO)
→ Proforma Invoice (PI)
→ Production Planning
→ Raw Material Procurement
→ Inventory
→ Manufacturing
→ Finishing
→ Packaging
→ QC
→ Container Planning
→ Shipping
→ Commercial Invoice
→ Payment
→ Actual Cost
→ Actual Profitability

The most important business requirement is complete traceability.

Management must be able to open any PO or PI and understand:

- What the customer ordered
- What quantity was committed
- What has been produced
- What materials were consumed
- What the actual manufacturing cost was
- What packaging cost was incurred
- What QC/rework cost was incurred
- Which container contains the products
- What shipping/export expenses were incurred
- What was invoiced
- What has been paid
- What remains outstanding
- What the actual profit is
- How actual cost compares with estimated cost

---

# 2. PRIMARY DESIGN PRINCIPLE

The PI is the central commercial and costing hub.

The primary relationship is:

Customer
    ↓
PO
    ↓
PI
    ↓
Production
    ↓
Material / Labour / Manufacturing / Finishing / Packaging
    ↓
QC
    ↓
Container
    ↓
Shipping Expenses
    ↓
Commercial Invoice
    ↓
Payment
    ↓
Profitability

Every transaction must remain traceable to its source.

Do not duplicate information unnecessarily.

Users should enter information once and downstream documents should automatically reuse it.

---

# 3. NON-NEGOTIABLE RULES

1. Build real functionality, not mock screens.
2. Do not use fake data to make unfinished features appear complete.
3. Do not duplicate business logic.
4. Keep business logic out of UI components.
5. Use service/domain layers for calculations and workflows.
6. Use database transactions for financial/inventory operations.
7. Use decimal-safe calculations for money.
8. Never use JavaScript floating-point arithmetic for financial calculations.
9. Never silently modify historical financial transactions.
10. Never hard-delete completed financial or inventory records.
11. Use status, cancellation, void, reversal, or adjustment mechanisms.
12. Enforce authorization server-side.
13. Use database constraints wherever possible.
14. Every important business action must be auditable.
15. Every business-critical calculation must have automated tests.
16. Do not create unnecessary microservices.
17. Prefer a modular monolith unless there is a clear reason to separate services.
18. Avoid over-engineering.
19. Keep the application maintainable by a normal development team.
20. Do not mark a feature complete until the complete workflow works.

---

# 4. CORE BUSINESS ENTITIES

The main entities are:

- Users
- Roles
- Permissions
- Customers
- Customer Contacts
- Products
- Product Categories
- Product BOM Versions
- BOM Materials
- BOM Operations
- Raw Materials
- Suppliers
- Purchase Orders
- Purchase Order Items
- Proforma Invoices
- Proforma Invoice Items
- Production Orders
- Production Material Requirements
- Material Issues
- Inventory Transactions
- Labour Entries
- Manufacturing Costs
- Finishing Entries
- Packaging Entries
- QC Inspections
- Containers
- Container Items
- Shipments
- Expenses
- Expense Allocations
- Commercial Invoices
- Commercial Invoice Items
- Payments
- Currencies
- Exchange Rates
- Attachments
- Audit Logs
- Notifications
- System Settings

Use relational database design with proper foreign keys.

Do not store important relationships only inside arbitrary JSON fields.

---

# 5. CUSTOMER MODULE

## Customer fields

- Customer ID
- Customer Code
- Company Name
- Trading Name
- Country
- Currency
- Billing Address
- Shipping Address
- Website
- Payment Terms
- Incoterm
- Tax/VAT Information
- Status
- Notes
- Created Date
- Updated Date

## Customer Contacts

- Contact ID
- Customer ID
- Name
- Job Title
- Email
- Phone
- Department
- Primary Contact
- Active

## CRM Activities

Support:

- Enquiry
- Follow-up
- Call
- Email
- Meeting
- Task
- Note

Activities may optionally reference:

- Customer
- PO
- PI

---

# 6. PRODUCT / SKU MODULE

Every sellable product must have a unique SKU.

Fields:

- SKU
- Product Name
- Description
- Category
- Material
- Finish
- Dimensions
- Weight
- CBM
- HS Code
- Country of Origin
- MOQ
- Standard Selling Price
- Currency
- Barcode
- Product Image
- Packaging Specification
- Active/Inactive

Products must support historical versions where necessary.

Do not modify historical product information in a way that changes completed transactions.

---

# 7. PRODUCT BOM / COSTING

Each SKU may have a Bill of Materials.

Example:

SKU: HORSE-001

Materials:

- Aluminium: 8.5 KG
- Resin: 1.2 L
- Paint: configured quantity
- Packaging materials: configured quantity

Operations:

- Casting
- Welding
- Grinding
- Assembly
- Finishing
- Painting
- Packing

BOM must support:

- Material
- Quantity
- Unit
- Wastage %
- Labour operation
- Machine cost
- Overhead
- Packaging
- Effective Date
- Version
- Active/Inactive

BOMs must be versioned.

Example:

HORSE-001 BOM v1
HORSE-001 BOM v2
HORSE-001 BOM v3

Historical transactions must retain the BOM version used.

---

# 8. PURCHASE ORDER MODULE

A PO represents the buyer's order.

## PO Header

- PO Number
- Customer
- PO Date
- Delivery Date
- Currency
- Payment Terms
- Incoterm
- Destination
- Shipping Port
- Buyer Reference
- Salesperson
- Notes
- Status

## PO Items

- SKU
- Description
- Ordered Quantity
- Unit Price
- Discount
- Tax
- Total
- CBM
- NWT
- GWT
- Customer Reference

## PO Status

DRAFT
RECEIVED
UNDER_REVIEW
APPROVED
PARTIALLY_PI
FULLY_PI
IN_PRODUCTION
PARTIALLY_SHIPPED
COMPLETED
CANCELLED

The system must calculate:

PO Quantity
PI Allocated Quantity
Remaining PO Quantity
Produced Quantity
QC Passed Quantity
Packed Quantity
Shipped Quantity

Never allow PI allocation to exceed remaining PO quantity unless an authorized override is explicitly performed.

---

# 9. PROFORMA INVOICE MODULE

A PI must be created directly from a PO.

Provide:

"Create PI from PO"

The system should automatically copy:

- Customer
- PO Number
- Customer information
- SKU
- Description
- Price
- Currency
- Payment Terms
- Incoterm
- Destination
- Shipping information

The user selects the quantity for this PI.

Example:

PO = 1,000 units

PI 1 = 250
PI 2 = 250
PI 3 = 250
PI 4 = 250

Do not make users re-enter the same product data.

## PI fields

- PI Number
- PO ID
- Customer ID
- PI Date
- Currency
- Payment Terms
- Incoterm
- Destination
- Shipping Port
- Bank Details
- Notes
- Status

## PI Status

DRAFT
PENDING_APPROVAL
APPROVED
PRODUCTION_PLANNED
IN_PRODUCTION
PARTIALLY_PRODUCED
QC
PACKING
READY_TO_SHIP
PARTIALLY_SHIPPED
SHIPPED
INVOICED
PARTIALLY_PAID
PAID
CANCELLED

---

# 10. PI COSTING HUB

Every PI must display:

- Sales Value
- Estimated Cost
- Actual Cost
- Estimated Profit
- Actual Profit
- Estimated Margin
- Actual Margin
- Cost Variance
- Profit Variance

The PI must aggregate costs from:

- Materials
- Labour
- Manufacturing
- Finishing
- Packaging
- QC/Rework
- Transport
- Shipping
- Port
- Customs
- Documentation
- Other Expenses

---

# 11. ESTIMATED VS ACTUAL COST

Always maintain two separate values.

## Estimated Cost

Calculated using:

- BOM
- Current material prices
- Standard labour
- Standard finishing
- Standard packaging
- Estimated shipping

## Actual Cost

Calculated using:

- Actual material consumption
- Actual material cost
- Actual labour
- Actual manufacturing expenses
- Actual finishing
- Actual packaging
- Actual QC/rework
- Actual transport
- Actual shipping
- Actual port charges
- Actual documentation
- Other actual expenses

Never replace Estimated Cost with Actual Cost.

---

# 12. RAW MATERIAL MODULE

Materials may include:

- Aluminium
- Resin
- Iron/MS
- Paint
- Chemicals
- Polystyrene
- Cartons
- Foam
- Tape
- Labels
- Packaging material

## Supplier fields

- Supplier
- Supplier Code
- Contact
- Material Categories
- Currency
- Payment Terms
- Tax Details
- Status

## Purchase fields

- Purchase Number
- Supplier
- Material
- Quantity
- Unit
- Unit Rate
- Currency
- Tax
- Freight
- Other Charges
- Landed Cost
- Purchase Date
- Warehouse
- Batch/Lot

---

# 13. INVENTORY

Inventory must use transaction-based accounting.

Supported transactions:

- Opening Stock
- Purchase Receipt
- Material Issue
- Material Return
- Stock Transfer
- Adjustment
- Production Consumption

Never change stock directly.

Every stock movement must create an inventory transaction.

Each inventory transaction must include:

- Date/Time
- Material
- Quantity
- Unit
- Transaction Type
- Reference Document
- Source
- Destination
- User
- Reason

Default recommended valuation method:

Weighted Average Cost.

Make valuation logic modular so another method can be added later.

---

# 14. MATERIAL ISSUE

Production creates material requirements.

Example:

PI-001

Required:

Aluminium = 1,500 KG
Resin = 800 L
Iron = 400 KG

Material issue should:

1. Check available stock.
2. Determine actual material cost.
3. Create inventory transaction.
4. Reduce inventory.
5. Create production cost.
6. Link cost to production order.
7. Link production order to PI.

All steps must happen in one database transaction.

---

# 15. PRODUCTION MODULE

Production Order fields:

- Production Order Number
- PI
- PO
- SKU
- Quantity
- BOM Version
- Planned Start
- Planned Completion
- Actual Start
- Actual Completion
- Location
- Assigned Team
- Status

Statuses:

PLANNED
MATERIAL_PENDING
READY
IN_PRODUCTION
PAUSED
COMPLETED
REWORK
CANCELLED

Track:

- Planned Quantity
- Produced Quantity
- Rejected Quantity
- Rework Quantity
- Remaining Quantity

---

# 16. LABOUR / MANUFACTURING COST

Support:

- Direct Labour
- Casting
- Welding
- Grinding
- Assembly
- Finishing
- Painting
- Polishing
- Machine Time
- Electricity
- Factory Overhead
- Maintenance
- Other Manufacturing Costs

Support both:

Standard Cost

and

Actual Cost

Example:

Estimated labour = £8/unit
Actual labour = £9.20/unit

Variance = £1.20/unit

---

# 17. FINISHING

Track:

- Finish Type
- SKU
- Quantity
- Material Cost
- Labour Cost
- External Supplier Cost
- Internal Cost
- Actual Cost

Examples:

- Antique Finish
- Painting
- Polishing
- Powder Coating
- Special Finish
- Multi-layer Finish

---

# 18. PACKAGING

Packaging must be tracked by SKU.

Possible components:

- Carton
- Polystyrene
- Foam
- Plastic
- Tape
- Barcode
- Shipping Mark
- Labels
- Packing Labour

Packaging cost must flow automatically into PI profitability.

---

# 19. QC MODULE

QC is a mandatory workflow gate.

QC record:

- PI
- Production Order
- SKU
- Quantity Inspected
- Quantity Passed
- Quantity Failed
- Rework Quantity
- Defect
- Notes
- Photos
- Inspector
- Date

Statuses:

PENDING
IN_PROGRESS
PASSED
FAILED
REWORK_REQUIRED
RECHECK
CLOSED

Only QC-approved quantities may move to packing/shipping.

---

# 20. CONTAINER MODULE

Container fields:

- Container Number
- Container Type
- Booking Number
- Shipping Line
- Vessel
- Origin Port
- Destination Port
- Loading Date
- ETD
- ETA
- Seal Number
- CBM Capacity
- Used CBM
- NWT
- GWT
- Status

Statuses:

PLANNING
BOOKED
LOADING
LOADED
DOCUMENTATION
SHIPPED
ARRIVED
CLOSED
CANCELLED

## Container items

- Container
- PI
- PO
- SKU
- Quantity
- Cartons
- CBM
- NWT
- GWT

Prevent over-allocation.

Show:

Capacity
Used
Remaining
Utilization %

---

# 21. CONTAINER EXPENSES

Expenses include:

- Inland Transport
- Ocean Freight
- Port Charges
- Loading
- Documentation
- Customs
- Clearing
- Handling
- Other

Each expense must support:

- Expense ID
- Date
- Supplier/Payee
- Category
- Amount
- Currency
- Tax
- Container
- PI Allocation
- Attachment
- Payment Status

If a container contains multiple PIs, support allocation by:

- CBM
- Weight
- Product Value
- Manual Percentage
- Manual Amount

Store the selected allocation method and allocation result.

---

# 22. COMMERCIAL INVOICE

Commercial Invoice should be generated from PI + Shipment/Container.

Required:

- Invoice Number
- Invoice Date
- PI
- PO
- Customer
- Container
- SKU
- Description
- HS Code
- Country of Origin
- Quantity
- Unit Price
- Total
- Currency
- NWT
- GWT
- Shipping Details
- Incoterm
- Bank Details

No duplicate manual entry.

Generate PDF.

Invoice number must be unique.

---

# 23. PAYMENT MODULE

Track:

- Invoice
- Customer
- Invoice Amount
- Advance
- Payment
- Payment Date
- Bank Reference
- Amount Received
- Outstanding
- Due Date
- Status

Statuses:

UNPAID
PARTIALLY_PAID
PAID
OVERDUE
VOID

One invoice can have multiple payments.

Do not silently modify historical payments.

Use reversal/adjustment records.

---

# 24. EXPENSE MODULE

Expense categories:

RAW_MATERIAL
LABOUR
MANUFACTURING
FINISHING
PACKAGING
QC
TRANSPORT
FREIGHT
PORT
CUSTOMS
DOCUMENTATION
BANK_CHARGES
OTHER

Each expense must support:

- Expense Date
- Category
- Amount
- Currency
- Tax
- Supplier
- PI
- PO
- Production Order
- SKU
- Container
- Attachment
- Notes
- Approval Status

Prevent duplicate expense allocation.

---

# 25. PROFITABILITY ENGINE

For every PI:

Total Actual Cost =

Material
+ Labour
+ Manufacturing
+ Finishing
+ Packaging
+ QC/Rework
+ Transport
+ Shipping
+ Port
+ Customs
+ Documentation
+ Other Allocated Costs

Actual Profit =

Sales Value - Total Actual Cost

Actual Margin % =

Actual Profit / Sales Value × 100

Handle zero-value sales safely.

All financial calculations must use Decimal types.

---

# 26. CURRENCY

The company may purchase materials in INR and sell in GBP or other currencies.

Every money value must store:

- Amount
- Currency
- Exchange Rate where conversion occurs
- Base Currency Amount

Historical exchange rates must not change completed transactions.

Never assume all transactions are in GBP or INR.

---

# 27. RAW MATERIAL FORECAST

Forecast material requirements from:

- Open POs
- Approved PIs
- Planned Production
- Future Containers

Example:

Next 4 Containers:

Aluminium: 8,500 KG
Resin: 3,200 L
Iron: 2,100 KG

Display:

- Current Stock
- Required Quantity
- Shortage
- Current Price
- Last Purchase Price
- Weighted Average Price
- Estimated Investment
- Suggested Purchase Quantity

Do not automatically purchase material.

Forecasting only recommends.

---

# 28. ORDER 360

Every PO must have a consolidated Order 360 screen.

Example:

PO #1234
Customer: Buyer

COMMERCIAL

PO Value: £85,000
PI Value: £60,000
Remaining PO: £25,000

PRODUCTION

Planned: 1,000
Produced: 750
QC Passed: 700
Packed: 650

SHIPPING

Container 17: Shipped
Container 18: Loading
Container 19: Planning

FINANCE

Sales: £60,000
Actual Cost: £38,500
Actual Profit: £21,500
Margin: 35.8%

PAYMENT

Received: £30,000
Outstanding: £30,000

Show complete timeline/history.

---

# 29. DASHBOARDS

## Sales Dashboard

Show:

- Open POs
- PO Value
- PI Value
- Sales by Customer
- Sales by SKU
- Open Orders

## Production Dashboard

Show:

- Planned
- In Production
- Completed
- Rework
- QC Pending

## Procurement Dashboard

Show:

- Material Shortage
- Current Material Prices
- Supplier Purchases
- Future Requirements

## Shipping Dashboard

Show:

- Containers Planned
- Loading
- Shipped
- CBM Utilization

## Finance Dashboard

Show:

- Revenue
- Actual Cost
- Profit
- Margin
- Outstanding
- Overdue

## Management Dashboard

Show:

- Profit by PO
- Profit by PI
- Profit by Customer
- Profit by SKU
- Cost Variance
- Material Price Variance

---

# 30. AUDIT TRAIL

Audit all important operations:

- Created
- Updated
- Approved
- Rejected
- Cancelled
- Voided
- Payment Recorded
- Expense Approved
- Inventory Adjusted
- Status Changed
- Quantity Changed
- Price Changed

Store:

- User
- Date/Time
- Entity
- Entity ID
- Action
- Before
- After
- Reason where appropriate

---

# 31. APPROVALS

Support approval workflows.

PO:

Sales → Management

PI:

Sales → Management

Purchase:

Procurement → Authorized Approver

Expense:

User → Finance/Approver

Payment:

Finance → Reconciliation

Inventory Adjustment:

User → Authorized Approver

Approval thresholds must be configurable.

---

# 32. DATA INTEGRITY

Enforce:

- Unique PO number
- Unique PI number
- Unique Invoice number
- Unique SKU
- Unique Container number
- No PI quantity above remaining PO quantity
- No production above PI quantity without authorization
- No shipment above packed/QC-approved quantity
- No negative inventory unless explicitly configured
- No payment above invoice balance unless configured
- No duplicate expense allocation
- No cancelled record used for downstream transactions
- No historical financial record silently changed

---

# 33. SECURITY

Implement:

- Secure authentication
- Password hashing
- RBAC
- Server-side authorization
- Input validation
- File validation
- Secure file storage
- Rate limiting where appropriate
- Audit logs
- CSRF protection where applicable
- Secure sessions
- Environment secrets

Never commit:

- Passwords
- API keys
- Tokens
- Production credentials
- Customer confidential documents

---

# 34. FILES / DOCUMENTS

Attachments can be linked to:

- Customer
- PO
- PI
- Production
- Purchase
- QC
- Expense
- Container
- Invoice
- Payment

Examples:

- Buyer PO
- Supplier invoice
- Purchase receipt
- QC photos
- Packing photos
- Shipping documents
- Commercial Invoice
- Payment proof

Access must be permission-controlled.

---

# 35. PDF DOCUMENTS

Create reusable templates for:

- Proforma Invoice
- Commercial Invoice
- Packing List
- QC Report
- Cost Sheet
- Container Packing Report

Company configuration must be editable:

- Logo
- Company Name
- Address
- Tax Details
- Bank Details
- Footer
- Terms
- Numbering

Do not hard-code company information into business logic.

---

# 36. SEARCH

Every major module must support:

- Search
- Date filter
- Customer filter
- PO filter
- PI filter
- SKU filter
- Supplier filter
- Container filter
- Status filter
- Currency filter

Tables should support:

- Pagination
- Sorting
- Column selection
- Export

---

# 37. MAIN NAVIGATION

Dashboard

CRM
- Customers
- Contacts
- Activities

Sales
- Purchase Orders
- Proforma Invoices
- Price Lists

Products
- Products/SKUs
- BOM
- Costing
- Categories

Procurement
- Suppliers
- Purchases
- Raw Materials
- Inventory
- Forecast

Manufacturing
- Production
- Labour
- Finishing
- Packaging
- QC

Logistics
- Containers
- Shipments
- Shipping Expenses

Finance
- Expenses
- Commercial Invoices
- Payments
- Profitability

Reports

Administration
- Users
- Roles
- Settings
- Audit Log

---

# 38. NOTIFICATIONS

Support:

- New PO
- PO approval required
- PI approval required
- Material shortage
- Production overdue
- QC failure
- Loading due
- Shipping document pending
- Payment due
- Payment overdue
- Cost variance above threshold

Make notifications configurable.

---

# 39. REPORTS

Implement:

- PO Report
- PI Report
- Production Report
- Material Consumption
- Purchase Report
- Inventory Report
- Container Loading Report
- Shipping Expense Report
- Commercial Invoice Report
- Payment Report
- Outstanding Receivables
- PI Profitability
- PO Profitability
- Customer Profitability
- SKU Profitability
- Material Price Variance

Exports:

- CSV
- XLSX
- PDF

Reports must use the same calculation services as dashboards.

---

# 40. ARCHITECTURE

Use a modular architecture.

Recommended layers:

UI
↓
API / Controllers
↓
Application Services
↓
Domain / Business Logic
↓
Repositories / Data Access
↓
Database

Example services:

CustomerService
POService
PIService
ProductService
BOMService
ProcurementService
InventoryService
ProductionService
CostingService
QCService
PackagingService
ContainerService
ShippingService
InvoiceService
PaymentService
ExpenseService
ReportingService
AuditService

Complex business calculations must not live inside React/Vue/Angular components or route handlers.

---

# 41. CENTRAL COSTING SERVICE

Create one central costing service.

Conceptual functions:

calculateEstimatedPICost()
calculateActualPICost()
calculateProductStandardCost()
calculateMaterialCost()
calculateLabourCost()
calculatePackagingCost()
calculateProductionCost()
calculateContainerExpenseAllocation()
calculateCostVariance()
calculatePIProfit()
calculatePIMargin()

Do not duplicate these calculations in different modules.

---

# 42. DATABASE RULES

Use normalized relational tables.

Use:

- Foreign keys
- Unique constraints
- Check constraints where appropriate
- Indexes
- Database migrations

Important indexes:

- PO Number
- PI Number
- Invoice Number
- SKU
- Customer ID
- Supplier ID
- Container Number
- Status
- Dates
- Foreign keys

---

# 43. TRANSACTIONS

Use database transactions for:

- Creating PI from PO
- Allocating PO quantities
- Material issue
- Inventory update
- Payment recording
- Expense allocation
- Container allocation
- Financial document creation
- Approval workflows

If any operation fails, roll back the complete transaction.

---

# 44. CONCURRENCY

Protect against two users doing the same operation simultaneously.

Examples:

Two users should not be able to allocate the same PO quantity.

Two users should not be able to issue the same inventory.

Two users should not be able to allocate the same container quantity.

Two users should not be able to record conflicting payments.

Use database locking/constraints/transactions where appropriate.

---

# 45. TESTING

## Unit tests

Test:

- PO allocation
- PI allocation
- BOM calculation
- Material costing
- Labour costing
- Packaging costing
- Expense allocation
- Container allocation
- Profit
- Margin
- Currency conversion
- Inventory

## Integration tests

Test:

PO → PI

PI → Production

Production → Material Issue

Production → QC

QC → Packing

PI → Container

Container → Expenses

PI → Commercial Invoice

Invoice → Payment

PI → Profitability

## End-to-end test

Run one complete realistic order:

Customer
→ PO
→ PI
→ Production
→ Material
→ QC
→ Packing
→ Container
→ Invoice
→ Payment
→ Profit

This must work before the application is considered production-ready.

---

# 46. DEVELOPMENT PHASES

## Phase 0 — Foundation

Implement:

- Project structure
- Environment configuration
- Database
- Migrations
- Authentication
- RBAC
- Error handling
- Logging
- CI
- Testing

## Phase 1 — Master Data

Implement:

- Customers
- Contacts
- Products
- Categories
- Materials
- Suppliers
- Currencies
- Settings

## Phase 2 — Sales

Implement:

- PO
- PO Items
- PO allocation
- PO status
- PI
- PI creation from PO
- PI PDF

## Phase 3 — Costing

Implement:

- BOM
- BOM versioning
- Standard costing
- Estimated PI costing

## Phase 4 — Procurement

Implement:

- Suppliers
- Purchases
- Material receipts
- Inventory
- Weighted average cost
- Material forecast

## Phase 5 — Manufacturing

Implement:

- Production
- Material issue
- Labour
- Manufacturing cost
- Finishing
- Packaging
- Actual costing

## Phase 6 — QC & Logistics

Implement:

- QC
- Rework
- Packing
- Containers
- Loading
- Shipping

## Phase 7 — Finance

Implement:

- Expenses
- Expense allocation
- Commercial invoice
- Payments
- Receivables

## Phase 8 — Profitability

Implement:

- Actual cost
- Estimated vs actual
- PI profit
- PO profit
- Customer profit
- SKU profit

## Phase 9 — Reports

Implement:

- Management dashboard
- Sales reports
- Production reports
- Procurement reports
- Shipping reports
- Profitability reports

## Phase 10 — Production Hardening

Implement:

- Security review
- Performance review
- Permission review
- Automated testing
- Backup/recovery
- Error monitoring
- Deployment

---

# 47. AGENT WORKFLOW

Before implementing any feature:

1. Inspect repository.
2. Understand existing architecture.
3. Do not rewrite working code unnecessarily.
4. Identify existing entities.
5. Identify related services.
6. Identify existing tests.
7. Plan implementation.
8. Implement database changes.
9. Implement business logic.
10. Implement validation.
11. Implement authorization.
12. Add tests.
13. Implement UI.
14. Connect UI to real APIs.
15. Test the workflow.
16. Update documentation.

Do not create duplicate entities.

Do not create duplicate services.

Do not create duplicate business calculations.

---

# 48. DEFINITION OF DONE

A feature is complete only when:

- Database changes exist.
- API/service exists.
- Validation exists.
- Authorization exists.
- UI exists.
- UI uses real data.
- Loading states exist.
- Error states exist.
- Empty states exist.
- Tests exist.
- Existing tests pass.
- Audit requirements are implemented.
- Documentation is updated.
- No fake functionality remains.

---

# 49. ACCEPTANCE TEST

The system must successfully support this complete scenario:

1. Create customer.
2. Create products.
3. Create BOM.
4. Create supplier.
5. Add material price.
6. Create PO.
7. Approve PO.
8. Create PI from PO.
9. Allocate only part of PO quantity.
10. Generate PI PDF.
11. Calculate estimated cost.
12. Create production order.
13. Generate material requirement.
14. Purchase material.
15. Receive material.
16. Issue material to production.
17. Record labour.
18. Record manufacturing cost.
19. Record finishing.
20. Record packaging.
21. Complete production.
22. Perform QC.
23. Record rework if required.
24. Pack approved quantity.
25. Create container.
26. Allocate products to container.
27. Prevent over-allocation.
28. Record shipping expenses.
29. Allocate container expenses.
30. Generate commercial invoice.
31. Record customer payment.
32. Calculate actual cost.
33. Calculate actual profit.
34. Compare estimated vs actual.
35. Display Order 360.
36. Display complete audit trail.

Automate this scenario as an end-to-end test.

---

# 50. FINAL AGENT INSTRUCTION

Treat this document as the primary business and architectural specification.

Build a real:

**CRM + Manufacturing Management + Procurement + Inventory + Costing + QC + Packaging + Container Management + Export Management + Invoicing + Payment + Profitability system.**

Do NOT build a generic CRM.

The most important requirement is:

> Management must be able to open any PO or PI and see the complete lifecycle and financial result of that order.

The system must answer:

- What did the buyer order?
- What did we promise?
- What did we produce?
- What materials did we consume?
- What did those materials actually cost?
- What did labour cost?
- What did finishing cost?
- What did packaging cost?
- What did QC/rework cost?
- Which container was used?
- What did shipping cost?
- What was invoiced?
- What has been paid?
- What is outstanding?
- What is the actual profit?
- Why is actual profit different from estimated profit?

Correctness, traceability, data integrity, maintainability, security, and real-world usability are more important than visual complexity.

Implement incrementally.

Test every workflow.

Never sacrifice transactional integrity for speed.

Never silently change historical financial results.

Never bypass authorization.

Never use fake functionality to represent unfinished work.