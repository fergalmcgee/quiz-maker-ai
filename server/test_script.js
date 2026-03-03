const io = require('socket.io-client');
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to socket');
  socket.emit('join_session', { sessionId: 10, userId: 15, role: 'student' });
  
  setTimeout(() => {
    console.log('Emitting submit_answer_text');
    // Assuming quiz 5 questions got IDs 9 and 10 in the db due to auto-increment from previous tests
    socket.emit('submit_answer_text', { 
        sessionId: 10, 
        studentId: 15, 
        questionId: 9, 
        text: ' Wow ' 
    });
  }, 1000);

  setTimeout(() => {
    console.log('Done, exiting');
    process.exit(0);
  }, 3000);
});
