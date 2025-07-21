# Property Management System

A lightweight web application for managing rental properties, tenants, leases, invoices, and payments. Built with Node.js, Express, PostgreSQL, and Bootstrap.

## Features

- **Property Management**: Track rental properties with detailed information
- **Tenant Management**: Manage tenant information and contact details
- **Lease Management**: Handle lease agreements with terms and dates
- **Invoice System**: Generate and track rent invoices
- **Payment Processing**: Accept online payments via Stripe integration
- **Dashboard**: Overview of properties, tenants, and financial metrics
- **Tenant Portal**: Allow tenants to view leases and make payments online
- **Cashflow Projections**: Calculate future expected income from active leases

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Frontend**: EJS templates with Bootstrap 5
- **Authentication**: Session-based authentication
- **Payments**: Stripe integration (ready to configure)
- **Deployment**: Heroku and Digital Ocean compatible

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- npm or yarn

### Local Development Setup

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository-url>
   cd property-management-app
   npm install
   ```

2. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb property_mgmt_dev
   
   # Copy environment template
   cp env.template .env
   ```

3. **Configure Environment Variables**
   
   Edit `.env` file with your database credentials:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/property_mgmt_dev
   NODE_ENV=development
   PORT=3000
   SESSION_SECRET=your-super-secret-session-key-change-this
   
   # Optional: Stripe keys for payment processing
   STRIPE_PUBLIC_KEY=pk_test_your_stripe_public_key
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
   ```

4. **Initialize Database**
   ```bash
   npm run db:migrate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Access the Application**
   - Open http://localhost:3000
   - Create your first admin account at http://localhost:3000/auth/register

## Deployment

### Heroku Deployment

1. **Create Heroku App**
   ```bash
   heroku create your-app-name
   ```

2. **Add PostgreSQL Add-on**
   ```bash
   heroku addons:create heroku-postgresql:mini
   ```

3. **Set Environment Variables**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set SESSION_SECRET=your-production-secret-key
   
   # Optional: Add Stripe keys
   heroku config:set STRIPE_PUBLIC_KEY=pk_live_your_live_key
   heroku config:set STRIPE_SECRET_KEY=sk_live_your_live_key
   ```

4. **Deploy**
   ```bash
   git push heroku main
   ```

5. **Initialize Database**
   ```bash
   heroku run npm run db:migrate
   ```

### Digital Ocean Deployment

1. **Create Droplet** with Node.js and PostgreSQL
2. **Set up Environment Variables** in your deployment environment
3. **Configure Process Manager** (PM2 recommended):
   ```bash
   npm install -g pm2
   pm2 start server.js --name property-mgmt
   pm2 startup
   pm2 save
   ```

## Application Structure

```
property-management-app/
├── config/
│   └── database.js          # Database configuration
├── middleware/
│   └── auth.js              # Authentication middleware
├── models/                  # Sequelize models
│   ├── User.js             # Property managers
│   ├── Property.js         # Rental properties
│   ├── Tenant.js           # Tenant information
│   ├── Lease.js            # Lease agreements
│   ├── Invoice.js          # Rent invoices
│   ├── Payment.js          # Payment records
│   └── index.js            # Model associations
├── routes/                 # Express routes
│   ├── auth.js            # Manager authentication
│   ├── tenantAuth.js      # Tenant authentication
│   ├── dashboard.js       # Dashboard overview
│   ├── properties.js      # Property management
│   ├── tenants.js         # Tenant management
│   ├── leases.js          # Lease management
│   ├── invoices.js        # Invoice management
│   ├── payments.js        # Payment processing
│   └── tenantPortal.js    # Tenant portal
├── views/                 # EJS templates
├── scripts/
│   └── migrate.js         # Database migration
├── server.js              # Main application entry
└── package.json
```

## Key Features Detail

### Property Management
- Add properties with detailed information
- Track property status and occupancy
- View active leases and tenant information
- Property-specific financial reporting

### Lease Management
- Create and manage lease agreements
- Track lease terms, rent amounts, and dates
- Support for both fixed-term and month-to-month leases
- Automatic lease status updates

### Financial Tracking
- Generate monthly rent invoices
- Track payment history
- Monitor overdue payments
- Calculate future cashflow projections
- Dashboard with financial overview

### Tenant Portal
- Secure tenant login system
- View lease information and payment history
- Online rent payment processing
- Mobile-responsive interface

## Database Schema

The application uses the following main entities:

- **Users**: Property managers and administrators
- **Properties**: Rental property information
- **Tenants**: Tenant contact and employment details
- **Leases**: Lease agreements linking properties and tenants
- **Invoices**: Monthly rent and fee invoices
- **Payments**: Payment transactions and history

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- CSRF protection
- SQL injection prevention via Sequelize ORM
- Secure headers with Helmet.js

## Customization

The application is designed to be easily customizable:

- Modify models in `models/` directory for additional fields
- Add new routes in `routes/` directory
- Customize views in `views/` directory
- Extend dashboard functionality in `routes/dashboard.js`

## Support

For questions or issues:
1. Check the application logs
2. Verify database connectivity
3. Ensure all environment variables are set correctly

## License

MIT License - feel free to use for personal or commercial projects. 