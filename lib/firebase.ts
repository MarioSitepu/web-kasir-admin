import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC_q0wExPOIjnaQNeoVLOwo1ApVL7EKD-8",
  authDomain: "kasir-catat.firebaseapp.com",
  projectId: "kasir-catat",
  storageBucket: "kasir-catat.firebasestorage.app",
  messagingSenderId: "149045852572",
  appId: "1:149045852572:web:fcf5bdcd2c4a72a30f3059",
  databaseURL: "https://kasir-catat-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);

export { app, db };
