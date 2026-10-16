# ChatExpress 💬 • Instagram-Style Real-Time Messaging Platform

**ChatExpress** is a web application inspired by **Instagram Direct Messages (DMs)**. It delivers a fast, interactive chat experience with clean aesthetics, gradient message bubbles, active stories bar, emoji reactions, typing indicators, photo attachments, and full account authentication.

---

## 🌟 Key Features

- **Instagram Direct Aesthetic**:
  - Instagram dark mode (with instant toggle to light mode).
  - Signature gradient outgoing message bubbles (`#3797f0` → `#833ab4` → `#e1306c`).
  - Active stories bar at the top with Instagram gradient rings.
  - Sidebar navigation rail with unread counter badges.
  - Empty inbox state with iconic Direct paper airplane icon.

- **Authentication & User Management**:
  - Secure account sign-up and login with password hashing (`scrypt`).
  - Session management via HTTP cookies.
  - Profile customization: update display name, bio, and avatar.
  - 1-Click demo account quick switcher for immediate testing.

- **Real-Time Messaging (Zero External Dependencies)**:
  - Instant message delivery using high-performance Server-Sent Events (SSE).
  - Real-time typing indicators with 3 animated bouncing dots.
  - Real-time online presence status (green dots & "Active now" badges).
  - Real-time emoji reaction syncing (❤️, 😂, 🔥, 👏) and double-click to like.
  - Unsend / delete message feature.
  - Photo attachment & image sharing with full-screen lightbox preview.

- **User Discovery & Search**:
  - Search any registered user by username or full name.
  - Start direct conversations with any user with one click.

- **100% Zero-Dependency Node.js Architecture**:
  - Runs out of the box with Node.js built-in modules (`http`, `crypto`, `fs`, `path`, `url`).
  - No internet connection or `npm install` needed to run!

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (version 14.x or higher).

### 1. Extract the Zip Archive
Unzip `chatexpress.zip` into your chosen folder:
```bash
unzip chatexpress.zip
cd chatexpress
```

### 2. Start the Server
Run with npm:
```bash
npm start
```
Or run directly with Node:
```bash
node server.js
```

### 3. Open in Browser
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 👥 Demo Accounts (Ready to Test)

ChatExpress comes pre-seeded with 3 realistic accounts so you can immediately experience real-time chatting without manually creating multiple users:

| Username | Full Name | Password | Role / Bio |
| :--- | :--- | :--- | :--- |
| `alex_design` | Alex Rivera | `password123` | Product Designer & Photographer 📷 |
| `sophia_art` | Sophia Chen | `password123` | Digital Illustrator & Coffee Lover ☕✨ |
| `marcus_tech` | Marcus Vance | `password123` | Fullstack Dev & Indie Hacker 🚀 |

> 💡 **Tip to Test Real-Time Chatting**:
> 1. Open `http://localhost:3000` in your normal browser window and log in as `alex_design`.
> 2. Open `http://localhost:3000` in an **Incognito / Private window** (or second browser) and log in as `sophia_art`.
> 3. Send messages, type, attach photos, and react to see real-time updates and sounds sync across both windows!

---

## 📁 Project Directory Structure

```
chatexpress/
├── server.js              # HTTP server, REST API, authentication & SSE engine
├── package.json           # Node.js project manifest & scripts
├── README.md              # Project documentation and setup guide
├── public/                # Static frontend assets
│   ├── index.html         # Instagram Direct single-page layout
│   ├── css/
│   │   └── style.css      # Instagram design system, dark/light themes
│   └── js/
│       └── app.js         # Client state, SSE sync, audio, and UI handlers
├── data/
│   └── database.json      # Persistent JSON database (auto-created & seeded)
└── uploads/               # Uploaded chat photos and avatars (auto-created)
```

---

## 🔌 API Endpoints Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user account |
| `POST` | `/api/auth/login` | Authenticate user & start session |
| `POST` | `/api/auth/logout` | Invalidate current session |
| `GET` | `/api/auth/me` | Get current authenticated user profile |
| `PUT` | `/api/auth/profile` | Update profile information |
| `GET` | `/api/realtime` | Persistent SSE stream for real-time events |
| `GET` | `/api/conversations` | List user inbox conversations with unread counts |
| `GET` | `/api/messages/:userId` | Get chat history between current user and `:userId` |
| `POST` | `/api/messages` | Send a new direct message or photo |
| `POST` | `/api/messages/:id/react` | Add or toggle an emoji reaction |
| `DELETE` | `/api/messages/:id` | Unsend / delete a message |
| `POST` | `/api/typing` | Broadcast typing status |
| `GET` | `/api/users?q=...` | Search and discover users |
| `POST` | `/api/upload` | Upload photos for chat attachments |

---

## 📄 License
MIT License. Built for fun and learning!
