// ============================================
// feed.js — Posts, Feed, Likes, Comments, Views
// https://masd.neocities.org/nexus/js/feed.js
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

  // ── Cloudinary config ──
  const CLOUDINARY_CLOUD = 'ds2abgokx';
  const CLOUDINARY_PRESET_POSTS   = 'nexus_posts';
  const CLOUDINARY_PRESET_AVATARS = 'nexus_avatars';

  async function uploadToCloudinary(file, preset) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', preset);
    formData.append('cloud_name', CLOUDINARY_CLOUD);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`,
      { method: 'POST', body: formData }
    );

    if (!res.ok) throw new Error('Cloudinary upload failed: ' + res.status);
    const data = await res.json();
    return data.secure_url;
  }

  // Safe encode for inline onclick attributes — removes newlines and escapes quotes
  function encodeAttr(s) {
    if (!s) return '';
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ').replace(/"/g, '&quot;');
  }

  // ── Create post ──
  async function createPost(data) {
    const user = auth_module().currentUser();
    if (!user) throw new Error('Not logged in');
    const profile = await auth_module().getProfile(user.uid);

    let mediaUrl = '';
    if (data.type === 'media' && data.file) {
      mediaUrl = await uploadToCloudinary(data.file, CLOUDINARY_PRESET_POSTS);
    }

    const post = {
      type: data.type,
      authorId: user.uid,
      authorName: profile?.name || 'Unknown',
      authorHandle: profile?.handle || '00000',
      authorDp: profile?.dp || '',
      likes: 0, likedBy: [],
      comments: 0, shares: 0, views: 0,
      bookmarkedBy: [],
      reported: false,
      createdAt: FieldVal().serverTimestamp()
    };

    if (data.type === 'text')  { post.text = data.text; post.bgColor = data.bgColor || null; }
    if (data.type === 'media') { post.caption = data.caption || ''; post.mediaUrl = mediaUrl; post.mediaType = data.mediaType || 'image'; }
    if (data.type === 'mcq')   { post.question = data.question; post.options = data.options; post.correctIndex = data.correctIndex; post.explanation = data.explanation || ''; }
    if (data.type === 'tf')    { post.question = data.question; post.correctAnswer = data.correctAnswer; post.explanation = data.explanation || ''; }
    if (data.type === 'flash') { post.front = data.front; post.back = data.back; }

    const docRef = await db().collection('posts').add(post);
    await db().collection('users').doc(user.uid).update({ posts: FieldVal().increment(1) });
    return docRef.id;
  }

  // ── Listen Feed ──
  function listenFeed(cb) {
    return db().collection('posts')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .onSnapshot(snap => {
        const posts = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => !p.reported);
        cb(posts);
      }, err => console.error('[listenFeed]', err.message));
  }

  // ── Load User Posts ──
  async function loadUserPosts(uid) {
    try {
      const snap = await db().collection('posts').where('authorId', '==', uid).orderBy('createdAt', 'desc').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('[loadUserPosts]', e.message);
      return [];
    }
  }

  // ── Like ──
  async function likePost(postId, btn) {
    const user = auth_module().currentUser();
    if (!user) return window.NX.goTo('scr-auth');
    const ref = db().collection('posts').doc(postId);
    const ico = btn.querySelector('i');
    const span = btn.querySelector('span');
    let isLiked = ico.classList.contains('bi-heart-fill');
    isLiked = !isLiked;
    ico.className = isLiked ? 'bi bi-heart-fill' : 'bi bi-heart';
    ico.style.color = isLiked ? '#ef4444' : '';
    span.textContent = Math.max(0, parseInt(span.textContent || 0) + (isLiked ? 1 : -1));
    btn.classList.toggle('active', isLiked);
    try {
      await ref.update(isLiked
        ? { likes: FieldVal().increment(1), likedBy: FieldVal().arrayUnion(user.uid) }
        : { likes: FieldVal().increment(-1), likedBy: FieldVal().arrayRemove(user.uid) }
      );
    } catch (e) { console.error('[likePost]', e.message); }
  }

  // ── Bookmark ──
  async function bookmarkPost(postId, btn) {
    const user = auth_module().currentUser();
    if (!user) return;
    const ref = db().collection('posts').doc(postId);
    const ico = btn.querySelector('i');
    let isBookmarked = ico.classList.contains('bi-bookmark-fill');
    isBookmarked = !isBookmarked;
    ico.className = isBookmarked ? 'bi bi-bookmark-fill' : 'bi bi-bookmark';
    ico.style.color = isBookmarked ? 'var(--accent)' : '';
    try {
      await ref.update(isBookmarked
        ? { bookmarkedBy: FieldVal().arrayUnion(user.uid) }
        : { bookmarkedBy: FieldVal().arrayRemove(user.uid) }
      );
      toast(isBookmarked ? 'Saved to Bookmarks' : 'Removed from Bookmarks');
    } catch (e) { console.error('[bookmarkPost]', e.message); }
  }

  // ── Views — tap based, localStorage dedupe, skip own post ──
  function recordView(postId) {
    const user = auth_module().currentUser();
    if (!user) return;
    const el = document.getElementById('post-' + postId);
    if (!el) return;

    el.addEventListener('click', function onTap() {
      const myUid = user.uid;
      const postData = el.dataset.authorId;
      if (postData === myUid) return;

      const key = 'nx_viewed';
      let viewed = [];
      try { viewed = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
      if (viewed.includes(postId)) return;

      viewed.push(postId);
      try { localStorage.setItem(key, JSON.stringify(viewed)); } catch(e) {}

      db().collection('posts').doc(postId).update({ views: FieldVal().increment(1) }).catch(() => {});

      const viewSpan = el.querySelector('.post-views-count');
      if (viewSpan) viewSpan.textContent = parseInt(viewSpan.textContent || 0) + 1;

      el.removeEventListener('click', onTap);
    }, { once: false });
  }

  // ── Comments ──
  async function loadComments(postId) {
    try {
      const snap = await db().collection('posts').doc(postId)
        .collection('comments').orderBy('createdAt', 'asc').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {
      console.error('[loadComments]', e.message);
      return [];
    }
  }

  async function submitComment(postId, text) {
    const user = auth_module().currentUser();
    if (!user) return;
    const profile = await auth_module().getProfile(user.uid);
    const cmt = {
      authorId: user.uid,
      authorName: profile?.name || 'Unknown',
      authorHandle: profile?.handle || '00000',
      text: text.trim(),
      likes: 0, likedBy: [],
      createdAt: FieldVal().serverTimestamp()
    };
    await db().collection('posts').doc(postId).collection('comments').add(cmt);
    await db().collection('posts').doc(postId).update({ comments: FieldVal().increment(1) });
  }

  async function likeComment(postId, cmtId, btn) {
    const user = auth_module().currentUser();
    if (!user) return;
    const ref = db().collection('posts').doc(postId).collection('comments').doc(cmtId);
    const ico = btn.querySelector('i');
    let liked = ico.classList.contains('bi-heart-fill');
    liked = !liked;
    ico.className = liked ? 'bi bi-heart-fill' : 'bi bi-heart';
    ico.style.color = liked ? '#ef4444' : '';
    const span = btn.querySelector('span');
    if (span) span.textContent = Math.max(0, parseInt(span.textContent || 0) + (liked ? 1 : -1));
    try {
      await ref.update(liked
        ? { likes: FieldVal().increment(1), likedBy: FieldVal().arrayUnion(user.uid) }
        : { likes: FieldVal().increment(-1), likedBy: FieldVal().arrayRemove(user.uid) }
      );
    } catch(e) { console.error('[likeComment]', e.message); }
  }

  async function submitReply(postId, cmtId, text) {
    const user = auth_module().currentUser();
    if (!user) return;
    const profile = await auth_module().getProfile(user.uid);
    const reply = {
      authorId: user.uid,
      authorName: profile?.name || 'Unknown',
      authorHandle: profile?.handle || '00000',
      text: text.trim(),
      likes: 0, likedBy: [],
      createdAt: FieldVal().serverTimestamp()
    };
    await db().collection('posts').doc(postId)
      .collection('comments').doc(cmtId)
      .collection('replies').add(reply);
  }

  async function loadReplies(postId, cmtId) {
    try {
      const snap = await db().collection('posts').doc(postId)
        .collection('comments').doc(cmtId)
        .collection('replies').orderBy('createdAt', 'asc').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { return []; }
  }

  function toggleComments(postId) {
    const sec = document.getElementById('cmt-sec-' + postId);
    if (!sec) return;
    const isOpen = sec.style.display !== 'none';
    if (isOpen) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    renderComments(postId);
  }

  async function renderComments(postId) {
    const list = document.getElementById('cmt-list-' + postId);
    if (!list) return;
    list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">Loading...</div>';
    const cmts = await loadComments(postId);
    if (!cmts.length) {
      list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px 0">No comments yet. Be first!</div>';
      return;
    }
    list.innerHTML = cmts.map(c => renderCommentItem(postId, c)).join('');
  }

  function renderCommentItem(postId, c) {
    const ini = initials(c.authorName);
    return `
      <div class="cmt-item" id="cmt-${c.id}">
        <div class="av av-sm av-init" onclick="NX.openProfile('${c.authorId}')">${ini}</div>
        <div class="cmt-bubble">
          <span class="cmt-name" onclick="NX.openProfile('${c.authorId}')">${esc(c.authorName)}</span>
          <div class="cmt-text">${esc(c.text)}</div>
          <div class="cmt-acts">
            <button class="cmt-act" onclick="NX.feed.likeComment('${postId}','${c.id}',this)">
              <i class="bi bi-heart"></i><span>${c.likes || 0}</span>
            </button>
            <button class="cmt-act" onclick="NX.feed.toggleReply('${postId}','${c.id}')">
              <i class="bi bi-reply"></i> Reply
            </button>
            <span class="cmt-time">${fmtTime(c.createdAt)}</span>
          </div>
          <div class="reply-sec" id="reply-sec-${c.id}" style="display:none">
            <div class="reply-list" id="reply-list-${c.id}"></div>
            <div class="cmt-input-row">
              <input class="cmt-inp" id="reply-inp-${c.id}" placeholder="Write a reply…">
              <button class="cmt-send-btn" onclick="NX.feed.sendReply('${postId}','${c.id}')">
                <i class="bi bi-send-fill"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  async function toggleReply(postId, cmtId) {
    const sec = document.getElementById('reply-sec-' + cmtId);
    if (!sec) return;
    const isOpen = sec.style.display !== 'none';
    if (isOpen) { sec.style.display = 'none'; return; }
    sec.style.display = 'block';
    const list = document.getElementById('reply-list-' + cmtId);
    if (list) {
      const replies = await loadReplies(postId, cmtId);
      list.innerHTML = replies.map(r => `
        <div class="cmt-item" style="margin-top:6px">
          <div class="av av-sm av-init">${initials(r.authorName)}</div>
          <div class="cmt-bubble">
            <span class="cmt-name">${esc(r.authorName)}</span>
            <div class="cmt-text">${esc(r.text)}</div>
            <span class="cmt-time">${fmtTime(r.createdAt)}</span>
          </div>
        </div>`).join('') || '<div style="font-size:11px;color:var(--muted)">No replies yet</div>';
    }
  }

  async function sendComment(postId) {
    const inp = document.getElementById('cmt-inp-' + postId);
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    await submitComment(postId, text);
    renderComments(postId);
    const countEl = document.querySelector('#post-' + postId + ' .post-cmt-count');
    if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;
  }

  async function sendReply(postId, cmtId) {
    const inp = document.getElementById('reply-inp-' + cmtId);
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    await submitReply(postId, cmtId, text);
    toggleReply(postId, cmtId);
    setTimeout(() => toggleReply(postId, cmtId), 100);
  }

  // ── Report Question ──
  function openReportModal(postId) {
    window._reportPostId = postId;
    window.NX.openModal('modal-report-question');
  }

  async function submitReport(reason) {
    const postId = window._reportPostId;
    if (!postId) return;
    try {
      await db().collection('posts').doc(postId).update({
        reported: true,
        reportReason: reason,
        reportedAt: FieldVal().serverTimestamp()
      });
      const el = document.getElementById('post-' + postId);
      if (el) el.style.display = 'none';
      toast('Reported! This post will be reviewed.');
    } catch(e) {
      toast('Could not submit report. Try again.');
    }
    window.NX.closeModal('modal-report-question');
  }

  // ── Rendering ──
  function renderPost(p, myUid) {
    try {
      const isLiked = (p.likedBy || []).includes(myUid);
      const isSaved = (p.bookmarkedBy || []).includes(myUid);
      const ini = initials(p.authorName);

      let content = '';
      if (p.type === 'text') {
        content = (p.bgColor && p.text && p.text.length <= 300)
          ? `<div class="post-bg-text" style="background:${p.bgColor};color:${isLight(p.bgColor) ? '#111' : '#fff'}">${esc(p.text)}</div>`
          : `<div class="post-text">${esc(p.text)}</div>`;
      }
      else if (p.type === 'media') {
        const mediaEl = p.mediaType === 'video'
          ? `<video src="${p.mediaUrl}" class="post-media" controls></video>`
          : `<img src="${p.mediaUrl}" class="post-media" loading="lazy">`;
        content = (p.caption ? `<div class="post-text">${esc(p.caption)}</div>` : '') + mediaEl;
      }
      else if (p.type === 'mcq') {
        const expEncoded = encodeAttr(p.explanation || '');
        const optionsHTML = (p.options || []).map((opt, i) => `
          <div class="mcq-opt" onclick="NX.feed.ansMCQ(this,'${p.id}',${i},${p.correctIndex},'${expEncoded}')">
            <span class="mcq-opt-lbl">${['A','B','C','D'][i]}</span> ${esc(opt)}
          </div>`).join('');
        content = `
          <div class="post-text" style="font-weight:600;margin-bottom:8px">${esc(p.question)}</div>
          <div class="mcq-grid">${optionsHTML}</div>
          <div class="mcq-after" id="mcq-after-${p.id}" style="display:none">
            <button class="mcq-exp-btn" onclick="NX.feed.toggleExp('${p.id}')">
              <i class="bi bi-lightbulb"></i> See Explanation
            </button>
            <button class="mcq-report-btn" onclick="NX.feed.openReportModal('${p.id}')">
              <i class="bi bi-flag"></i> Report Question
            </button>
          </div>
          <div class="mcq-exp" id="exp-${p.id}" style="display:none"></div>`;
      }
      else if (p.type === 'tf') {
        const expEncoded = encodeAttr(p.explanation || '');
        const tfHTML = ['True','False'].map(opt => `
          <div class="tf-opt" onclick="NX.feed.ansTF(this,'${p.id}','${opt}','${p.correctAnswer}','${expEncoded}')">${opt}</div>`).join('');
        content = `
          <div class="post-text" style="font-weight:600;margin-bottom:8px">${esc(p.question)}</div>
          <div style="display:flex;gap:10px">${tfHTML}</div>
          <div class="mcq-after" id="mcq-after-${p.id}" style="display:none">
            <button class="mcq-exp-btn" onclick="NX.feed.toggleExp('${p.id}')">
              <i class="bi bi-lightbulb"></i> See Explanation
            </button>
            <button class="mcq-report-btn" onclick="NX.feed.openReportModal('${p.id}')">
              <i class="bi bi-flag"></i> Report Question
            </button>
          </div>
          <div class="mcq-exp" id="exp-${p.id}" style="display:none"></div>`;
      }
      else if (p.type === 'flash') {
        content = `
          <div class="flashcard" onclick="this.classList.toggle('flipped')">
            <div class="fc-inner">
              <div class="fc-front">
                <span class="fc-lbl">Question</span>
                <p>${esc(p.front)}</p>
                <span class="fc-hint"><i class="bi bi-arrow-repeat"></i> Tap to flip</span>
              </div>
              <div class="fc-back">
                <span class="fc-lbl">Answer</span>
                <p>${esc(p.back)}</p>
              </div>
            </div>
          </div>`;
      }

      // Check already viewed in localStorage
      let viewed = [];
      try { viewed = JSON.parse(localStorage.getItem('nx_viewed') || '[]'); } catch(e) {}
      const alreadyViewed = viewed.includes(p.id);

      return `
      <div class="post" id="post-${p.id}" data-author-id="${p.authorId}">
        <div class="post-header">
          <div class="post-av" onclick="NX.openProfile('${p.authorId}')">${window.NX.avatarHTML(p.authorName, p.authorDp, 'sm')}</div>
          <div class="post-meta" onclick="NX.openProfile('${p.authorId}')">
            <div class="post-author">${esc(p.authorName)}</div>
            <div class="post-time">#${p.authorHandle || '00000'} · ${fmtTime(p.createdAt)}</div>
          </div>
          <div class="post-opts" onclick="NX.feed.openPostMenu('${p.id}','${p.authorId}')"><i class="bi bi-three-dots"></i></div>
        </div>
        <div class="post-body">${content}</div>
        <div class="post-actions">
          <div class="post-act post-act-views">
            <i class="bi bi-eye"></i> <span class="post-views-count">${fmtNum(p.views || 0)}</span>
          </div>
          <div class="post-act ${isLiked ? 'active' : ''}" onclick="NX.feed.likePost('${p.id}',this)">
            <i class="bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'}" style="${isLiked ? 'color:#ef4444' : ''}"></i>
            <span>${fmtNum(p.likes)}</span>
          </div>
          <div class="post-act" onclick="NX.feed.toggleComments('${p.id}')">
            <i class="bi bi-chat-square-dots"></i> <span class="post-cmt-count">${fmtNum(p.comments)}</span>
          </div>
          <div class="post-act-right" onclick="NX.feed.bookmarkPost('${p.id}',this)">
            <i class="bi ${isSaved ? 'bi-bookmark-fill' : 'bi-bookmark'}" style="${isSaved ? 'color:var(--accent)' : ''}"></i>
          </div>
        </div>
        <div class="cmt-section" id="cmt-sec-${p.id}" style="display:none">
          <div class="cmt-list" id="cmt-list-${p.id}"></div>
          <div class="cmt-input-row">
            <input class="cmt-inp" id="cmt-inp-${p.id}" placeholder="Write a comment…"
              onkeydown="if(event.key==='Enter')NX.feed.sendComment('${p.id}')">
            <button class="cmt-send-btn" onclick="NX.feed.sendComment('${p.id}')">
              <i class="bi bi-send-fill"></i>
            </button>
          </div>
        </div>
      </div>`;
    } catch(err) {
      console.error('[renderPost] crash:', err.message);
      return `<div class="post" style="color:red;padding:12px">Post load failed: ${err.message}</div>`;
    }
  }

  // ── MCQ / TF logic ──
  function ansMCQ(el, id, sel, cor, exp) {
    if (el.parentNode.classList.contains('answered')) return;
    el.parentNode.classList.add('answered');
    el.parentNode.querySelectorAll('.mcq-opt').forEach((o, i) => {
      if (i === cor) o.classList.add('correct');
    });
    if (sel !== cor) el.classList.add('wrong');
    const after = document.getElementById('mcq-after-' + id);
    if (after) after.style.display = 'flex';
    if (exp) {
      const ed = document.getElementById('exp-' + id);
      if (ed) ed.dataset.exp = exp;
    }
  }

  function ansTF(el, id, sel, cor, exp) {
    if (el.parentNode.classList.contains('answered')) return;
    el.parentNode.classList.add('answered');
    el.parentNode.querySelectorAll('.tf-opt').forEach(o => {
      if (o.textContent.trim() === cor) o.classList.add('correct');
    });
    if (sel !== cor) el.classList.add('wrong');
    const after = document.getElementById('mcq-after-' + id);
    if (after) after.style.display = 'flex';
    if (exp) {
      const ed = document.getElementById('exp-' + id);
      if (ed) ed.dataset.exp = exp;
    }
  }

  function toggleExp(id) {
    const ed = document.getElementById('exp-' + id);
    if (!ed) return;
    if (ed.style.display !== 'none') { ed.style.display = 'none'; return; }
    ed.style.display = 'block';
    if (ed.dataset.exp) ed.innerHTML = '<b>Explanation:</b> ' + ed.dataset.exp;
    else ed.innerHTML = '<i>No explanation provided.</i>';
  }

  // ── Utils ──
  const BG_COLORS = ['#7f1d1d','#713f12','#064e3b','#1e3a8a','#581c87','#881337','#171717'];
  function getBgColors() { return BG_COLORS; }

  function isLight(color) {
    if (!color) return false;
    const hex = color.replace('#','');
    const r = parseInt(hex.substr(0,2),16);
    const g = parseInt(hex.substr(2,2),16);
    const b = parseInt(hex.substr(4,2),16);
    return ((r*299)+(g*587)+(b*114))/1000 > 155;
  }

  function sharePost(id) {
    try {
      navigator.clipboard?.writeText(location.origin + '/p/' + id);
      toast('Link copied to clipboard');
    } catch(e) { console.error('[sharePost]', e.message); }
  }

  // ── Post Menu ──
  let _activePost = null, _activeAuthor = null;

  function openPostMenu(postId, authorId) {
    _activePost = postId;
    _activeAuthor = authorId;
    const myUid = auth_module().currentUser()?.uid;
    const isMine = myUid === authorId;

    // Own post: show delete only, hide others
    document.getElementById('menu-delete').style.display  = isMine ? 'flex' : 'none';
    document.getElementById('menu-report').style.display  = isMine ? 'none' : 'flex';
    document.getElementById('menu-block').style.display   = isMine ? 'none' : 'flex';
    document.getElementById('menu-hide').style.display    = isMine ? 'none' : 'flex';
    document.getElementById('menu-follow').style.display  = isMine ? 'none' : 'flex';
    document.getElementById('menu-mute').style.display    = isMine ? 'none' : 'flex';

    window.NX.openModal('modal-post-menu');
  }

  function initMenuActions() {
    const el = (id, cb) => { const e = document.getElementById(id); if (e) e.onclick = cb; };

    el('menu-copy', () => { sharePost(_activePost); window.NX.closeModal('modal-post-menu'); });

    el('menu-share', () => {
      sharePost(_activePost);
      window.NX.closeModal('modal-post-menu');
    });

    el('menu-hide', () => {
      const p = document.getElementById('post-' + _activePost);
      if (p) p.style.display = 'none';
      window.NX.closeModal('modal-post-menu');
      toast('Post hidden');
    });

    el('menu-follow', async () => {
      if (_activeAuthor) {
        const f = await auth_module().toggleFollow(_activeAuthor);
        const lbl = document.getElementById('menu-follow-lbl');
        if (lbl) lbl.textContent = f ? 'Unfollow' : 'Follow';
        toast(f ? 'Following!' : 'Unfollowed');
      }
      window.NX.closeModal('modal-post-menu');
    });

    el('menu-mute', () => {
      toast('User muted');
      window.NX.closeModal('modal-post-menu');
    });

    el('menu-delete', async () => {
      if (!confirm('Delete this post?')) return;
      try {
        await db().collection('posts').doc(_activePost).delete();
        const p = document.getElementById('post-' + _activePost);
        if (p) p.remove();
        toast('Post deleted');
      } catch(e) { toast('Could not delete post'); }
      window.NX.closeModal('modal-post-menu');
    });

    el('menu-report', () => { toast('Post reported. Thank you!'); window.NX.closeModal('modal-post-menu'); });
    el('menu-block',  () => { toast('User blocked');              window.NX.closeModal('modal-post-menu'); });
    el('menu-cancel', () => { window.NX.closeModal('modal-post-menu'); });
  }

  // Expose
  window.NX = window.NX || {};
  window.NX.feed = {
    createPost, listenFeed, loadUserPosts,
    likePost, bookmarkPost, recordView,
    toggleComments, sendComment, sendReply,
    likeComment, toggleReply, renderComments,
    renderPost, ansMCQ, ansTF, toggleExp,
    getBgColors, isLight, sharePost,
    openPostMenu, initMenuActions,
    openReportModal, submitReport,
    uploadToCloudinary,
    CLOUDINARY_PRESET_POSTS,
    CLOUDINARY_PRESET_AVATARS
  };

  console.log('[Nexus] feed.js loaded');
})();
