const { response } = require('express');
const {auth, db} = require('../config/firebase');
const jwt = require('jsonwebtoken');


const setAdminClaim = async(req, res)=>{
    try {
        const {uid, role, permissions, isSuperAdmin} = req.body;
        
        // Validate role
        if (!role || !['admin', 'user', 'super_admin'].includes(role)) {
            return res.status(400).json({ error: 'Role không hợp lệ. Role phải là "admin", "user" hoặc "super_admin"' });
        }

        // Kiểm tra user tồn tại
        try {
            await auth.getUser(uid);
        } catch (error) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
            
        }

        // Kiểm tra quyền của người thực hiện yêu cầu
        const authHeader = req.headers.authorization;
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);

        if (decodedToken.role !== 'super_admin') {
            return res.status(403).json({ error: 'Chỉ super_admin mới có quyền thiết lập role' });
        }

        // Create custom claims cho Firebase Auth
        const claims = {
            role: role,
            permissions: {
                users: {
                    create: permissions?.users?.create || false,
                    read: permissions?.users?.read || false,
                    update: permissions?.users?.update || false,
                    delete: permissions?.users?.delete || false,
                },
                post: {
                    delete: permissions?.posts?.delete || false,
                },
            },
            isSuperAdmin: role === 'super_admin' ? true : (isSuperAdmin || false),
        };

        // Set custom claims trong Firebase Auth
        await auth.setCustomUserClaims(uid, claims);

        // Cập nhật role trong Realtime Database
        const updates = {
            role: role,
            updated_at: new Date().toISOString(),
            permissions: claims.permissions,
            is_deleted: false
        };

        // Cập nhật trong database
        await db.ref(`users/${uid}`).update(updates);

        // Lấy thông tin user đã cập nhật để trả về
        const userSnapshot = await db.ref(`users/${uid}`).once('value');
        const userData = userSnapshot.val();

        res.status(200).json({
            message: 'Đã thiết lập quyền thành công',
            user: {
                uid,
                ...userData,
                claims
            }
        });

    } catch (error) {
        console.error('Lỗi khi thiết lập custom claim admin:', error);
        res.status(500).json({ error: 'Lỗi server khi thiết lập quyền' });
    }
};

//Lay tat ca danh sach nguoi dung(super admin role)
const getAllUsers = async(req, res)=>{
    try {
        //xac thuc nguoi dung
        const authHeader = req.headers.authorization;
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);
        if(decodedToken.role !== 'super_admin') {
            return res.status(403).json({error: 'Bạn không có quyền truy cập'});
        }
        const listUsersResult = await auth.listUsers(2000);
        const users = listUsersResult.users.map(userRecord => {
            return {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName,
            };
        });
        res.status(200).json({users});

    } catch (error) {
        console.log('Lỗi khi lấy danh sách người dùng!',error);
        res.status(500).json({error: 'Server error'});
    }
};

// Cập nhật trạng thái người dùng (active, inactive, suspended, banned)
const updateUserStatus = async (req, res) => {
  try {
    const { uid } = req.params;
    const { status } = req.body;
    const currentUser = req.user;

    // Kiểm tra quyền hạn - chỉ admin hoặc super_admin mới có thể thay đổi trạng thái
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Không có quyền thực hiện thao tác này' });
    }

    // Kiểm tra status hợp lệ
    const validStatuses = ['active', 'inactive', 'suspended', 'banned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Trạng thái không hợp lệ. Trạng thái phải là "active", "inactive", "suspended" hoặc "banned"' 
      });
    }

    // Kiểm tra user tồn tại
    try {
      await auth.getUser(uid);
    } catch (error) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Lấy thông tin user hiện tại
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng trong database' });
    }

    const userData = userSnapshot.val();

    // Nếu người dùng là super_admin, chỉ super_admin khác mới có thể thay đổi trạng thái
    if (userData.role === 'super_admin' && currentUser.role !== 'super_admin') {
      return res.status(403).json({ error: 'Không có quyền thay đổi trạng thái của super admin' });
    }

    // Cập nhật trạng thái trong database
    const updates = {
      status: status,
      updated_at: new Date().toISOString()
    };

    // Nếu status là banned hoặc suspended, vô hiệu hóa tài khoản trong Authentication
    if (status === 'banned' || status === 'suspended') {
      await auth.updateUser(uid, { disabled: true });
    } 
    // Nếu status là active hoặc inactive, kích hoạt lại tài khoản trong Authentication
    else {
      await auth.updateUser(uid, { disabled: false });
    }

    // Cập nhật trong database
    await db.ref(`users/${uid}`).update(updates);

    // Lấy thông tin user đã cập nhật để trả về
    const updatedUserSnapshot = await db.ref(`users/${uid}`).once('value');
    const updatedUserData = updatedUserSnapshot.val();

    res.status(200).json({
      message: 'Đã cập nhật trạng thái người dùng thành công',
      user: {
        uid,
        ...updatedUserData
      }
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái người dùng:', error);
    res.status(500).json({ error: 'Lỗi server khi cập nhật trạng thái người dùng' });
  }
};

// Xóa mềm người dùng
const softDeleteUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const currentUser = req.user;

    // Kiểm tra quyền hạn
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super_admin')) {
      return res.status(403).json({ error: 'Không có quyền thực hiện thao tác này' });
    }

    // Kiểm tra user tồn tại
    let targetUser;
    try {
      targetUser = await auth.getUser(uid);
    } catch (error) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Lấy thông tin user từ database
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng trong database' });
    }

    const userData = userSnapshot.val();

    // Kiểm tra quyền xóa
    if (userData.role === 'super_admin') {
      return res.status(403).json({ error: 'Không thể xóa tài khoản super admin' });
    }

    if (currentUser.role === 'admin' && userData.role === 'admin') {
      return res.status(403).json({ error: 'Admin không thể xóa tài khoản admin khác' });
    }

    // Thực hiện xóa mềm
    const updates = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: currentUser.uid,
      status: 'inactive'
    };

    // Vô hiệu hóa tài khoản trong Authentication
    await auth.updateUser(uid, { disabled: true });

    // Cập nhật trong database
    await db.ref(`users/${uid}`).update(updates);

    res.status(200).json({
      message: 'Đã xóa người dùng thành công',
      user: {
        uid,
        ...updates
      }
    });

  } catch (error) {
    console.error('Lỗi khi xóa người dùng:', error);
    res.status(500).json({ error: 'Lỗi server khi xóa người dùng' });
  }
};

// Tạo tài khoản admin nội bộ
const createInternalAdmin = async (req, res) => {
  try {
    // Kiểm tra quyền của người thực hiện yêu cầu
    const authHeader = req.headers.authorization;
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);

    if (decodedToken.role !== 'super_admin') {
      return res.status(403).json({ error: 'Chỉ super_admin mới có quyền tạo tài khoản admin nội bộ' });
    }

    const { email, password, first_name, last_name, permissions } = req.body;

    // Validate dữ liệu đầu vào
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        error: 'Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt' 
      });
    }

    // Kiểm tra email đã tồn tại
    const emailExists = await db.ref('users')
      .orderByChild('email')
      .equalTo(email)
      .once('value');

    if (emailExists.exists()) {
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    }

    // Tạo user trong Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${first_name} ${last_name}`,
    });

    // Thiết lập custom claims cho admin
    const claims = {
      role: 'admin',
      permissions: {
        users: {
          create: permissions?.users?.create || false,
          read: permissions?.users?.read || false,
          update: permissions?.users?.update || false,
          delete: permissions?.users?.delete || false,
        },
        posts: {
          delete: permissions?.posts?.delete || false,
        },
      },
      isSuperAdmin: false,
    };

    await auth.setCustomUserClaims(userRecord.uid, claims);

    // Lưu thông tin admin vào Realtime Database
    const adminData = {
      uid: userRecord.uid,
      email,
      first_name,
      last_name,
      role: 'admin',
      status: 'active',
      created_at: new Date().toISOString(),
      created_by: decodedToken.uid,
      permissions: claims.permissions,
      is_internal: true,
      is_deleted: false
    };

    await db.ref(`users/${userRecord.uid}`).set(adminData);

    res.status(201).json({
      message: 'Tạo tài khoản admin nội bộ thành công',
      admin: {
        uid: userRecord.uid,
        ...adminData,
        claims
      }
    });

  } catch (error) {
    console.error('Lỗi khi tạo tài khoản admin nội bộ:', error);
    res.status(500).json({ error: 'Lỗi server khi tạo tài khoản admin' });
  }
};

module.exports = {
  setAdminClaim,
  getAllUsers,
  updateUserStatus,
  softDeleteUser,
  createInternalAdmin
};