/**
 * ChatExpress - Client Application Logic
 * Implements real-time SSE, Instagram-style messaging, and auth handling.
 */

// Application State
const state = {
  currentUser: null,
  activeUserId: null,
  activeUser: null,
  conversations: [],
  messages: [],
  onlineUsers: new Set(),
  sseSource: null,
  typingTimeout: null,
  isTyping: false
};

// --- DOM Element References ---
const elements = {
  // Navigation & Header
  btnLogoHome: document.getElementById('btn-logo-home'),
  btnTabChats: document.getElementById('btn-tab-chats'),
  btnOpenSearch: document.getElementById('btn-open-search'),
  btnNewChat: document.getElementById('btn-new-chat'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  btnProfile: document.getElementById('btn-profile'),
  railTotalUnread: document.getElementById('rail-total-unread'),
  inboxCurrentUsername: document.getElementById('inbox-current-username'),
  btnCompose: document.getElementById('btn-compose'),

  // Inbox & Stories
  storiesContainer: document.getElementById('stories-container'),
  inboxSearchInput: document.getElementById('inbox-search-input'),
  conversationsList: document.getElementById('conversations-list'),

  // Main Chat Pane
  chatWindow: document.getElementById('chat-window'),
  emptyState: document.getElementById('empty-state'),
  activeChatContainer: document.getElementById('active-chat-container'),
  btnMobileBack: document.getElementById('btn-mobile-back'),
  chatHeaderAvatar: document.getElementById('chat-header-avatar'),
  chatHeaderOnlineDot: document.getElementById('chat-header-online-dot'),
  chatHeaderFullname: document.getElementById('chat-header-fullname'),
  chatHeaderStatus: document.getElementById('chat-header-status'),
  chatHeaderProfile: document.getElementById('chat-header-profile'),
  messagesContainer: document.getElementById('messages-container'),
  chatForm: document.getElementById('chat-form'),
  chatMessageInput: document.getElementById('chat-message-input'),
  btnSendMessage: document.getElementById('btn-send-message'),
  btnToggleEmoji: document.getElementById('btn-toggle-emoji'),
  emojiPopover: document.getElementById('emoji-popover'),
  btnAttachImage: document.getElementById('btn-attach-image'),
  imageFileInput: document.getElementById('image-file-input'),

  // Modals - Auth
  modalAuth: document.getElementById('modal-auth'),
  tabLogin: document.getElementById('tab-login'),
  tabSignup: document.getElementById('tab-signup'),
  formLogin: document.getElementById('form-login'),
  loginUsername: document.getElementById('login-username'),
  loginPassword: document.getElementById('login-password'),
  formSignup: document.getElementById('form-signup'),
  signupUsername: document.getElementById('signup-username'),
  signupFullname: document.getElementById('signup-fullname'),
  signupPassword: document.getElementById('signup-password'),
  signupBio: document.getElementById('signup-bio'),
  loginError: document.getElementById('login-error'),
  signupError: document.getElementById('signup-error'),
  demoChipsContainer: document.getElementById('demo-chips-container'),

  // Modals - Search
  modalSearch: document.getElementById('modal-search'),
  btnCloseSearch: document.getElementById('btn-close-search'),
  modalSearchInput: document.getElementById('modal-search-input'),
  modalSearchResults: document.getElementById('modal-search-results'),

  // Modals - Profile
  modalProfile: document.getElementById('modal-profile'),
  btnCloseProfile: document.getElementById('btn-close-profile'),
  formEditProfile: document.getElementById('form-edit-profile'),
  profileEditAvatar: document.getElementById('profile-edit-avatar'),
  profileEditAvatarPreview: document.getElementById('profile-edit-avatar-preview'),
  profileEditFullname: document.getElementById('profile-edit-fullname'),
  profileEditBio: document.getElementById('profile-edit-bio'),
  btnLogout: document.getElementById('btn-logout'),

  // Modals - Media
  modalMedia: document.getElementById('modal-media'),
  fullMediaImg: document.getElementById('full-media-img')
};

// --- API Client Helpers ---
async function api(path, options = {}) {
  const defaultHeaders = { 'Content-Type': 'application/json' };
  const res = await fetch(path, {
    ...options,
    headers: { ...defaultHeaders, ...options.headers }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

// Format relative time (Instagram style: 5m, 2h, 3d, 1w)
function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

// --- App Initialization ---
async function initApp() {
  initTheme();
  setupEventListeners();

  try {
    const data = await api('/api/auth/me');
    state.currentUser = data.user;
    onUserAuthenticated();
  } catch (err) {
    showAuthModal(true);
    loadDemoAccounts();
  }
}

function onUserAuthenticated() {
  showAuthModal(false);
  updateCurrentUserUI();
  initRealtimeSSE();
  loadConversations();
}

function updateCurrentUserUI() {
  const u = state.currentUser;
  if (!u) return;
  elements.btnProfile.src = u.avatar;
  elements.inboxCurrentUsername.innerHTML = `<span>${escapeHtml(u.username)}</span>`;
  elements.profileEditAvatar.value = u.avatar;
  elements.profileEditAvatarPreview.src = u.avatar;
  elements.profileEditFullname.value = u.fullName;
  elements.profileEditBio.value = u.bio || '';
}

// --- Real-time Server-Sent Events (SSE) ---
function initRealtimeSSE() {
  if (state.sseSource) {
    state.sseSource.close();
  }

  const sse = new EventSource('/api/realtime');
  state.sseSource = sse;

  sse.addEventListener('connected', (e) => {
    console.log('[SSE] Connected to real-time stream.');
  });

  sse.addEventListener('new_message', (e) => {
    const msg = JSON.parse(e.data);
    handleIncomingMessage(msg);
  });

  sse.addEventListener('messages_read', (e) => {
    const data = JSON.parse(e.data);
    if (state.activeUserId === data.byUserId) {
      state.messages.forEach(m => {
        if (m.senderId === state.currentUser.id) m.read = true;
      });
      renderMessages();
    }
  });

  sse.addEventListener('message_reaction', (e) => {
    const data = JSON.parse(e.data);
    const targetMsg = state.messages.find(m => m.id === data.messageId);
    if (targetMsg) {
      targetMsg.reactions = data.reactions;
      renderMessages();
    }
  });

  sse.addEventListener('message_deleted', (e) => {
    const data = JSON.parse(e.data);
    state.messages = state.messages.filter(m => m.id !== data.messageId);
    renderMessages();
    loadConversations();
  });

  sse.addEventListener('typing', (e) => {
    const data = JSON.parse(e.data);
    if (state.activeUserId === data.senderId) {
      renderTypingIndicator(data.isTyping, data.username);
    }
  });

  sse.addEventListener('user_status', (e) => {
    const data = JSON.parse(e.data);
    if (data.status === 'online') {
      state.onlineUsers.add(data.userId);
    } else {
      state.onlineUsers.delete(data.userId);
    }
    updateOnlineBadges();
  });

  sse.addEventListener('user_profile_updated', (e) => {
    loadConversations();
    if (state.activeUserId === e.data.id) {
      elements.chatHeaderFullname.textContent = e.data.fullName;
      elements.chatHeaderAvatar.src = e.data.avatar;
    }
  });

  sse.onerror = (err) => {
    console.warn('[SSE] Connection lost, reconnecting...', err);
  };
}

function handleIncomingMessage(msg) {
  if (msg.senderId !== state.currentUser.id) {
    playNotificationSound();
  }

  const isCurrentConv = (msg.senderId === state.activeUserId || msg.receiverId === state.activeUserId);
  if (isCurrentConv) {
    if (!state.messages.some(m => m.id === msg.id)) {
      state.messages.push(msg);
      renderMessages();
      scrollToBottom();
      if (msg.receiverId === state.currentUser.id) {
        api(`/api/messages/${state.activeUserId}`).catch(() => {});
      }
    }
  }

  loadConversations();
}

// --- Conversations & Stories Management ---
async function loadConversations() {
  try {
    const data = await api('/api/conversations');
    state.conversations = data.conversations || [];
    renderStoriesBar();
    renderConversationsList();
    updateUnreadCounter();
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderStoriesBar() {
  elements.storiesContainer.innerHTML = '';

  // "Your note / story"
  const myStoryEl = document.createElement('div');
  myStoryEl.className = 'story-item';
  myStoryEl.innerHTML = `
    <div class="story-avatar-wrap no-story">
      <img src="${escapeHtml(state.currentUser.avatar)}" alt="You">
      <span class="online-dot" style="background-color: var(--accent-blue);"></span>
    </div>
    <span class="story-name">Your note</span>
  `;
  myStoryEl.onclick = () => showProfileModal();
  elements.storiesContainer.appendChild(myStoryEl);

  // Other users in stories bar
  state.conversations.forEach(conv => {
    const user = conv.user;
    const isOnline = user.isOnline || state.onlineUsers.has(user.id);
    const storyEl = document.createElement('div');
    storyEl.className = 'story-item';
    storyEl.innerHTML = `
      <div class="story-avatar-wrap ${isOnline ? '' : 'no-story'}">
        <img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.username)}">
        ${isOnline ? '<span class="online-dot"></span>' : ''}
      </div>
      <span class="story-name">${escapeHtml(user.username)}</span>
    `;
    storyEl.onclick = () => selectConversation(user.id);
    elements.storiesContainer.appendChild(storyEl);
  });
}

function renderConversationsList() {
  const searchTerm = elements.inboxSearchInput.value.toLowerCase().trim();
  elements.conversationsList.innerHTML = '';

  const filtered = state.conversations.filter(c => {
    if (!searchTerm) return true;
    return c.user.username.toLowerCase().includes(searchTerm) || 
           c.user.fullName.toLowerCase().includes(searchTerm);
  });

  if (filtered.length === 0) {
    elements.conversationsList.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 14px;">
        No conversations found.
      </div>
    `;
    return;
  }

  filtered.forEach(conv => {
    const user = conv.user;
    const isOnline = user.isOnline || state.onlineUsers.has(user.id);
    const isActive = state.activeUserId === user.id;
    const unread = conv.unreadCount > 0;

    let snippet = 'Say hello! 👋';
    let timeStr = '';
    if (conv.lastMessage) {
      const isMe = conv.lastMessage.senderId === state.currentUser.id;
      const text = conv.lastMessage.hasImage ? '📷 Sent a photo' : conv.lastMessage.text;
      snippet = isMe ? `You: ${text}` : text;
      timeStr = formatRelativeTime(conv.lastMessage.createdAt);
    }

    const item = document.createElement('div');
    item.className = `conv-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''}`;
    item.innerHTML = `
      <div class="conv-avatar-wrap">
        <img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.username)}">
        ${isOnline ? '<span class="online-dot"></span>' : ''}
      </div>
      <div class="conv-info">
        <div class="conv-top-row">
          <span class="conv-name">${escapeHtml(user.fullName)}</span>
          <span class="conv-time">${timeStr}</span>
        </div>
        <div class="conv-bottom-row">
          <span class="conv-snippet">${escapeHtml(snippet)}</span>
          ${unread ? '<span class="conv-unread-dot"></span>' : ''}
        </div>
      </div>
    `;
    item.onclick = () => selectConversation(user.id);
    elements.conversationsList.appendChild(item);
  });
}

function updateUnreadCounter() {
  const totalUnread = state.conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  if (totalUnread > 0) {
    elements.railTotalUnread.style.display = 'flex';
    elements.railTotalUnread.textContent = totalUnread > 9 ? '9+' : totalUnread;
  } else {
    elements.railTotalUnread.style.display = 'none';
  }
}

// --- Active Chat Selection & Message Loading ---
async function selectConversation(userId) {
  state.activeUserId = userId;
  renderConversationsList();

  elements.emptyState.style.display = 'none';
  elements.activeChatContainer.style.display = 'flex';
  elements.chatWindow.classList.add('active-mobile');

  elements.messagesContainer.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">
      Loading conversation...
    </div>
  `;

  try {
    const data = await api(`/api/messages/${userId}`);
    state.activeUser = data.otherUser;
    state.messages = data.messages || [];

    elements.chatHeaderFullname.textContent = data.otherUser.fullName;
    elements.chatHeaderAvatar.src = data.otherUser.avatar;
    const isOnline = data.otherUser.isOnline || state.onlineUsers.has(data.otherUser.id);
    elements.chatHeaderOnlineDot.style.display = isOnline ? 'block' : 'none';
    elements.chatHeaderStatus.textContent = isOnline ? 'Active now' : `Active ${formatRelativeTime(data.otherUser.lastSeen)} ago`;

    renderMessages();
    scrollToBottom();
    elements.chatMessageInput.focus();

    loadConversations();
  } catch (err) {
    console.error('Failed to load message thread:', err);
  }
}

function renderMessages() {
  elements.messagesContainer.innerHTML = '';
  if (!state.activeUser) return;

  // Banner at top
  const banner = document.createElement('div');
  banner.className = 'thread-profile-banner';
  banner.innerHTML = `
    <img src="${escapeHtml(state.activeUser.avatar)}" class="thread-profile-avatar" alt="">
    <h2 class="thread-profile-name">${escapeHtml(state.activeUser.fullName)}</h2>
    <div class="thread-profile-handle">@${escapeHtml(state.activeUser.username)} • ChatExpress</div>
    <div class="thread-profile-bio">${escapeHtml(state.activeUser.bio || '')}</div>
  `;
  elements.messagesContainer.appendChild(banner);

  // Messages
  state.messages.forEach(msg => {
    const isSent = msg.senderId === state.currentUser.id;
    const row = document.createElement('div');
    row.className = `msg-row ${isSent ? 'sent' : 'received'}`;
    row.id = `msg-${msg.id}`;

    let reactionsHtml = '';
    const reactions = msg.reactions || {};
    const reactionKeys = Object.keys(reactions);
    if (reactionKeys.length > 0) {
      const emojiSummary = [...new Set(Object.values(reactions))].join(' ');
      reactionsHtml = `
        <div class="msg-reactions-badge" title="Reactions: ${reactionKeys.length}" onclick="toggleQuickReaction('${msg.id}', '❤️')">
          ${emojiSummary} ${reactionKeys.length > 1 ? reactionKeys.length : ''}
        </div>
      `;
    }

    let mediaHtml = '';
    if (msg.image) {
      mediaHtml = `
        <div class="msg-media" onclick="openMediaPreview('${escapeHtml(msg.image)}')">
          <img src="${escapeHtml(msg.image)}" alt="Photo message" loading="lazy">
        </div>
      `;
    }

    const textHtml = msg.text ? `<div class="msg-bubble" ondblclick="toggleQuickReaction('${msg.id}', '❤️')">${escapeHtml(msg.text)}</div>` : '';

    row.innerHTML = `
      <div class="msg-bubble-wrap">
        ${!isSent ? `<img src="${escapeHtml(state.activeUser.avatar)}" class="msg-sender-avatar" alt="">` : ''}
        <div style="position: relative; max-width: 100%;">
          ${mediaHtml}
          ${textHtml}
          ${reactionsHtml}
        </div>
        <div class="msg-hover-actions">
          <button class="reaction-btn" onclick="toggleQuickReaction('${msg.id}', '❤️')" title="Love">❤️</button>
          <button class="reaction-btn" onclick="toggleQuickReaction('${msg.id}', '😂')" title="Haha">😂</button>
          <button class="reaction-btn" onclick="toggleQuickReaction('${msg.id}', '🔥')" title="Fire">🔥</button>
          <button class="reaction-btn" onclick="toggleQuickReaction('${msg.id}', '👏')" title="Applause">👏</button>
          ${isSent ? `<button class="reaction-btn" onclick="deleteMessage('${msg.id}')" title="Unsend message" style="font-size: 13px; color: var(--danger-color);">🗑️</button>` : ''}
        </div>
      </div>
      <div class="msg-meta">
        ${formatRelativeTime(msg.createdAt)}
        ${isSent ? (msg.read ? ' · Seen' : ' · Sent') : ''}
      </div>
    `;

    elements.messagesContainer.appendChild(row);
  });
}

function renderTypingIndicator(isTyping, username) {
  let typingEl = document.getElementById('typing-indicator-row');
  if (isTyping) {
    if (!typingEl) {
      typingEl = document.createElement('div');
      typingEl.id = 'typing-indicator-row';
      typingEl.className = 'typing-row';
      typingEl.innerHTML = `
        <img src="${escapeHtml(state.activeUser.avatar)}" class="msg-sender-avatar" alt="">
        <div class="typing-bubble">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
        <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(username)} is typing...</span>
      `;
      elements.messagesContainer.appendChild(typingEl);
      scrollToBottom();
    }
  } else if (typingEl) {
    typingEl.remove();
  }
}

function updateOnlineBadges() {
  if (state.activeUser) {
    const isOnline = state.onlineUsers.has(state.activeUser.id);
    elements.chatHeaderOnlineDot.style.display = isOnline ? 'block' : 'none';
    if (isOnline) {
      elements.chatHeaderStatus.textContent = 'Active now';
    }
  }
  renderConversationsList();
  renderStoriesBar();
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// --- Message Sending & Interactions ---
async function sendMessage(text = '', image = null) {
  if (!state.activeUserId) return;
  if (!text.trim() && !image) return;

  try {
    const payload = {
      receiverId: state.activeUserId,
      text: text.trim(),
      image: image
    };

    const res = await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    elements.chatMessageInput.value = '';
    broadcastTyping(false);

    if (!state.messages.some(m => m.id === res.message.id)) {
      state.messages.push(res.message);
      renderMessages();
      scrollToBottom();
    }
    loadConversations();
  } catch (err) {
    alert('Failed to send message: ' + err.message);
  }
}

async function toggleQuickReaction(messageId, emoji) {
  try {
    const res = await api(`/api/messages/${messageId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });
    const msg = state.messages.find(m => m.id === messageId);
    if (msg) {
      msg.reactions = res.reactions;
      renderMessages();
    }
  } catch (err) {
    console.error('Reaction failed:', err);
  }
}

async function deleteMessage(messageId) {
  if (!confirm('Unsend this message? It will be removed for everyone.')) return;
  try {
    await api(`/api/messages/${messageId}`, { method: 'DELETE' });
    state.messages = state.messages.filter(m => m.id !== messageId);
    renderMessages();
    loadConversations();
  } catch (err) {
    alert('Could not unsend message: ' + err.message);
  }
}

function broadcastTyping(isTyping) {
  if (!state.activeUserId) return;
  if (state.isTyping === isTyping) return;
  state.isTyping = isTyping;

  api('/api/typing', {
    method: 'POST',
    body: JSON.stringify({
      receiverId: state.activeUserId,
      isTyping
    })
  }).catch(() => {});
}

// --- Image Attachment & Media Preview ---
async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    alert('Image file must be under 8MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const uploadRes = await api('/api/upload', {
        method: 'POST',
        body: JSON.stringify({
          base64Data: reader.result,
          filename: file.name
        })
      });
      sendMessage('', uploadRes.url);
    } catch (err) {
      alert('Photo upload failed: ' + err.message);
    } finally {
      elements.imageFileInput.value = '';
    }
  };
  reader.readAsDataURL(file);
}

function openMediaPreview(src) {
  elements.fullMediaImg.src = src;
  elements.modalMedia.classList.add('open');
}

// --- Modals & Search ---
function showAuthModal(show) {
  if (show) elements.modalAuth.classList.add('open');
  else elements.modalAuth.classList.remove('open');
}

async function loadDemoAccounts() {
  try {
    const data = await api('/api/demo-accounts');
    elements.demoChipsContainer.innerHTML = '';
    data.demos.forEach(d => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'demo-chip';
      chip.innerHTML = `
        <img src="${escapeHtml(d.avatar)}" alt="">
        <span>${escapeHtml(d.username)}</span>
      `;
      chip.onclick = () => {
        elements.loginUsername.value = d.username;
        elements.loginPassword.value = data.password;
        submitLogin();
      };
      elements.demoChipsContainer.appendChild(chip);
    });
  } catch (e) {
    console.error('Failed to load demo accounts', e);
  }
}

async function submitLogin() {
  elements.loginError.textContent = '';
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    state.currentUser = data.user;
    onUserAuthenticated();
  } catch (err) {
    elements.loginError.textContent = err.message;
  }
}

async function submitSignup() {
  elements.signupError.textContent = '';
  const username = elements.signupUsername.value.trim();
  const fullName = elements.signupFullname.value.trim();
  const password = elements.signupPassword.value;
  const bio = elements.signupBio.value.trim();

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, fullName, password, bio })
    });
    state.currentUser = data.user;
    onUserAuthenticated();
  } catch (err) {
    elements.signupError.textContent = err.message;
  }
}

// Search Modal
function openSearchModal() {
  elements.modalSearch.classList.add('open');
  elements.modalSearchInput.value = '';
  elements.modalSearchInput.focus();
  searchUsers('');
}

async function searchUsers(q) {
  try {
    const data = await api(`/api/users?q=${encodeURIComponent(q)}`);
    elements.modalSearchResults.innerHTML = '';
    if (data.users.length === 0) {
      elements.modalSearchResults.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--text-muted);">
          No users found.
        </div>
      `;
      return;
    }

    data.users.forEach(u => {
      const item = document.createElement('div');
      item.className = 'conv-item';
      item.innerHTML = `
        <div class="conv-avatar-wrap">
          <img src="${escapeHtml(u.avatar)}" alt="${escapeHtml(u.username)}">
          ${u.isOnline ? '<span class="online-dot"></span>' : ''}
        </div>
        <div class="conv-info">
          <div class="conv-name">${escapeHtml(u.fullName)}</div>
          <div class="conv-snippet">@${escapeHtml(u.username)} • ${escapeHtml(u.bio || '')}</div>
        </div>
        <button class="btn-primary" style="padding: 6px 14px; font-size: 13px;">Chat</button>
      `;
      item.onclick = () => {
        elements.modalSearch.classList.remove('open');
        selectConversation(u.id);
      };
      elements.modalSearchResults.appendChild(item);
    });
  } catch (err) {
    console.error('Search failed:', err);
  }
}

// Profile Modal
function showProfileModal() {
  elements.modalProfile.classList.add('open');
}

async function saveProfile() {
  const fullName = elements.profileEditFullname.value.trim();
  const bio = elements.profileEditBio.value.trim();
  const avatar = elements.profileEditAvatar.value.trim();

  try {
    const res = await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ fullName, bio, avatar })
    });
    state.currentUser = res.user;
    updateCurrentUserUI();
    elements.modalProfile.classList.remove('open');
    loadConversations();
  } catch (err) {
    alert('Failed to update profile: ' + err.message);
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  window.location.reload();
}

// --- Theme Management ---
function initTheme() {
  const saved = localStorage.getItem('chatexpress_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('chatexpress_theme', next);
}

// --- Notification Audio ---
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Event Listeners Wiring ---
function setupEventListeners() {
  elements.btnLogoHome.onclick = () => {
    state.activeUserId = null;
    elements.emptyState.style.display = 'flex';
    elements.activeChatContainer.style.display = 'none';
    elements.chatWindow.classList.remove('active-mobile');
    renderConversationsList();
  };

  elements.btnTabChats.onclick = () => loadConversations();
  elements.btnOpenSearch.onclick = openSearchModal;
  elements.btnNewChat.onclick = openSearchModal;
  elements.btnCompose.onclick = openSearchModal;
  elements.btnProfile.onclick = showProfileModal;
  elements.btnThemeToggle.onclick = toggleTheme;

  const btnEmptyStart = document.getElementById('btn-empty-start');
  if (btnEmptyStart) btnEmptyStart.onclick = openSearchModal;

  elements.btnMobileBack.onclick = () => {
    elements.chatWindow.classList.remove('active-mobile');
  };

  elements.chatForm.onsubmit = (e) => {
    e.preventDefault();
    sendMessage(elements.chatMessageInput.value);
  };

  elements.chatMessageInput.addEventListener('input', () => {
    broadcastTyping(true);
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      broadcastTyping(false);
    }, 1500);
  });

  elements.btnToggleEmoji.onclick = (e) => {
    e.stopPropagation();
    elements.emojiPopover.classList.toggle('open');
  };

  document.querySelectorAll('.emoji-tile').forEach(tile => {
    tile.onclick = () => {
      elements.chatMessageInput.value += tile.textContent;
      elements.chatMessageInput.focus();
      elements.emojiPopover.classList.remove('open');
    };
  });

  document.addEventListener('click', (e) => {
    if (!elements.emojiPopover.contains(e.target) && e.target !== elements.btnToggleEmoji) {
      elements.emojiPopover.classList.remove('open');
    }
  });

  elements.btnAttachImage.onclick = () => elements.imageFileInput.click();
  elements.imageFileInput.onchange = handleImageUpload;

  elements.modalMedia.onclick = () => elements.modalMedia.classList.remove('open');

  elements.inboxSearchInput.addEventListener('input', renderConversationsList);

  let searchDebounce;
  elements.modalSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchUsers(e.target.value.trim());
    }, 250);
  });
  elements.btnCloseSearch.onclick = () => elements.modalSearch.classList.remove('open');

  elements.btnCloseProfile.onclick = () => elements.modalProfile.classList.remove('open');
  elements.formEditProfile.onsubmit = (e) => {
    e.preventDefault();
    saveProfile();
  };
  elements.profileEditAvatar.addEventListener('input', (e) => {
    elements.profileEditAvatarPreview.src = e.target.value;
  });
  elements.btnLogout.onclick = logout;

  elements.tabLogin.onclick = () => {
    elements.tabLogin.classList.add('active');
    elements.tabSignup.classList.remove('active');
    elements.formLogin.style.display = 'flex';
    elements.formSignup.style.display = 'none';
  };

  elements.tabSignup.onclick = () => {
    elements.tabSignup.classList.add('active');
    elements.tabLogin.classList.remove('active');
    elements.formSignup.style.display = 'flex';
    elements.formLogin.style.display = 'none';
  };

  elements.formLogin.onsubmit = (e) => {
    e.preventDefault();
    submitLogin();
  };

  elements.formSignup.onsubmit = (e) => {
    e.preventDefault();
    submitSignup();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      elements.modalSearch.classList.remove('open');
      elements.modalProfile.classList.remove('open');
      elements.modalMedia.classList.remove('open');
      elements.emojiPopover.classList.remove('open');
    }
  });
}

window.addEventListener('DOMContentLoaded', initApp);
