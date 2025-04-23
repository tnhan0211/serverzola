const admin = require('firebase-admin');
require('dotenv').config();
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.DATABASE_URL,
});
const db = admin.database();
const auth = admin.auth();
const firestore = admin.firestore();

module.exports = {db, auth, firestore, admin};