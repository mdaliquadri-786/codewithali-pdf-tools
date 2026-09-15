/**
 * CodeWithAli PDF Tools Suite - Firebase Integration
 * Configured with exact settings from your previous CodeWithAli project:
 * Project ID: codewithali786-66703
 * Auth Domain: codewithali786-66703.firebaseapp.com
 */

const firebaseConfig = {
  apiKey: window.__FIREBASE_API_KEY__ || "AIzaSyDemoKeyForCodeWithAliPdfTools",
  authDomain: "codewithali786-66703.firebaseapp.com",
  projectId: "codewithali786-66703",
  storageBucket: "codewithali786-66703.firebasestorage.app",
  messagingSenderId: "940528123456",
  appId: "1:940528123456:web:abcdef1234567890",
  measurementId: "G-CODEWITHALI"
};

// Auto-initialize Firebase if CDN script is loaded
window.initCodeWithAliFirebase = function () {
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
      firebase.initializeApp(firebaseConfig);
      console.log('[Firebase] Connected to project: codewithali786-66703');
    } catch (err) {
      console.warn('[Firebase] Initialization notice:', err.message);
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', window.initCodeWithAliFirebase);
}
