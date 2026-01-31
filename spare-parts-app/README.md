# Spare Parts Management App

A Next.js application for managing spare parts inventory, transaction history, and users.

## Features

- **Role-Based Access Control**: Admin, Power User, Normal User.
- **Inventory Management**: Stock tracking (OK/Damaged), Bin locations, Reorder levels.
- **Transaction Logging**: History of all IN/OUT movements.
- **Mock Data Layer**: Simulates backend with LocalStorage persistence.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- TailwindCSS
- shadcn/ui
- Lucide React Icons

## Getting Started

1.  **Install Dependencies**:

    ```bash
    npm install
    ```

2.  **Run Development Server**:

    ```bash
    npm run dev
    ```

3.  **Open Browser**:
    Visit [http://localhost:3000](http://localhost:3000).

## Default Accounts (Mock)

| Username | Role       | Access                                |
| -------- | ---------- | ------------------------------------- |
| `admin`  | ADMIN      | All Access (Manage Users, Edit Parts) |
| `power`  | POWER_USER | Edit Parts, IN/OUT                    |
| `user`   | USER       | View Parts, IN/OUT                    |

_Password can be anything in this mock version._
