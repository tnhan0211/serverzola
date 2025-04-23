require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const friendRoutes = require('./routes/friend');
const privacyRoutes = require('./routes/privacy');
const activityRoutes = require('./routes/activity');
const { initSocket } = require('./config/socket');
const router = express.Router();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/activity', activityRoutes);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Khởi tạo Socket.IO
initSocket(server);

server.listen(PORT, () => console.log('Server listening on port', PORT));

module.exports = router;