// ============================================
// auth.js — Auth, Profile, Follow, Block, Report
// https://masd.neocities.org/nexus/js/auth.js
// ============================================

(function() {
  const auth = window.NX.auth;
  const db = window.NX.db;
  const storage = window.NX.storage;
  const FieldVal = window.NX.FieldVal;

  if (!auth)    console.error("[AUTH.JS] ❌ CRITICAL — window.NX.auth nahi mila! Firebase auth load hua?");
  if (!db)      console.error("[AUTH.JS] ❌ CRITICAL — window.NX.db nahi mila! Firestore load hua?");
  if (!storage) console.error("[AUTH.JS] ❌ CRITICAL — window.NX.storage nahi mila! Firebase storage load hua?");
  if (!FieldVal) console.error("[AUTH.JS] ❌ CRITICAL — window.NX.FieldVal nahi mila!");

  // ── Generate unique 5-digit handle ──
  async function generateHandle() {
    try {
      let handle, unique = false;
      let attempts = 0;
      while (!unique) {
        attempts++;
        handle = String(Math.floor(10000 + Math.random() * 89999));
        const snap = await db.collection('users').where('handle', '==', handle).limit(1).get();
        if (snap.empty) unique = true;
        if (attempts > 20) {
          throw new Error("Could not generate unique handle");
        }
      }
      return handle;
    } catch(e) {
      console.error("[AUTH.JS] generateHandle() Error:", e.message);
      throw e;
    }
  }

  // ── Signup ──
  async function signup({ name, email, dob, gender, password }) {
    try {
      const age = (new Date() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 16) {
        await new Promise(r => setTimeout(r, 2500));
        const e = new Error('Server error, please try again later');
        e.code = 'server/underage'; throw e;
      }
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      const handle = await generateHandle();
      await db.collection('users').doc(uid).set({
        uid, name, email, dob, gender, handle,
        bio: '', dp: '',
        followers: 0, following: 0, posts: 0,
        followingList: [], followersList: [],
        savedPosts: [], blockedList: [], mutedList: [],
        isPrivate: false, isVerified: false,
        createdAt: FieldVal.serverTimestamp()
      });
      return { user: cred.user, handle };
    } catch(e) {
      console.error("[AUTH.JS] signup() Error:", e.message);
      throw e;
    }
  }

  // ── Login ──
  async function login(email, password) {
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      return cred.user;
    } catch(e) {
      console.error("[AUTH.JS] login() Error:", e.message);
      throw e;
    }
  }

  // ── Logout ──
  async function logout() {
    try {
      await auth.signOut();
    } catch(e) {
      console.error("[AUTH.JS] logout() Error:", e.message);
      throw e;
    }
  }

  // ── Forgot password ──
  async function forgotPassword(email) {
    try {
      await auth.sendPasswordResetEmail(email);
    } catch(e) {
      console.error("[AUTH.JS] forgotPassword() Error:", e.message);
      throw e;
    }
  }

  // ── Get profile ──
  async function getProfile(uid) {
    try {
      if (!uid) {
        return null;
      }
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) {
        return null;
      }
      return { uid, ...snap.data() };
    } catch(e) {
      console.error("[AUTH.JS] getProfile() Error:", e.message);
      return null;
    }
  }

  // ── Update profile ──
  async function updateProfile(data) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return;
      }
      await db.collection('users').doc(uid).update(data);
    } catch(e) {
      console.error("[AUTH.JS] updateProfile() Error:", e.message);
      throw e;
    }
  }

  // ── Upload DP ──
  async function uploadDP(file) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid || !file) {
        return null;
      }
      const ref = storage.ref(`dp/${uid}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      return url;
    } catch(e) {
      console.error("[AUTH.JS] uploadDP() Error:", e.message);
      throw e;
    }
  }

  // ── Delete account ──
  async function deleteAccount() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return;
      }
      await db.collection('users').doc(uid).delete();
      await auth.currentUser.delete();
    } catch(e) {
      console.error("[AUTH.JS] deleteAccount() Error:", e.message);
      throw e;
    }
  }

  // ── Follow / Unfollow ──
  async function toggleFollow(targetUid) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid || uid === targetUid) {
        return false;
      }
      const myRef = db.collection('users').doc(uid);
      const snap  = await myRef.get();
      const list  = snap.data().followingList || [];
      const isFollowing = list.includes(targetUid);
      
      const batch = db.batch();
      batch.update(myRef, {
        following:     FieldVal.increment(isFollowing ? -1 : 1),
        followingList: isFollowing ? FieldVal.arrayRemove(targetUid) : FieldVal.arrayUnion(targetUid)
      });
      batch.update(db.collection('users').doc(targetUid), {
        followers:     FieldVal.increment(isFollowing ? -1 : 1),
        followersList: isFollowing ? FieldVal.arrayRemove(uid) : FieldVal.arrayUnion(uid)
      });
      await batch.commit();
      
      if (!isFollowing) {
        const me = snap.data();
        await addNotif(targetUid, { type: 'follow', fromUid: uid, fromName: me.name });
      }
      return !isFollowing;
    } catch(e) {
      console.error("[AUTH.JS] toggleFollow() Error:", e.message);
      throw e;
    }
  }

  async function checkFollowing(targetUid) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return false;
      }
      const snap = await db.collection('users').doc(uid).get();
      const result = (snap.data().followingList || []).includes(targetUid);
      return result;
    } catch(e) {
      console.error("[AUTH.JS] checkFollowing() Error:", e.message);
      return false;
    }
  }

  // ── Block ──
  async function blockUser(targetUid) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return;
      }
      await db.collection('users').doc(uid).update({ blockedList: FieldVal.arrayUnion(targetUid) });
    } catch(e) {
      console.error("[AUTH.JS] blockUser() Error:", e.message);
      throw e;
    }
  }

  // ── Mute ──
  async function muteUser(targetUid) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return;
      }
      await db.collection('users').doc(uid).update({ mutedList: FieldVal.arrayUnion(targetUid) });
    } catch(e) {
      console.error("[AUTH.JS] muteUser() Error:", e.message);
      throw e;
    }
  }

  // ── Report ──
  async function reportUser(targetUid, reason) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        return;
      }
      await db.collection('reports').add({
        reportedBy: uid, targetUid,
        reason: reason || 'Reported',
        createdAt: FieldVal.serverTimestamp()
      });
    } catch(e) {
      console.error("[AUTH.JS] reportUser() Error:", e.message);
      throw e;
    }
  }

  // ── Notification helper ──
  async function addNotif(toUid, data) {
    try {
      await db.collection('notifications').add({
        toUid, ...data, read: false,
        createdAt: FieldVal.serverTimestamp()
      });
    } catch(e) {
      console.error("[AUTH.JS] addNotif() Error:", e.message);
      throw e;
    }
  }

  // ── Auth state listener ──
  function onAuthChange(onIn, onOut) {
    try {
      auth.onAuthStateChanged(async user => {
        if (user) {
          const p = await getProfile(user.uid);
          onIn(user, p);
        } else {
          onOut();
        }
      });
    } catch(e) {
      console.error("[AUTH.JS] onAuthChange() Error:", e.message);
    }
  }

  // Expose
  window.NX.auth_module = {
    signup, login, logout, forgotPassword,
    getProfile, updateProfile, uploadDP, deleteAccount,
    toggleFollow, checkFollowing,
    blockUser, muteUser, reportUser,
    addNotif, onAuthChange,
    currentUser: () => auth.currentUser
  };

  console.log('[Nexus] auth.js ready');
})();
