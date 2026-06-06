// ============================================
// firebase.js — Firebase Init
// https://masd.neocities.org/nexus/js/firebase.js
// ============================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbPf14myCS72bhHRIJ-h97U7dCSogPdpk",
  authDomain: "sahpathi-app.firebaseapp.com",
  projectId: "sahpathi-app",
  storageBucket: "sahpathi-app.firebasestorage.app",
  messagingSenderId: "410898338730",
  appId: "1:410898338730:web:2b10cc0053f64435b251d3"
};

(function initFirebase() {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }

  window.NX = window.NX || {};
  window.NX.auth    = firebase.auth();
  window.NX.db      = firebase.firestore();
  window.NX.storage = firebase.storage();
  window.NX.FieldVal = firebase.firestore.FieldValue;

  console.log('[Nexus] Firebase ready — project: sahpathi-app');
})();
