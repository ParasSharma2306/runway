# Runway

**Deterministic capital modeling for the localized runtime.**

Runway is a private, offline-first financial engine designed to answer one question: *"Can I afford this today?"*. Unlike traditional budgeting apps, Runway models **time as a currency**. It uses client-side Monte Carlo simulations to forecast your financial "runway"; the number of days remaining before solvency failure-based on your unique spending vectors.

---

## Key Features

* **Monte Carlo Forecasting**: The engine executes 2,000 simulation runs per render to determine your median runway and confidence intervals (pessimistic vs. optimistic scenarios).
* **Client-Side Sovereignty**: All heavy lifting happens in the browser (V8 runtime). Data is stored locally via **IndexedDB**.
* **Offline First**: Fully functional without an internet connection using Service Workers for caching.
* **Hybrid Sync**: Optional encrypted synchronization to MongoDB Atlas for backup and cross-device usage.
* **Spend Simulation**: Inject hypothetical transactions to see their immediate impact on your runway without altering your actual ledger.

---

## Tech Stack

### Frontend (The "Runtime")
* **Vanilla ESModules**: No build steps, no heavy frameworks.
* **Storage**: `IndexedDB` for transactional data.
* **Styling**: Native CSS Variables for high-performance theming (Dark/Light modes).

### Backend (The "Sync & Auth Layer")
* **Runtime**: Node.js & Express.
* **Database**: MongoDB (Atlas).
* **Security**: Helmet, Rate Limiting, Mongo Sanitization.
* **Communication**: Nodemailer (via Brevo SMTP) for OTPs and support tickets.

---

## Project Structure

```text
/public
  /js
    ├── engine.js       # Monte Carlo simulation logic
    ├── storage.js      # IndexedDB wrapper
    ├── simulate.js     # Hypothetical scenario analysis
    └── theme.js        # CSS variable theme manager
  /css                  # Native CSS styles
/server
  /models               # Mongoose schemas (User, Ticket, Transaction)
  /routes               # Express API routes
  /middleware           # Auth & Role verification
  server.js             # Entry point
  ```

---

## Getting Started

### Prerequisites
* Node.js v18+
* MongoDB Instance (Local or Atlas)

### Installation

1. **Clone the repository**
   ```bash
   git clone [https://github.com/ParasSharma2306/runway.git](https://github.com/ParasSharma2306/runway.git)
   cd runway
   ```

2. **Install Server Dependencies**

    ```bash
    cd server
    npm install
    ```

3. **Environment Configuration Create a .env file in the /server directory with the following variables:**

    ```Code snippet

    PORT=3000
    MONGODB_URI=mongodb://localhost:27017/runway
    SESSION_SECRET=your_secure_random_string

    # Admin Seeding
    ADMIN_EMAIL=admin@example.com
    ADMIN_PASSWORD=secure_password

    # Email Service (Brevo/SMTP)
    BREVO_USER=your_smtp_user
    BREVO_PASS=your_smtp_pass
    CLIENT_URL=http://localhost:3000
    ```

4. **Start the Server**

    ```Bash

    npm start
    The application will be available at http://localhost:3000.
    ```

---

## Security

* **NoSQL Injection Protection**: Custom middleware sanitizes inputs against operator injection.
* **Rate Limiting**: `express-rate-limit` protects API (100 req/15m) and Auth (15 req/15m) endpoints.
* **Role-Based Access**: Strict middleware (`requireRole`) protects Admin and Ticket routes.
* **Session Security**: Sessions are backed by MongoDB and use HTTP-Only, Secure cookies.

---

## Credits

Designed and developed by Paras Sharma  
https://parassharma.com/  

Built with :heart: in :india:

---

## License

MIT License.