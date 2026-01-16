# RentStream Platform

RentStream is a comprehensive, enterprise-grade property management solution designed to bridge the gap between landlords, tenants, and maintenance personnel. It features a modern micro-services architecture (monorepo), AI-driven leasing assistants, and robust financial tools.

## 🏗️ Architecture

The project is structured as a **Monorepo**:

*   **`apps/api`**: NestJS (Node.js) backend handling REST APIs, Authentication, AI orchestration, and Cron jobs.
*   **`apps/mobile`**: React Native mobile application for Landlords, Tenants, and Workers.
*   **`apps/web`**: React-based web dashboard (implied architecture).
*   **`packages/database`**: Shared PostgreSQL logic, migrations, and seed data.
*   **`infrastructure`**: Docker and cloud configuration.

## 🚀 Key Features

*   **Role-Based Access**: Specialized views for Landlords, Tenants, and Maintenance.
*   **AI Leasing Assistant**: Automated applicant screening using OpenAI/Claude with real-time data extraction.
*   **Financial Suite**: Stripe integration for rent payments, automated late fee calculations, and revenue analytics.
*   **Maintenance Workflow**: Ticket tracking with priority levels and push notifications.
*   **Subscription Management**: Feature gating based on subscription tiers (Free, Pro, Enterprise).

## 🛠️ Tech Stack

*   **Backend**: NestJS, TypeScript, TypeORM/Prisma, PostgreSQL, Redis.
*   **Frontend**: React Native, React, Zustand, Axios.
*   **AI**: OpenAI API / Anthropic Claude, Server-Sent Events (SSE) for streaming.
*   **DevOps**: Docker Compose, AWS (S3, CloudFront), GitHub Actions.

## 💻 Quick Start

1.  **Environment Setup**:
    ```bash
    cp .env.example .env
    # Fill in your DB credentials and API keys
    ```

2.  **Start Infrastructure**:
    ```bash
    docker-compose up -d
    ```

3.  **Run Migrations**:
    ```bash
    cd packages/database
    npm install
    npm run migrate:up
    npm run migrate:seed
    ```

4.  **Run API**:
    ```bash
    cd apps/api
    npm install
    npm run start:dev
    ```

5.  **Run Mobile**:
    ```bash
    cd apps/mobile
    npm install
    npm run android # or npm run ios
    ```

## 📝 Documentation

*   **API Docs**: Available at `/api/docs` (Swagger) when the server is running.
*   **Architecture**: See `docs/architecture` for diagrams and schema details.
