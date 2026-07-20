# EventBook

EventBook is a full-stack event booking application featuring a robust backend with concurrency-safe seat decrements, a transactional outbox pattern, and role-based access control.

## 🚀 Features

- **Role-Based Access Control (RBAC):** Distinct roles for event organizers and attendees.
- **Concurrency-Safe Seat Decrement:** Ensures tickets aren't oversold even during high traffic.
- **Transactional Outbox:** Guarantees reliable asynchronous processing (e.g., sending emails).
- **Payment Processing:** Integrated with Stripe for secure payments.
- **Email Notifications:** Powered by Resend for onboarding and ticket confirmations.
- **Background Jobs:** BullMQ and Redis are used for processing background queues efficiently.

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 19 + Vite
- **Routing:** React Router DOM
- **Icons:** Lucide React
- **Language:** TypeScript

### Backend
- **Runtime:** Node.js with Express
- **Database:** PostgreSQL (via Prisma ORM)
- **Caching & Queues:** Redis (Upstash) and BullMQ
- **Authentication:** JWT (JSON Web Tokens) & bcrypt
- **Emails:** Resend / Nodemailer
- **Payments:** Stripe
- **Language:** TypeScript

## 📦 Project Structure

This is a monorepo containing both the frontend and backend:

- `/frontend` - The Vite + React web application.
- `/backend` - The Express API server.
- `/Context` - Additional shared context/resources.
- `render.yaml` - Deployment configuration for Render.

## 🚦 Getting Started

### Prerequisites
- Node.js (v20+ recommended)
- PostgreSQL database (e.g., Neon.tech)
- Redis instance (e.g., Upstash)
- Stripe Account (for payments)
- Resend API Key (for emails)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/EventBook.git
cd EventBook
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory and add the necessary environment variables:
```env
DATABASE_URL="your_postgresql_connection_string"
REDIS_URL="your_redis_connection_string"
JWT_SECRET="your_secret_key"
STRIPE_SECRET_KEY="your_stripe_secret_key"
SMTP_PASS="your_resend_api_key"
```

Run database migrations and start the server:
```bash
npm run migrate:dev
npm run dev
```
*(The backend runs on http://localhost:3000 by default)*

### 3. Frontend Setup

Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
npm install
```

Start the development server:
```bash
npm run dev
```

## 🚀 Deployment

The project includes a `render.yaml` file for easy deployment on [Render](https://render.com/). 
1. Connect your GitHub repository to Render.
2. Render will automatically detect the configuration and set up the backend service.
3. Make sure to provide the required environment variables (Database URL, Redis URL, Resend Key) in the Render dashboard.

## 📝 License

This project is licensed under the MIT License.
