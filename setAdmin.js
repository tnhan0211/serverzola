// setAdmin.js
const admin = require('firebase-admin');

const serviceAccount = require('F:/ReactProjects/hola-3f761-firebase-adminsdk-fbsvc-a0f9fd9bf4.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hola-3f761-default-rtdb.asia-southeast1.firebasedatabase.app/', 
});

const setAdmin = async (uid) => {
 try {
    await admin.auth().setCustomUserClaims(uid, {
        isAdmin: true,
        isSuperAdmin: false
        });
  console.log(`Successfully set admin claim for user ${uid}`);
 } catch (error) {
   console.error('Error setting custom claims:', error);
 }
}
//Nhớ thay YOUR_USER_ID bằng UID của user muốn set quyền
setAdmin("9i3cPhfYn5PnS1ppcqjbSQhfmfl1");