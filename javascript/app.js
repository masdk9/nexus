// ============================================
// app.js — Structure, Navigation, Theme, UI
// https://masd.neocities.org/nexus/js/app.js
// ============================================

(function() {
  // ── Theme ──
  function initTheme() {
    try {
      const t = localStorage.getItem('nx-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', t);
    } catch(e) {
      console.error("[APP.JS] initTheme() Error:", e.message);
    }
  }

  function setTheme(t) {
    try {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('nx-theme', t);
    } catch(e) {
      console.error("[APP.JS] setTheme() Error:", e.message);
    }
  }

  function toggleTheme() {
    try {
      const cur = localStorage.getItem('nx-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      setTheme(next);
    } catch(e) {
      console.error("[APP.JS] toggleTheme() Error:", e.message);
    }
  }

  function getTheme() {
    try {
      const t = localStorage.getItem('nx-theme') || 'dark';
      return t;
    } catch(e) {
      console.error("[APP.JS] getTheme() Error:", e.message);
    }
  }

  // ── Screen navigation ──
  const history = [];

  function goTo(id) {
    try {
      const cur = document.querySelector('.screen.active');
      if (cur) { cur.classList.remove('active'); history.push(cur.id); }
      const target = document.getElementById(id);
      if (!target) {
        return;
      }
      target.classList.add('active');
    } catch(e) {
      console.error("[APP.JS] goTo() Error:", e.message);
    }
  }

  function goBack() {
    try {
      if (!history.length) {
        return;
      }
      document.querySelector('.screen.active')?.classList.remove('active');
      const prevId = history.pop();
      const target = document.getElementById(prevId);
      if (!target) {
        return;
      }
      target.classList.add('active');
    } catch(e) {
      console.error("[APP.JS] goBack() Error:", e.message);
    }
  }

  function navTo(id) {
    try {
      history.length = 0;
      document.querySelector('.screen.active')?.classList.remove('active');
      const target = document.getElementById(id);
      if (!target) {
        return;
      }
      target.classList.add('active');
      updateNav(id);
    } catch(e) {
      console.error("[APP.JS] navTo() Error:", e.message);
    }
  }

  const NAV_MAP = {
    'scr-feed': 'nav-home', 'scr-notif': 'nav-notif',
    'scr-search': 'nav-search', 'scr-study': 'nav-study', 'scr-profile': 'nav-profile'
  };

  function updateNav(id) {
    try {
      document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));
      const navId = NAV_MAP[id];
      if (navId) {
        const navEl = document.getElementById(navId);
        if (navEl) {
          navEl.classList.add('active');
        }
      }
    } catch(e) {
      console.error("[APP.JS] updateNav() Error:", e.message);
    }
  }

  // ── Swipe nav ──
  function initSwipe() {
    try {
      const order = ['scr-feed','scr-notif','scr-search','scr-study','scr-profile'];
      let sx = 0, sy = 0;
      document.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      document.addEventListener('touchend', e => {
        const dx = sx - e.changedTouches[0].clientX;
        const dy = sy - e.changedTouches[0].clientY;
        if (Math.abs(dx) < 50 || Math.abs(dy) > 60) return;
        const cur = document.querySelector('.screen.active');
        if (!cur || !order.includes(cur.id)) return;
        const i = order.indexOf(cur.id);
        if (dx > 0 && i < order.length - 1) navTo(order[i + 1]);
        else if (dx < 0 && i > 0) navTo(order[i - 1]);
      }, { passive: true });
    } catch(e) {
      console.error("[APP.JS] initSwipe() Error:", e.message);
    }
  }

  // ── Loading overlay ──
  function showLoad(msg) {
    try {
      const el = document.getElementById('nx-loader');
      const tx = document.getElementById('nx-loader-txt');
      if (!el) {
        return;
      }
      if (tx) tx.textContent = msg || 'Please wait…';
      el.classList.add('show');
    } catch(e) {
      console.error("[APP.JS] showLoad() Error:", e.message);
    }
  }

  function hideLoad() {
    try {
      const el = document.getElementById('nx-loader');
      if (!el) {
        return;
      }
      el.classList.remove('show');
    } catch(e) {
      console.error("[APP.JS] hideLoad() Error:", e.message);
    }
  }

  function setLoadMsg(msg) {
    try {
      const el = document.getElementById('nx-loader-txt');
      if (!el) {
        return;
      }
      el.textContent = msg;
    } catch(e) {
      console.error("[APP.JS] setLoadMsg() Error:", e.message);
    }
  }

  // ── Toast ──
  let _tt;
  function toast(msg, ms) {
    try {
      const el = document.getElementById('nx-toast');
      if (!el) {
        return;
      }
      el.textContent = msg; el.classList.add('show');
      clearTimeout(_tt);
      _tt = setTimeout(() => el.classList.remove('show'), ms || 2500);
    } catch(e) {
      console.error("[APP.JS] toast() Error:", e.message);
    }
  }

  // ── Modal (bottom sheet) ──
  function openModal(id) {
    try {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      el.classList.add('show');
    } catch(e) {
      console.error("[APP.JS] openModal() Error:", e.message);
    }
  }

  function closeModal(id) {
    try {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      el.classList.remove('show');
    } catch(e) {
      console.error("[APP.JS] closeModal() Error:", e.message);
    }
  }

  // ── Error/input helpers ──
  function showErr(id, msg) {
    try {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      if (msg) el.textContent = msg;
      el.classList.add('show');
    } catch(e) {
      console.error("[APP.JS] showErr() Error:", e.message);
    }
  }

  function clearErr(id) {
    try {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      el.classList.remove('show');
    } catch(e) {
      console.error("[APP.JS] clearErr() Error:", e.message);
    }
  }

  // ── Password eye toggle ──
  function initPwEyes() {
    try {
      const btns = document.querySelectorAll('.pw-eye');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          const inp = document.getElementById(btn.dataset.for);
          if (!inp) {
            return;
          }
          inp.type = inp.type === 'password' ? 'text' : 'password';
          btn.innerHTML = inp.type === 'password'
            ? '<i class="bi bi-eye"></i>'
            : '<i class="bi bi-eye-slash"></i>';
        });
      });
    } catch(e) {
      console.error("[APP.JS] initPwEyes() Error:", e.message);
    }
  }

  // ── Password strength ──
  function pwStrength(val) {
    try {
      let s = 0;
      if (val.length >= 6) s++;
      if (val.length >= 10) s++;
      if (/[A-Z]/.test(val) && /[0-9!@#$%^&*]/.test(val)) s++;
      return s;
    } catch(e) {
      console.error("[APP.JS] pwStrength() Error:", e.message);
      return 0;
    }
  }

  function renderPwStrength(score, barIds, lblId) {
    try {
      const bars = barIds.map(id => document.getElementById(id));
      const lbl = document.getElementById(lblId);
      const wrap = bars[0]?.closest('.pw-strength');
      if (wrap) wrap.style.display = score ? 'flex' : 'none';
      bars.forEach(b => { if (b) b.className = 'str-bar'; });
      const map = [[],[0],[0,1],[0,1,2]];
      const cls = ['','weak','medium','strong'];
      const txt = ['','Weak','Medium','Strong'];
      (map[score]||[]).forEach(i => bars[i]?.classList.add(cls[score]||''));
      if (lbl) { lbl.className = 'str-lbl ' + (cls[score]||''); lbl.textContent = txt[score]||''; }
    } catch(e) {
      console.error("[APP.JS] renderPwStrength() Error:", e.message);
    }
  }

  // ── Format helpers ──
  function fmtNum(n) {
    try {
      n = Number(n) || 0;
      let result;
      if (n >= 1e6) result = (n/1e6).toFixed(1) + 'M';
      else if (n >= 1e3) result = (n/1e3).toFixed(1) + 'k';
      else result = String(n);
      return result;
    } catch(e) {
      console.error("[APP.JS] fmtNum() Error:", e.message);
      return '0';
    }
  }

  function fmtTime(ts) {
    try {
      if (!ts) {
        return '';
      }
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      const s = Math.floor((Date.now() - d) / 1000);
      let result;
      if (s < 60) result = 'Just now';
      else if (s < 3600) result = Math.floor(s/60) + 'm ago';
      else if (s < 86400) result = Math.floor(s/3600) + 'h ago';
      else if (s < 604800) result = Math.floor(s/86400) + 'd ago';
      else result = d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
      return result;
    } catch(e) {
      console.error("[APP.JS] fmtTime() Error:", e.message);
      return '';
    }
  }

  function initials(name) {
    try {
      if (!name) {
        return '?';
      }
      const result = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return result;
    } catch(e) {
      console.error("[APP.JS] initials() Error:", e.message);
      return '?';
    }
  }

  function esc(str) {
    try {
      const result = String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      return result;
    } catch(e) {
      console.error("[APP.JS] esc() Error:", e.message);
      return '';
    }
  }

  // ── Draft helpers ──
  function saveDraft(d) {
    try {
      const list = getDrafts();
      d.id = Date.now(); d.at = new Date().toISOString();
      list.unshift(d);
      localStorage.setItem('nx-drafts', JSON.stringify(list.slice(0, 20)));
      return d.id;
    } catch(e) {
      console.error("[APP.JS] saveDraft() Error:", e.message);
    }
  }

  function getDrafts() {
    try {
      const result = JSON.parse(localStorage.getItem('nx-drafts') || '[]');
      return result;
    } catch(e) {
      console.error("[APP.JS] getDrafts() Error:", e.message);
      return [];
    }
  }

  function delDraft(id) {
    try {
      const before = getDrafts().length;
      localStorage.setItem('nx-drafts', JSON.stringify(getDrafts().filter(d => d.id !== id)));
    } catch(e) {
      console.error("[APP.JS] delDraft() Error:", e.message);
    }
  }

  // ── Avatar component ──
  function avatarHTML(name, dp, size, cls) {
    try {
      size = size || 'md';
      let result;
      if (dp) result = `<img src="${esc(dp)}" class="av av-${size} ${cls||''}" alt="${esc(name)}">`;
      else result = `<div class="av av-${size} av-init ${cls||''}">${initials(name)}</div>`;
      return result;
    } catch(e) {
      console.error("[APP.JS] avatarHTML() Error:", e.message);
      return '';
    }
  }

  // Expose
  window.NX = window.NX || {};
  Object.assign(window.NX, {
    initTheme, setTheme, toggleTheme, getTheme,
    goTo, goBack, navTo, updateNav, initSwipe,
    showLoad, hideLoad, setLoadMsg,
    toast, openModal, closeModal,
    showErr, clearErr, initPwEyes,
    pwStrength, renderPwStrength,
    fmtNum, fmtTime, initials, esc,
    saveDraft, getDrafts, delDraft,
    avatarHTML
  });

  console.log('[Nexus] app.js ready');
})();
