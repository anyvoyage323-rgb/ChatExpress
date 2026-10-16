/**
 * ChatExpress - Instagram-Style Real-Time Messaging Platform
 * Built with pure Node.js (Zero external npm dependencies needed!)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure necessary directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// --- In-Memory State & Database Management ---
let db = {
  users: [],
  messages: [],
  sessions: {} // token -> userId
};

// Connected SSE clients: userId -> Set of Response objects
const sseClients = new Map();

// Load or initialize DB
function loadDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
      if (!db.sessions) db.sessions = {};
      console.log(`[DB] Loaded ${db.users.length} users and ${db.messages.length} messages.`);
      return;
    } catch (err) {
      console.error('[DB] Error reading database file, re-initializing...', err);
    }
  }
  // Initialize default demo data
  seedInitialData();
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Error saving database:', err);
  }
}

// Password hashing helper using crypto.scrypt
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, storedSalt) {
  const testHash = crypto.scryptSync(password, storedSalt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// Seed realistic demo users and messages
function seedInitialData() {
  const defaultPw = 'password123';
  const salt1 = 'a1b2c3d4e5f60101';
  const salt2 = 'b2c3d4e5f6a10202';
  const salt3 = 'c3d4e5f6a1b20303';

  const user1 = {
    id: 'user_alex_1',
    username: 'alex_design',
    fullName: 'Alex Rivera',
    bio: 'Product Designer & Street Photographer 📷 | Living in SF',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    passwordHash: hashPassword(defaultPw, salt1).hash,
    salt: salt1,
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    lastSeen: new Date().toISOString()
  };

  const user2 = {
    id: 'user_sophia_2',
    username: 'sophia_art',
    fullName: 'Sophia Chen',
    bio: 'Digital Illustrator & Coffee lover ☕✨ | Commission open',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    passwordHash: hashPassword(defaultPw, salt2).hash,
    salt: salt2,
    createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
    lastSeen: new Date().toISOString()
  };

  const user3 = {
    id: 'user_marcus_3',
    username: 'marcus_tech',
    fullName: 'Marcus Vance',
    bio: 'Fullstack Dev & Open Source enthusiast 🚀 | Indie hacker',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    passwordHash: hashPassword(defaultPw, salt3).hash,
    salt: salt3,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    lastSeen: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  };

  db.users = [user1, user2, user3];

  // Seed sample conversation messages
  const now = Date.now();
  db.messages = [
    {
      id: 'msg_1',
      senderId: 'user_alex_1',
      receiverId: 'user_sophia_2',
      text: 'Hey Sophia! Did you see the new Instagram UI redesign update? Looks so clean! ✨',
      reactions: { user_sophia_2: '❤️' },
      read: true,
      createdAt: new Date(now - 3600000 * 3).toISOString()
    },
    {
      id: 'msg_2',
      senderId: 'user_sophia_2',
      receiverId: 'user_alex_1',
      text: 'Yes! Loved the typography and the smooth gradient bubbles in DMs! 🎨',
      reactions: { user_alex_1: '🔥' },
      read: true,
      createdAt: new Date(now - 3600000 * 2.5).toISOString()
    },
    {
      id: 'msg_3',
      senderId: 'user_alex_1',
      receiverId: 'user_sophia_2',
      text: 'Totally. By the way, check out ChatExpress, it feels just like it! Ready for our meetup tomorrow?',
      reactions: {},
      read: true,
      createdAt: new Date(now - 3600000 * 1).toISOString()
    },
    {
      id: 'msg_4',
      senderId: 'user_sophia_2',
      receiverId: 'user_alex_1',
      text: 'Count me in! Bringing my sketchbook ☕',
      reactions: {},
      read: true,
      createdAt: new Date(now - 3600000 * 0.5).toISOString()
    },
    {
      id: 'msg_5',
      senderId: 'user_marcus_3',
      receiverId: 'user_alex_1',
      text: 'Hey Alex! Let me know if you want to test the new real-time socket latency.',
      reactions: {},
      read: false,
      createdAt: new Date(now - 3600000 * 4).toISOString()
    }
  ];

  db.sessions = {};
  saveDatabase();
  console.log('[DB] Seeded initial demo users and conversation.');
}

loadDatabase();

// --- Helper Functions ---
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = decodeURI(parts.join('='));
      if (key) list[key] = val;
    });
  }
  return list;
}

function getSessionUser(req) {
  // Check authorization header or cookie
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    const cookies = parseCookies(req);
    token = cookies['chatexpress_session'];
  }

  if (!token || !db.sessions[token]) return null;
  const userId = db.sessions[token];
  return db.users.find(u => u.id === userId) || null;
}

function parseJsonBody(req, limitBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > limitBytes) {
        reject(new Error('Request payload too large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

// Broadcast event to connected SSE clients of a specific user
function sendSseEvent(userId, eventType, data) {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const clientRes of clients) {
    try {
      clientRes.write(payload);
    } catch (err) {
      console.error(`Failed to send SSE to user ${userId}:`, err);
    }
  }
}

// Broadcast to all connected clients
function broadcastSseEvent(eventType, data, excludeUserId = null) {
  for (const [userId, clients] of sseClients.entries()) {
    if (excludeUserId && userId === excludeUserId) continue;
    sendSseEvent(userId, eventType, data);
  }
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

function serveStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// --- HTTP Request Router ---
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // --- API Endpoints ---
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Auth: Register
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { username, fullName, password, bio, avatar } = body;

        if (!username || !password || !fullName) {
          return sendError(res, 400, 'Username, full name, and password are required');
        }

        const cleanUsername = username.trim().toLowerCase();
        if (cleanUsername.length < 3 || cleanUsername.length > 25) {
          return sendError(res, 400, 'Username must be between 3 and 25 characters');
        }

        if (!/^[a-z0-9_.]+$/.test(cleanUsername)) {
          return sendError(res, 400, 'Username can only contain letters, numbers, dots, and underscores');
        }

        if (password.length < 6) {
          return sendError(res, 400, 'Password must be at least 6 characters');
        }

        const existingUser = db.users.find(u => u.username.toLowerCase() === cleanUsername);
        if (existingUser) {
          return sendError(res, 409, 'Username is already taken');
        }

        const { hash, salt } = hashPassword(password);
        const userId = 'user_' + crypto.randomBytes(6).toString('hex');
        
        // Generate nice default avatar if none provided
        const defaultAvatar = avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${cleanUsername}`;

        const newUser = {
          id: userId,
          username: cleanUsername,
          fullName: fullName.trim(),
          bio: (bio || 'Hey there! I am using ChatExpress.').trim(),
          avatar: defaultAvatar,
          passwordHash: hash,
          salt: salt,
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        db.users.push(newUser);

        // Generate session token
        const token = crypto.randomBytes(32).toString('hex');
        db.sessions[token] = userId;
        saveDatabase();

        // Broadcast new user to all clients for search/story lists
        broadcastSseEvent('user_joined', {
          id: newUser.id,
          username: newUser.username,
          fullName: newUser.fullName,
          avatar: newUser.avatar
        }, newUser.id);

        return sendJson(res, 201, {
          message: 'Account created successfully',
          token,
          user: {
            id: newUser.id,
            username: newUser.username,
            fullName: newUser.fullName,
            bio: newUser.bio,
            avatar: newUser.avatar,
            createdAt: newUser.createdAt
          }
        }, {
          'Set-Cookie': `chatexpress_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
        });
      }

      // 2. Auth: Login
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { username, password } = body;

        if (!username || !password) {
          return sendError(res, 400, 'Username and password are required');
        }

        const cleanUsername = username.trim().toLowerCase();
        const user = db.users.find(u => u.username.toLowerCase() === cleanUsername);

        if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
          return sendError(res, 401, 'Invalid username or password');
        }

        user.lastSeen = new Date().toISOString();

        const token = crypto.randomBytes(32).toString('hex');
        db.sessions[token] = user.id;
        saveDatabase();

        // Broadcast user online status
        broadcastSseEvent('user_status', { userId: user.id, status: 'online' });

        return sendJson(res, 200, {
          message: 'Logged in successfully',
          token,
          user: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            bio: user.bio,
            avatar: user.avatar,
            createdAt: user.createdAt
          }
        }, {
          'Set-Cookie': `chatexpress_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
        });
      }

      // 3. Auth: Logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const cookies = parseCookies(req);
        const token = cookies['chatexpress_session'] || (req.headers['authorization'] || '').replace('Bearer ', '');
        if (token && db.sessions[token]) {
          const userId = db.sessions[token];
          delete db.sessions[token];
          saveDatabase();
          broadcastSseEvent('user_status', { userId, status: 'offline', lastSeen: new Date().toISOString() });
        }
        return sendJson(res, 200, { message: 'Logged out successfully' }, {
          'Set-Cookie': 'chatexpress_session=; Path=/; HttpOnly; Max-Age=0'
        });
      }

      // 4. Auth: Get Current User Profile
      if (pathname === '/api/auth/me' && method === 'GET') {
        const currentUser = getSessionUser(req);
        if (!currentUser) return sendError(res, 401, 'Unauthorized');

        currentUser.lastSeen = new Date().toISOString();
        return sendJson(res, 200, {
          user: {
            id: currentUser.id,
            username: currentUser.username,
            fullName: currentUser.fullName,
            bio: currentUser.bio,
            avatar: currentUser.avatar,
            createdAt: currentUser.createdAt
          }
        });
      }

      // 5. Auth: Update Current User Profile
      if (pathname === '/api/auth/profile' && method === 'PUT') {
        const currentUser = getSessionUser(req);
        if (!currentUser) return sendError(res, 401, 'Unauthorized');

        const body = await parseJsonBody(req);
        if (body.fullName) currentUser.fullName = body.fullName.trim();
        if (typeof body.bio === 'string') currentUser.bio = body.bio.trim();
        if (body.avatar) currentUser.avatar = body.avatar.trim();

        saveDatabase();

        broadcastSseEvent('user_profile_updated', {
          id: currentUser.id,
          fullName: currentUser.fullName,
          bio: currentUser.bio,
          avatar: currentUser.avatar
        });

        return sendJson(res, 200, {
          message: 'Profile updated successfully',
          user: {
            id: currentUser.id,
            username: currentUser.username,
            fullName: currentUser.fullName,
            bio: currentUser.bio,
            avatar: currentUser.avatar
          }
        });
      }

      // Protected routes below
      const currentUser = getSessionUser(req);
      if (!currentUser && pathname !== '/api/demo-accounts') {
        return sendError(res, 401, 'Unauthorized. Please log in.');
      }

      // Demo accounts helper (so user can 1-click test between users!)
      if (pathname === '/api/demo-accounts' && method === 'GET') {
        const demos = db.users.slice(0, 3).map(u => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          avatar: u.avatar
        }));
        return sendJson(res, 200, { demos, password: 'password123' });
      }

      // 6. Real-Time SSE Stream Endpoint
      if (pathname === '/api/realtime' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        if (!sseClients.has(currentUser.id)) {
          sseClients.set(currentUser.id, new Set());
        }
        sseClients.get(currentUser.id).add(res);

        // Notify others user is online
        broadcastSseEvent('user_status', { userId: currentUser.id, status: 'online' });

        // Heartbeat interval to keep connection active
        const heartbeatTimer = setInterval(() => {
          try {
            res.write(': keep-alive\n\n');
          } catch (e) {
            clearInterval(heartbeatTimer);
          }
        }, 20000);

        // Initial connect ack
        res.write(`event: connected\ndata: ${JSON.stringify({ userId: currentUser.id, time: Date.now() })}\n\n`);

        req.on('close', () => {
          clearInterval(heartbeatTimer);
          const clients = sseClients.get(currentUser.id);
          if (clients) {
            clients.delete(res);
            if (clients.size === 0) {
              sseClients.delete(currentUser.id);
              currentUser.lastSeen = new Date().toISOString();
              saveDatabase();
              broadcastSseEvent('user_status', { userId: currentUser.id, status: 'offline', lastSeen: currentUser.lastSeen });
            }
          }
        });
        return;
      }

      // 7. Users List & Search
      if (pathname === '/api/users' && method === 'GET') {
        const query = (parsedUrl.query.q || '').toString().toLowerCase().trim();
        const usersList = db.users
          .filter(u => u.id !== currentUser.id)
          .filter(u => {
            if (!query) return true;
            return u.username.toLowerCase().includes(query) || u.fullName.toLowerCase().includes(query);
          })
          .map(u => ({
            id: u.id,
            username: u.username,
            fullName: u.fullName,
            bio: u.bio,
            avatar: u.avatar,
            isOnline: sseClients.has(u.id) && sseClients.get(u.id).size > 0,
            lastSeen: u.lastSeen
          }));

        return sendJson(res, 200, { users: usersList });
      }

      // 8. Conversations List (Instagram Direct Inbox)
      if (pathname === '/api/conversations' && method === 'GET') {
        // Find all unique users current user has chatted with
        const chattedUserIds = new Set();
        db.messages.forEach(m => {
          if (m.senderId === currentUser.id) chattedUserIds.add(m.receiverId);
          if (m.receiverId === currentUser.id) chattedUserIds.add(m.senderId);
        });

        // Also include all other users so conversation list is easy to explore
        db.users.forEach(u => {
          if (u.id !== currentUser.id) chattedUserIds.add(u.id);
        });

        const conversations = [];

        for (const otherId of chattedUserIds) {
          const otherUser = db.users.find(u => u.id === otherId);
          if (!otherUser) continue;

          // Find messages between currentUser and otherUser
          const thread = db.messages.filter(m =>
            (m.senderId === currentUser.id && m.receiverId === otherId) ||
            (m.senderId === otherId && m.receiverId === currentUser.id)
          ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

          const lastMessage = thread.length > 0 ? thread[thread.length - 1] : null;
          const unreadCount = thread.filter(m => m.receiverId === currentUser.id && !m.read).length;

          conversations.push({
            user: {
              id: otherUser.id,
              username: otherUser.username,
              fullName: otherUser.fullName,
              avatar: otherUser.avatar,
              isOnline: sseClients.has(otherUser.id) && sseClients.get(otherUser.id).size > 0,
              lastSeen: otherUser.lastSeen
            },
            lastMessage: lastMessage ? {
              id: lastMessage.id,
              senderId: lastMessage.senderId,
              text: lastMessage.text,
              hasImage: !!lastMessage.image,
              createdAt: lastMessage.createdAt,
              read: lastMessage.read
            } : null,
            unreadCount
          });
        }

        // Sort by most recent message, then by alphabetical username
        conversations.sort((a, b) => {
          const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
          const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
          return timeB - timeA;
        });

        return sendJson(res, 200, { conversations });
      }

      // 9. Messages Thread: GET /api/messages/:otherUserId
      const matchMessages = pathname.match(/^\/api\/messages\/([^/]+)$/);
      if (matchMessages && method === 'GET') {
        const otherUserId = matchMessages[1];
        const otherUser = db.users.find(u => u.id === otherUserId);
        if (!otherUser) return sendError(res, 404, 'User not found');

        let hasMarkedRead = false;
        const thread = db.messages.filter(m => {
          const isBetween = (m.senderId === currentUser.id && m.receiverId === otherUserId) ||
                            (m.senderId === otherUserId && m.receiverId === currentUser.id);
          if (isBetween && m.receiverId === currentUser.id && !m.read) {
            m.read = true;
            hasMarkedRead = true;
          }
          return isBetween;
        }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        if (hasMarkedRead) {
          saveDatabase();
          // Notify other user that messages were read
          sendSseEvent(otherUserId, 'messages_read', {
            byUserId: currentUser.id
          });
        }

        return sendJson(res, 200, {
          otherUser: {
            id: otherUser.id,
            username: otherUser.username,
            fullName: otherUser.fullName,
            bio: otherUser.bio,
            avatar: otherUser.avatar,
            isOnline: sseClients.has(otherUser.id) && sseClients.get(otherUser.id).size > 0,
            lastSeen: otherUser.lastSeen
          },
          messages: thread
        });
      }

      // 10. Send Message: POST /api/messages
      if (pathname === '/api/messages' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { receiverId, text, image } = body;

        if (!receiverId) return sendError(res, 400, 'receiverId is required');
        if (!text && !image) return sendError(res, 400, 'Message text or image is required');

        const receiver = db.users.find(u => u.id === receiverId);
        if (!receiver) return sendError(res, 404, 'Recipient user not found');

        const newMsg = {
          id: 'msg_' + crypto.randomBytes(8).toString('hex'),
          senderId: currentUser.id,
          receiverId: receiver.id,
          text: (text || '').trim(),
          image: image || null,
          reactions: {},
          read: false,
          createdAt: new Date().toISOString()
        };

        db.messages.push(newMsg);
        saveDatabase();

        // Real-time broadcast to receiver
        sendSseEvent(receiver.id, 'new_message', newMsg);
        // Also echo to other active tabs of sender
        sendSseEvent(currentUser.id, 'new_message', newMsg);

        return sendJson(res, 201, { message: newMsg });
      }

      // 11. Toggle Message Reaction: POST /api/messages/:id/react
      const matchReact = pathname.match(/^\/api\/messages\/([^/]+)\/react$/);
      if (matchReact && method === 'POST') {
        const messageId = matchReact[1];
        const body = await parseJsonBody(req);
        const { emoji } = body;

        const msg = db.messages.find(m => m.id === messageId);
        if (!msg) return sendError(res, 404, 'Message not found');

        if (!msg.reactions) msg.reactions = {};

        if (msg.reactions[currentUser.id] === emoji) {
          // Toggle off
          delete msg.reactions[currentUser.id];
        } else {
          msg.reactions[currentUser.id] = emoji || '❤️';
        }

        saveDatabase();

        const otherUserId = msg.senderId === currentUser.id ? msg.receiverId : msg.senderId;
        const reactionEvent = {
          messageId: msg.id,
          reactions: msg.reactions,
          userId: currentUser.id,
          emoji: msg.reactions[currentUser.id] || null
        };

        sendSseEvent(otherUserId, 'message_reaction', reactionEvent);
        sendSseEvent(currentUser.id, 'message_reaction', reactionEvent);

        return sendJson(res, 200, { success: true, reactions: msg.reactions });
      }

      // 12. Delete Message: DELETE /api/messages/:id
      const matchDelete = pathname.match(/^\/api\/messages\/([^/]+)$/);
      if (matchDelete && method === 'DELETE') {
        const messageId = matchDelete[1];
        const index = db.messages.findIndex(m => m.id === messageId);
        if (index === -1) return sendError(res, 404, 'Message not found');

        const msg = db.messages[index];
        if (msg.senderId !== currentUser.id) {
          return sendError(res, 403, 'You can only unsend your own messages');
        }

        const receiverId = msg.receiverId;
        db.messages.splice(index, 1);
        saveDatabase();

        sendSseEvent(receiverId, 'message_deleted', { messageId });
        sendSseEvent(currentUser.id, 'message_deleted', { messageId });

        return sendJson(res, 200, { success: true });
      }

      // 13. Typing Indicator: POST /api/typing
      if (pathname === '/api/typing' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { receiverId, isTyping } = body;

        if (receiverId) {
          sendSseEvent(receiverId, 'typing', {
            senderId: currentUser.id,
            username: currentUser.username,
            isTyping: !!isTyping
          });
        }
        return sendJson(res, 200, { ok: true });
      }

      // 14. File Upload (e.g. Chat photos / avatars): POST /api/upload
      if (pathname === '/api/upload' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { base64Data, filename } = body;

        if (!base64Data) return sendError(res, 400, 'base64Data is required');

        // Extract mime type and base64 string
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        let ext = '.png';

        if (matches && matches.length === 3) {
          const mime = matches[1];
          buffer = Buffer.from(matches[2], 'base64');
          if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
          else if (mime.includes('gif')) ext = '.gif';
          else if (mime.includes('webp')) ext = '.webp';
        } else {
          buffer = Buffer.from(base64Data, 'base64');
        }

        const uniqueName = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
        const targetPath = path.join(UPLOADS_DIR, uniqueName);
        fs.writeFileSync(targetPath, buffer);

        const fileUrl = `/uploads/${uniqueName}`;
        return sendJson(res, 201, { url: fileUrl });
      }

      return sendError(res, 404, 'API endpoint not found');
    } catch (err) {
      console.error('[API Error]', err);
      return sendError(res, 500, err.message || 'Internal Server Error');
    }
  }

  // --- Static Uploads Serving ---
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const safePath = path.join(UPLOADS_DIR, filename);
    return serveStaticFile(req, res, safePath);
  }

  // --- Static Frontend Serving ---
  let safePath;
  if (pathname === '/' || pathname === '/index.html') {
    safePath = path.join(PUBLIC_DIR, 'index.html');
  } else {
    // Prevent directory traversal
    const normalized = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    safePath = path.join(PUBLIC_DIR, normalized);
  }

  // If path doesn't have an extension, try adding .html or default to index.html for SPA
  if (!path.extname(safePath)) {
    if (fs.existsSync(safePath + '.html')) {
      safePath = safePath + '.html';
    } else {
      safePath = path.join(PUBLIC_DIR, 'index.html');
    }
  }

  serveStaticFile(req, res, safePath);
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 ChatExpress (Instagram-Style Chat) is running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`💬 Zero npm dependencies required - ready to run!`);
  console.log(`====================================================`);
});
