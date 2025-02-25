// Google Drive functionality temporarily disabled
const googleDriveService = {
  authenticate: async () => {
    console.log("Google Drive functionality is disabled");
    return Promise.reject(new Error("Google Drive functionality is disabled"));
  },

  checkAuthStatus: async () => {
    console.log("Google Drive functionality is disabled");
    return { authenticated: false, message: "Google Drive functionality is disabled" };
  },

  revokeAuth: async () => {
    console.log("Google Drive functionality is disabled");
    return Promise.reject(new Error("Google Drive functionality is disabled"));
  },

  listFolders: async () => {
    console.log("Google Drive functionality is disabled");
    return [];
  },

  createFolder: async () => {
    console.log("Google Drive functionality is disabled");
    return Promise.reject(new Error("Google Drive functionality is disabled"));
  },

  uploadFile: async () => {
    console.log("Google Drive functionality is disabled");
    return Promise.reject(new Error("Google Drive functionality is disabled"));
  },

  getFolder: async () => {
    console.log("Google Drive functionality is disabled");
    return Promise.reject(new Error("Google Drive functionality is disabled"));
  }
};

export default googleDriveService;