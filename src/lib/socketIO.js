// Create this file: backend/src/lib/socketIO.js
let ioInstance = null;

module.exports = {
  setIO: (io) => {
    ioInstance = io;
  },
  getIO: () => {
    if (!ioInstance) {
      throw new Error('Socket.IO not initialized');
    }
    return ioInstance;
  }
};