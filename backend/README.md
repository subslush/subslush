# Subscription Platform Backend

A production-ready Node.js backend API server for a subscription upgrade platform built with TypeScript and Fastify v5.

## 🚀 Features

- **Modern Stack**: Node.js 22+, TypeScript 5.9.2, Fastify v5
- **Database**: PostgreSQL with connection pooling via PgBouncer
- **Security**: Helmet, CORS, Rate limiting
- **Development**: Hot reload, linting, formatting, pre-commit hooks
- **Type Safety**: Strict TypeScript configuration with Zod validation
- **Health Monitoring**: Built-in health check endpoint with database status

## 📋 Prerequisites

- Node.js 22+ (LTS recommended)
- PostgreSQL database running on localhost:5432 (direct) or localhost:6432 (pooled)
- npm or yarn package manager

## 🛠️ Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Start the server**:
   ```bash
   # Development mode with hot reload
   npm run dev

   # Production mode
   npm start
   ```

## 📁 Project Structure

```
backend/
├── src/
│   ├── routes/           # API route handlers
│   │   ├── auth.ts       # Authentication routes
│   │   ├── subscriptions.ts # Subscription management
│   │   ├── payments.ts   # Payment processing
│   │   ├── health.ts     # Health check endpoint
│   │   └── api.ts        # API route aggregator
│   ├── services/         # Business logic layer
│   ├── middleware/       # Custom middleware
│   │   └── errorHandler.ts # Global error handling
│   ├── utils/           # Utility functions
│   │   └── logger.ts    # Logging utilities
│   ├── types/           # TypeScript type definitions
│   │   └── environment.ts # Environment config types
│   ├── config/          # Configuration files
│   │   ├── database.ts  # Database connection setup
│   │   └── environment.ts # Environment validation
│   └── server.ts        # Main server entry point
├── tests/               # Test files
├── dist/                # Compiled TypeScript output
└── Configuration files...
```

## 🔌 API Endpoints

### Health Check
- `GET /health` - System health and database connectivity

### API v1
- `GET /api/v1/auth` - Authentication routes (coming soon)
- `GET /api/v1/subscriptions` - Subscription management (coming soon)
- `GET /api/v1/payments` - Payment processing (coming soon)

## 🗄️ Database Configuration

The application supports both direct PostgreSQL connection and PgBouncer pooling:

- **Direct**: localhost:5432
- **Pooled**: localhost:6432 (recommended for production)

Database credentials:
- Database: `subscription_platform`
- User: `subscription_user`
- Password: `subscription_pass_2024`

## 🧰 Development Scripts

```bash
# Development
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm start           # Start production server

# Code Quality
npm run lint        # Run ESLint
npm run lint:fix    # Fix linting issues
npm run format      # Format code with Prettier

# Testing
npm test           # Run tests (placeholder)
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3001` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `6432` |
| `DB_DATABASE` | Database name | `subscription_platform` |
| `DB_USER` | Database user | `subscription_user` |
| `DB_PASSWORD` | Database password | Required |

### TypeScript Configuration

- **Target**: ES2022
- **Module**: CommonJS
- **Strict mode**: Enabled
- **Path mapping**: Configured for clean imports

### ESLint Rules

- TypeScript-specific rules
- No unused variables/imports
- Console warnings (allowed in development)
- Consistent code style

## 🚦 Server Features

### Security
- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: 100 requests per minute per IP

### Logging
- **Development**: Pretty-printed logs with timestamps
- **Production**: Structured JSON logs
- **Levels**: Info, warn, error, debug

### Error Handling
- **Global error handler**: Consistent error responses
- **Graceful shutdown**: Clean database connections on exit
- **Request validation**: Zod schema validation

## 📊 Health Monitoring

Access `GET /health` for system status:

```json
{
  "status": "healthy",
  "timestamp": "2025-09-19T21:01:05.580Z",
  "uptime": 15.908968218,
  "database": {
    "status": "connected"
  },
  "memory": {
    "rss": 75063296,
    "heapTotal": 14295040,
    "heapUsed": 12580272,
    "external": 2960379,
    "arrayBuffers": 4252441
  },
  "version": "v18.20.4"
}
```

## 🔄 Git Hooks

Pre-commit hooks automatically:
- Run ESLint with auto-fix
- Format code with Prettier
- Prevent commits with linting errors

## 🚀 Next Steps

This foundation is ready for:
- Authentication implementation
- Subscription management features
- Payment processing integration
- User management
- API rate limiting per user
- Database migrations
- Unit and integration tests
- Docker containerization
- Production deployment

## 📝 License

ISC License