// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAe-fdSaO-xBVJqfQDE7lX3dcOBxtVWvb0",
  authDomain: "super-la-muneca.firebaseapp.com",
  projectId: "super-la-muneca",
  storageBucket: "super-la-muneca.firebasestorage.app",
  messagingSenderId: "948158923581",
  appId: "1:948158923581:web:3d5a941e52dcb79f6b7b54",
  measurementId: "G-WQ6NT13NTR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);