# Property Management System - Data Model

**Version:** 2.0  
**Last Updated:** January 2025  
**Status:** Current

---

## Overview

This document defines the complete data model for the Property Management System. This is the **source of truth** for all database structure decisions and should be referenced before making any schema changes.

## Core Business Rules

1. **Multi-Tenant Leases**: A single lease can have up to 4 tenants (primary tenant required, 3 additional optional)
2. **Invoice-First Payments**: All payments must be associated with an invoice (no direct lease payments)
3. **Optional Invoice-Lease Association**: Invoices may or may not be tied to a lease (supports general billing)
4. **Property Active Lease**: Each property can have one active lease at a time
5. **Financial Tracking**: Real-time calculation of totals, balances, and payment status

---

## Entities

### 1. Users (`users`)
**Purpose:** System administrators and property managers

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `firstName` | STRING | NOT NULL, NOT EMPTY | User's first name |
| `lastName` | STRING | NOT NULL, NOT EMPTY | User's last name |
| `email` | STRING | NOT NULL, UNIQUE, VALID EMAIL | Login email |
| `password` | STRING | NOT NULL, HASHED | Bcrypt hashed password |
| `role` | ENUM | DEFAULT 'manager' | `admin`, `manager` |
| `isActive` | BOOLEAN | DEFAULT true | Account status |
| `lastLoginAt` | DATE | NULLABLE | Last login timestamp |
| `createdAt` | TIMESTAMP | AUTO | Record creation time |
| `updatedAt` | TIMESTAMP | AUTO | Last update time |

**Indexes:**
- `email` (unique)

---

### 2. Properties (`properties`)
**Purpose:** Real estate properties being managed

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `name` | STRING | NOT NULL, NOT EMPTY | Property display name |
| `address` | STRING | NOT NULL, NOT EMPTY | Street address |
| `city` | STRING | NOT NULL | City |
| `state` | STRING | NOT NULL | State/Province |
| `zipCode` | STRING | NOT NULL | Postal code |
| `county` | STRING | NULLABLE | County name |
| `propertyType` | ENUM | DEFAULT 'single-family' | `single-family`, `apartment`, `condo`, `townhouse`, `duplex`, `other` |
| `bedrooms` | INTEGER | DEFAULT 1 | Number of bedrooms |
| `bathrooms` | DECIMAL(3,1) | DEFAULT 1.0 | Number of bathrooms |
| `squareFootage` | INTEGER | NULLABLE | Square footage |
| `description` | TEXT | NULLABLE | Property description |
| `purchasePrice` | DECIMAL(10,2) | NULLABLE | Original purchase price |
| `currentValue` | DECIMAL(10,2) | NULLABLE | Current market value |
| `currentValueDate` | DATE | NULLABLE | Date of current value assessment |
| `purchaseDate` | DATE | NULLABLE | Date of purchase |
| `activeLeaseId` | INTEGER | NULLABLE, FK → leases.id | Reference to active lease |
| `isActive` | BOOLEAN | DEFAULT true | Property status |
| `createdAt` | TIMESTAMP | AUTO | Record creation time |
| `updatedAt` | TIMESTAMP | AUTO | Last update time |

**Indexes:**
- `activeLeaseId`
- `isActive`

---

### 3. Tenants (`tenants`)
**Purpose:** Individuals who rent properties

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `firstName` | STRING | NOT NULL, NOT EMPTY | Tenant's first name |
| `lastName` | STRING | NOT NULL, NOT EMPTY | Tenant's last name |
| `email` | STRING | NOT NULL, UNIQUE, VALID EMAIL | Contact email |
| `phone` | STRING | NULLABLE | Phone number |
| `password` | STRING | NULLABLE, HASHED | Optional tenant portal password |
| `emergencyContactName` | STRING | NULLABLE | Emergency contact name |
| `emergencyContactPhone` | STRING | NULLABLE | Emergency contact phone |
| `employerName` | STRING | NULLABLE | Current employer |
| `monthlyIncome` | DECIMAL(10,2) | NULLABLE | Monthly income |
| `isActive` | BOOLEAN | DEFAULT true | Tenant status |
| `lastLoginAt` | DATE | NULLABLE | Last portal login |
| `createdAt` | TIMESTAMP | AUTO | Record creation time |
| `updatedAt` | TIMESTAMP | AUTO | Last update time |

**Indexes:**
- `email` (unique)
- `isActive`

---

### 4. Leases (`leases`)
**Purpose:** Rental agreements between property owners and tenants

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `propertyId` | INTEGER | NOT NULL, FK → properties.id | Associated property |
| `tenant1Id` | INTEGER | NULLABLE, FK → tenants.id | Primary tenant (required for active leases) |
| `tenant2Id` | INTEGER | NULLABLE, FK → tenants.id | Second tenant (optional) |
| `tenant3Id` | INTEGER | NULLABLE, FK → tenants.id | Third tenant (optional) |
| `tenant4Id` | INTEGER | NULLABLE, FK → tenants.id | Fourth tenant (optional) |
| `startDate` | DATE | NOT NULL | Lease start date |
| `endDate` | DATE | NOT NULL | Lease end date |
| `monthlyRent` | DECIMAL(10,2) | NOT NULL, MIN 0.01 | Monthly rent amount |
| `totalLeaseValue` | DECIMAL(10,2) | NULLABLE | Total value for entire lease term |
| `totalAmountPaid` | DECIMAL(10,2) | DEFAULT 0.00 | Total paid to date |
| `totalAmountRemaining` | DECIMAL(10,2) | NULLABLE | Remaining balance |
| `securityDeposit` | DECIMAL(10,2) | DEFAULT 0.00 | Security deposit amount |
| `petDeposit` | DECIMAL(10,2) | DEFAULT 0.00 | Pet deposit amount |
| `lateFeeAmount` | DECIMAL(10,2) | DEFAULT 0.00 | Late fee amount |
| `lateFeeDaysAfterDue` | INTEGER | DEFAULT 5 | Days after due before late fee |
| `rentDueDay` | INTEGER | DEFAULT 1, MIN 1, MAX 31 | Day of month rent is due |
| `status` | ENUM | DEFAULT 'pending' | `active`, `expired`, `terminated`, `pending` |
| `leaseType` | ENUM | DEFAULT 'fixed-term' | `fixed-term`, `month-to-month` |
| `notes` | TEXT | NULLABLE | Additional notes |
| `signedDate` | DATE | NULLABLE | Date lease was signed |
| `createdAt` | TIMESTAMP | AUTO | Record creation time |
| `updatedAt` | TIMESTAMP | AUTO | Last update time |

**Indexes:**
- `propertyId`
- `tenant1Id`, `tenant2Id`, `tenant3Id`, `tenant4Id`
- `status`
- `startDate`, `endDate`

**Business Rules:**
- Only one `active` lease per property at a time
- `tenant1Id` is required for `active` status leases
- `endDate` must be after `startDate`
- `rentDueDay` must be between 1-31

---

### 5. Invoices (`invoices`)
**Purpose:** Bills sent to tenants for rent and other charges

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `leaseId` | INTEGER | NULLABLE, FK → leases.id | Associated lease (optional) |
| `invoiceNumber` | STRING | NOT NULL, UNIQUE | Human-readable invoice number |
| `invoiceDate` | DATE | NOT NULL, DEFAULT NOW | Date invoice was created |
| `dueDate` | DATE | NOT NULL | Payment due date |
| `periodStart` | DATE | NOT NULL | Billing period start |
| `periodEnd` | DATE | NOT NULL | Billing period end |
| `rentAmount` | DECIMAL(10,2) | NOT NULL, DEFAULT 0.00 | Rent charges |
| `lateFeeAmount` | DECIMAL(10,2) | DEFAULT 0.00 | Late fee charges |
| `otherCharges` | DECIMAL(10,2) | DEFAULT 0.00 | Additional charges |
| `otherChargesDescription` | TEXT | NULLABLE | Description of other charges |
| `totalAmount` | VIRTUAL | AUTO-CALCULATED | `rentAmount + lateFeeAmount + otherCharges` |
| `paidAmount` | DECIMAL(10,2) | DEFAULT 0.00 | Amount paid so far |
| `balanceAmount` | VIRTUAL | AUTO-CALCULATED | `totalAmount - paidAmount` |
| `status` | ENUM | DEFAULT 'draft' | `draft`, `sent`, `paid`, `partially_paid`, `overdue`, `cancelled` |
| `sentDate` | DATE | NULLABLE | Date invoice was sent |
| `paidDate` | DATE | NULLABLE | Date fully paid |
| `notes` | TEXT | NULLABLE | Internal notes |
| `createdAt` | TIMESTAMP | AUTO | Record creation time |
| `updatedAt` | TIMESTAMP | AUTO | Last update time |

**Indexes:**
- `leaseId`
- `invoiceNumber` (unique)
- `status`
- `dueDate`

**Business Rules:**
- `invoiceNumber` auto-generated if not provided
- `paidAmount` updated automatically from payments
- Status transitions: `draft` → `sent` → `paid`/`partially_paid`/`overdue`

---

### 6. Payments (`payments`)
**Purpose:** Record of payments made against invoices

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `invoiceId` | INTEGER | NOT NULL, FK → invoices.id | Associated invoice |
| `amount` | DECIMAL(10,2) | NOT NULL, MIN 0.01 | Payment amount |
| `paymentDate` | DATE | NOT NULL, DEFAULT NOW | Date payment was made |
| `paymentMethod` | ENUM | NOT NULL | `credit_card`, `bank_transfer`, `check`, `cash`, `money_order`, `online` |
| `transactionId` | STRING | NULLABLE | External processor transaction ID |
| `checkNumber` | STRING | NULLABLE | Check number if applicable |
| `status` | ENUM | DEFAULT 'pending' | `pending`, `completed`, `failed`, `refunded`, `cancelled` |
| `processingFee` | DECIMAL(10,2) | DEFAULT 0.00 | Payment processor fee |
| `netAmount` | VIRTUAL | AUTO-CALCULATED | `amount - processingFee` |
| `description` | STRING | NULLABLE | Payment description |
| `notes` | TEXT | NULLABLE | Internal notes |
| `processedAt` | DATE | NULLABLE | Date payment was processed |
| `refundedAt` | DATE | NULLABLE | Date payment was refunded |
| `refundAmount` | DECIMAL(10,2) | DEFAULT 0.00 | Amount refunded |
| `createdAt` | TIMESTAMP | AUTO | Record creation time |
| `updatedAt` | TIMESTAMP | AUTO | Last update time |

**Indexes:**
- `invoiceId`
- `transactionId`
- `status`
- `paymentDate`

**Business Rules:**
- All payments must be linked to an invoice
- Only `completed` payments count toward invoice balance
- `processedAt` auto-set when status changes to `completed`

---

## Relationships

### Primary Relationships

```
Users (1) ─────── (0:N) [manages] ─────── Properties
                                              │
Properties (1) ─── (0:N) [has] ────────── Leases
     │                                       │
     └─ (0:1) [activeLeaseId] ──────────────┘
                                              │
Tenants (0:N) ──── (0:N) [rents] ────────── Leases
  │                                           │
  ├─ tenant1Id (primary tenant)               │
  ├─ tenant2Id (optional)                     │
  ├─ tenant3Id (optional)                     │
  └─ tenant4Id (optional)                     │
                                              │
Leases (1) ─────── (0:N) [generates] ──── Invoices
                                              │
Invoices (1) ───── (0:N) [receives] ───── Payments
```

### Association Definitions

| From | To | Type | Foreign Key | Alias | Description |
|------|----|----|-------------|--------|-------------|
| Property | Lease | 1:N | propertyId | leases | Property has many leases |
| Property | Lease | 1:1 | activeLeaseId | activeLease | Property's current active lease |
| Lease | Property | N:1 | propertyId | property | Lease belongs to property |
| Lease | Tenant | N:1 | tenant1Id | tenant1 | Primary tenant |
| Lease | Tenant | N:1 | tenant2Id | tenant2 | Second tenant |
| Lease | Tenant | N:1 | tenant3Id | tenant3 | Third tenant |
| Lease | Tenant | N:1 | tenant4Id | tenant4 | Fourth tenant |
| Tenant | Lease | 1:N | tenant1Id | leasesAsTenant1 | Tenant as primary |
| Tenant | Lease | 1:N | tenant2Id | leasesAsTenant2 | Tenant as secondary |
| Tenant | Lease | 1:N | tenant3Id | leasesAsTenant3 | Tenant as third |
| Tenant | Lease | 1:N | tenant4Id | leasesAsTenant4 | Tenant as fourth |
| Lease | Invoice | 1:N | leaseId | invoices | Lease has many invoices |
| Invoice | Lease | N:1 | leaseId | lease | Invoice belongs to lease |
| Invoice | Payment | 1:N | invoiceId | payments | Invoice has many payments |
| Payment | Invoice | N:1 | invoiceId | invoice | Payment belongs to invoice |

---

## Key Business Logic

### Property Occupancy Status
```javascript
// Property is "Occupied" if:
property.leases.some(lease => 
  lease.status === 'active' && 
  (lease.tenant1 || lease.tenant2 || lease.tenant3 || lease.tenant4)
)

// Property is "Vacant" if:
!property.leases.some(lease => lease.status === 'active') ||
property.leases.filter(l => l.status === 'active').every(lease => 
  !lease.tenant1 && !lease.tenant2 && !lease.tenant3 && !lease.tenant4
)
```

### Invoice Balance Calculation
```javascript
// Real-time calculations (virtual fields)
invoice.totalAmount = invoice.rentAmount + invoice.lateFeeAmount + invoice.otherCharges
invoice.balanceAmount = invoice.totalAmount - invoice.paidAmount

// Status logic
if (invoice.balanceAmount === 0) invoice.status = 'paid'
else if (invoice.paidAmount > 0) invoice.status = 'partially_paid'
else if (new Date() > invoice.dueDate) invoice.status = 'overdue'
```

### Payment Processing
```javascript
// Only 'completed' payments count toward balance
const totalPaid = payments
  .filter(p => p.status === 'completed')
  .reduce((sum, p) => sum + p.amount, 0)

// Net amount after processing fees
payment.netAmount = payment.amount - payment.processingFee
```

---

## Migration Notes

### Recently Fixed Issues
1. **✅ Removed `tenantId` column** - Replaced with multi-tenant structure (`tenant1Id`, `tenant2Id`, etc.)
2. **✅ Fixed template logic** - Updated views to handle multi-tenant relationships
3. **✅ Updated property vacancy logic** - Now correctly checks all tenant fields

### Database Constraints Verified
- ✅ No `tenantId` column exists in `leases` table
- ✅ All tenant foreign keys (`tenant1Id`-`tenant4Id`) are nullable
- ✅ All associations properly reference new tenant structure

---

## Usage Guidelines

### For Database Changes
1. **Always reference this document** before making schema changes
2. **Update this document first** when planning new features
3. **Maintain backward compatibility** where possible
4. **Test all relationships** after schema changes

### For Queries
1. **Use defined associations** rather than manual JOINs
2. **Include proper tenant checks** when determining occupancy
3. **Filter by `status='completed'`** for payment calculations
4. **Use virtual fields** for real-time calculations

### For New Features
1. **Follow established patterns** for naming and structure
2. **Add appropriate indexes** for performance
3. **Include audit fields** (`createdAt`, `updatedAt`)
4. **Document business rules** in this file

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Jan 2025 | Multi-tenant lease structure, removed `tenantId` |
| 1.0 | Dec 2024 | Initial structure with single-tenant leases |

---

**⚠️ Important:** This document is the single source of truth for database structure. Any changes to the database schema must be reflected here first, and all development should reference this document for consistency. 