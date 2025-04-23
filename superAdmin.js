// setSuperAdmin.js
const admin = require('firebase-admin');

const serviceAccount = require('F:/ReactProjects/hola-3f761-firebase-adminsdk-fbsvc-a0f9fd9bf4.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://hola-3f761-default-rtdb.asia-southeast1.firebasedatabase.app/', 
});

const setSuperAdmin = async (uid) => {
 try {
    await admin.auth().setCustomUserClaims(uid, {
        isAdmin: true,
        isSuperAdmin: true
        });
  console.log(`Successfully set super admin claim for user ${uid}`);
 } catch (error) {
   console.error('Error setting custom claims:', error);
 }
}
//Nhớ thay YOUR_USER_ID bằng UID của user muốn set quyền
setSuperAdmin("qtQrh3RuVzMZmgGbVGrCsHC0SGe2");