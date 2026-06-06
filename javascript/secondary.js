// ============================================
// secondary.js — Notifications, Search, DM, Study
// https://masd.neocities.org/nexus/js/secondary.js
// ============================================

(function() {
  const db = () => window.NX.db;
  const FieldVal = () => window.NX.FieldVal;
  const auth_module = () => window.NX.auth_module;
  const fmtNum = (n) => window.NX.fmtNum(n);
  const fmtTime = (t) => window.NX.fmtTime(t);
  const initials = (n) => window.NX.initials(n);
  const esc = (s) => window.NX.esc(s);
  const toast = (m) => window.NX.toast(m);

  // ── Notifications ──
  function listenNotifs(cb) {
    const uid = window.NX.auth_module.currentUser()?.uid;
    if (!uid) {
      console.warn('[secondary.js] listenNotifs: User login nahi hai');
      return () => {};
    }
    return window.NX.db.collection('notifications').where('toUid','==',uid).limit(40)
      .onSnapshot(snap => {
        const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        docs.sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
        cb(docs);
      });
  }

  async function markAllRead() {
    const uid = window.NX.auth_module.currentUser()?.uid;
    if (!uid) {
      console.warn('[secondary.js] markAllRead: User login nahi hai');
      return;
    }
    const snap = await window.NX.db.collection('notifications').where('toUid','==',uid).where('read','==',false).get();
    const batch = window.NX.db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  async function markRead(id) {
    await window.NX.db.collection('notifications').doc(id).update({ read: true });
  }

  function renderNotif(n) {
    const icons = {
      like:   { i:'bi-heart-fill',   c:'#ef4444' },
      comment:{ i:'bi-chat-fill',    c:'#6366f1' },
      follow: { i:'bi-person-plus-fill', c:'#22c55e' },
      reply:  { i:'bi-reply-fill',   c:'#f472b6' },
      official:{ i:'bi-megaphone-fill', c:'var(--accent)' }
    };
    const ic = icons[n.type] || icons.official;
    const msg = {
      like:    `liked your post`,
      comment: `commented: "${n.preview||''}"`,
      follow:  `started following you`,
      reply:   `replied to your comment`,
      official: n.message || 'sent a notification'
    };
    return `<div class="notif-item ${n.read?'':'unread'}" onclick="NX.secondary.markRead('${n.id}')">
      <div class="notif-av-wrap">
        <div class="av av-md av-init">${window.NX.initials(n.fromName||'N')}</div>
        <div class="notif-type-dot" style="background:${ic.c}"><i class="bi ${ic.i}"></i></div>
      </div>
      <div class="notif-info">
        <p class="notif-txt"><b>${window.NX.esc(n.fromName||'Nexus')}</b> ${msg[n.type]||''}</p>
        <span class="notif-time">${window.NX.fmtTime(n.createdAt)}</span>
      </div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`;
  }

  // ── Search ──
  async function searchUsers(term) {
    const snap = await window.NX.db.collection('users').limit(50).get();
    const results = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .filter(u => !term || u.name?.toLowerCase().includes(term.toLowerCase()) || u.handle?.includes(term))
      .slice(0, 20);
    return results;
  }

  async function searchPosts(term) {
    if (!term) {
      return [];
    }
    const snap = await window.NX.db.collection('posts').orderBy('createdAt','desc').limit(50).get();
    const t = term.toLowerCase();
    const results = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .filter(p => p.text?.toLowerCase().includes(t) || p.question?.toLowerCase().includes(t) || p.front?.toLowerCase().includes(t) || p.caption?.toLowerCase().includes(t))
      .slice(0, 20);
    return results;
  }

  function renderUserRow(u, myUid) {
    return `<div class="user-row" onclick="NX.openProfile('${u.uid||u.id}')">
      <div class="av av-md av-init">${window.NX.initials(u.name)}</div>
      <div class="user-row-info">
        <span class="user-row-name">${window.NX.esc(u.name)}</span>
        <span class="user-row-handle">#${u.handle||''} · ${window.NX.fmtNum(u.followers||0)} followers</span>
      </div>
      <button class="follow-btn" onclick="event.stopPropagation();NX.secondary.handleFollow('${u.uid||u.id}',this)">Follow</button>
    </div>`;
  }

  async function handleFollow(uid, btn) {
    const f = await window.NX.auth_module.toggleFollow(uid);
    btn.textContent = f ? 'Following' : 'Follow';
    btn.classList.toggle('following', f);
  }

  // ── DM ──
  async function getOrCreateChat(otherUid) {
    const uid = window.NX.auth_module.currentUser()?.uid;
    if (!uid) {
      console.warn('[secondary.js] getOrCreateChat: User login nahi hai');
      return null;
    }
    const chatId = [uid, otherUid].sort().join('_');
    const ref = window.NX.db.collection('chats').doc(chatId);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        participants: [uid, otherUid],
        createdAt: window.NX.FieldVal.serverTimestamp(),
        lastMessage: '', lastMessageAt: window.NX.FieldVal.serverTimestamp()
      });
    }
    return chatId;
  }

  function listenMessages(chatId, cb) {
    const unsub = window.NX.db.collection('chats').doc(chatId).collection('messages')
      .orderBy('createdAt','asc')
      .onSnapshot(snap => {
        cb(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      });
    return unsub;
  }

  async function sendMsg(chatId, text) {
    const user = window.NX.auth_module.currentUser();
    if (!user || !text.trim()) {
      console.warn('[secondary.js] sendMsg: User login nahi hai ya message khali hai');
      return;
    }
    const profile = await window.NX.auth_module.getProfile(user.uid);
    await window.NX.db.collection('chats').doc(chatId).collection('messages').add({
      senderId: user.uid, senderName: profile.name,
      text: text.trim(), createdAt: window.NX.FieldVal.serverTimestamp()
    });
    await window.NX.db.collection('chats').doc(chatId).update({
      lastMessage: text.trim(), lastMessageAt: window.NX.FieldVal.serverTimestamp()
    });
  }

  function listenInbox(cb) {
    const uid = window.NX.auth_module.currentUser()?.uid;
    if (!uid) {
      console.warn('[secondary.js] listenInbox: User login nahi hai');
      return () => {};
    }
    return window.NX.db.collection('chats').where('participants','array-contains',uid)
      .onSnapshot(snap => {
        const docs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        docs.sort((a,b) => (b.lastMessageAt?.toDate?.() || 0) - (a.lastMessageAt?.toDate?.() || 0));
        cb(docs);
      });
  }

  function renderMsg(m, myUid) {
    const mine = m.senderId === myUid;
    return `<div class="msg-row ${mine?'mine':''}">
      ${!mine ? `<div class="av av-sm av-init">${window.NX.initials(m.senderName)}</div>` : ''}
      <div class="msg-bubble ${mine?'mine':''}">
        <p>${window.NX.esc(m.text)}</p>
        <span class="msg-time">${window.NX.fmtTime(m.createdAt)}</span>
      </div>
    </div>`;
  }

  // ── Study updates ──
  async function loadUpdates(category) {
    let q = window.NX.db.collection('updates').limit(30);
    if (category && category !== 'all') q = window.NX.db.collection('updates').where('category','==',category).limit(30);
    const snap = await q.get();
    const results = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
    return results;
  }

  const CAT_ICONS = {
    SSC:'bi-building', Railway:'bi-train-front', Bank:'bi-bank',
    IAS:'bi-award', PCS:'bi-clipboard-check', Defence:'bi-shield',
    UPSC:'bi-mortarboard', Result:'bi-bar-chart', Job:'bi-briefcase',
    Admit:'bi-card-text', PYQ:'bi-journal-text', Exam:'bi-calendar-event'
  };

  function renderUpdate(u) {
    return `<div class="update-row" onclick="NX.secondary.openUpdate('${u.id}')">
      <div class="update-ico"><i class="bi ${CAT_ICONS[u.category]||'bi-megaphone'}"></i></div>
      <div class="update-info">
        <span class="update-title">${window.NX.esc(u.title)}</span>
        <span class="update-meta">${u.category||''} · ${window.NX.fmtTime(u.createdAt)}</span>
      </div>
      <i class="bi bi-chevron-right update-arr"></i>
    </div>`;
  }

  function openUpdate(id) {
    toast('Coming soon!');
  }

  // Expose
  window.NX.secondary = {
    listenNotifs, markAllRead, markRead, renderNotif,
    searchUsers, searchPosts, renderUserRow, handleFollow,
    getOrCreateChat, listenMessages, sendMsg, listenInbox, renderMsg,
    loadUpdates, renderUpdate, openUpdate
  };

  console.log('[Nexus] secondary.js ready');
})();
