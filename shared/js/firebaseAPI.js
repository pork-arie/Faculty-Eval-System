// ============================================================
// SHARED FIREBASE CONFIG  (single source of truth)
// ------------------------------------------------------------
// Loaded by index.html and admin/dashboard.html so the config lives in ONE
// place. This is NOT a secret — a Firebase web apiKey is a public identifier.
// Real security comes from Firebase Auth + Firestore rules, not from hiding it.
// (Never put true secrets — server/service-account keys — in a file like this.)
// ============================================================
window.firebaseConfig = {
  apiKey: "AIzaSyCUD1waV1kPYFKj1zRA7ANVjQkhdP7NJic",
  authDomain: "studenteval-937f6.firebaseapp.com",
  projectId: "studenteval-937f6",
  storageBucket: "studenteval-937f6.firebasestorage.app",
  messagingSenderId: "899672493371",
  appId: "1:899672493371:web:600723b0d16bb879067b1e",
  measurementId: "G-D5WD5LB2E5"
};