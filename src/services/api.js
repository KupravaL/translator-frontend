import { useEffect } from 'react';
import axios from 'axios';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

// ✅ Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api', // Use environment variable if available
  headers: {
    'Content-Type': 'application/json',
  },
});

// Store the token for non-hook contexts
let authToken = null;

// ✅ Clerk Authentication Interceptor
export const useApiAuth = () => {
  const { getToken } = useClerkAuth();

  const registerAuthInterceptor = async () => {
    try {
      // Get and store the token
      const token = await getToken();
      console.log("Auth token obtained:", token ? "Valid token" : "No token");
      
      // Remove any existing interceptors to prevent duplicates
      api.interceptors.request.eject(0);
      
      // Add a new interceptor with better logging
      api.interceptors.request.use(async (config) => {
        try {
          // Get a fresh token each time
          const token = await getToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log(`Request to ${config.url}: Token attached`);
          } else {
            console.warn(`Request to ${config.url}: No auth token available`);
          }
        } catch (error) {
          console.error('Failed to retrieve authentication token:', error);
        }
        return config;
      });
    } catch (error) {
      console.error("Failed to register auth interceptor:", error);
    }
  };

  useEffect(() => {
    registerAuthInterceptor(); // ✅ Automatically registers the interceptor on mount
  }, []);

  return { registerAuthInterceptor };
};

// Function to get the most recent token (for use outside of React components)
const getAuthToken = () => {
  if (!authToken) {
    console.warn('No authentication token available. Make sure useApiAuth has been called.');
  }
  return authToken;
};

// ✅ Document Translation Service
export const documentService = {
  translateDocument: async (file, fromLang, toLang) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('from_lang', fromLang); // ✅ Ensure this matches the backend expectation
      formData.append('to_lang', toLang);

      const response = await api.post('/documents/translate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      console.error('Translation request failed:', error);
      throw error.response?.data?.error || 'Translation failed. Please try again.';
    }
  },

  exportToPdf: async (text, fileName) => {
    try {
      const response = await api.post('/export/pdf', { text, fileName });
      return response.data;
    } catch (error) {
      console.error('PDF export failed:', error);
      throw error.response?.data?.error || 'Export to PDF failed.';
    }
  },

  exportToDocx: async (text, fileName) => {
    try {
      const response = await api.post('/export/docx', { text, fileName });
      return response.data;
    } catch (error) {
      console.error('DOCX export failed:', error);
      throw error.response?.data?.error || 'Export to DOCX failed.';
    }
  },

  exportToDriveAsPdf: async (content, fileName, options = {}) => {
    try {
      const response = await api.post('/export/pdf', {
        text: content,
        fileName,
        saveToGoogleDrive: true,
        createFolder: options.createFolder || false,
        folderName: options.folderName || '',
        folderId: options.folderId || null
      });
      
      return response.data;
    } catch (error) {
      console.error('Export to Google Drive as PDF failed:', error);
      throw error;
    }
  },
  
  exportToDriveAsDocx: async (content, fileName, options = {}) => {
    try {
      const response = await api.post('/export/docx', {
        text: content,
        fileName,
        saveToGoogleDrive: true,
        folderId: options.folderId || null,
        createFolder: options.createFolder || false,
        folderName: options.folderName || '',
      });
      
      return response.data;
    } catch (error) {
      console.error('Export to Google Drive as DOCX failed:', error);
      throw error;
    }
  }
};

// ✅ Balance Service
export const balanceService = {
  getBalance: async () => {
    try {
      // First try the authenticated endpoint
      try {
        const response = await api.get('/balance/me/balance');
        return response.data;
      } catch (error) {
        // If we get a 403 Forbidden error, fall back to the public endpoint
        if (error.response && error.response.status === 403) {
          console.warn('Authentication failed, using public balance endpoint as fallback');
          
          // Call the public endpoint without user ID (safer)
          const publicResponse = await api.get('/balance/public/balance');
          return publicResponse.data;
        }
        
        // If it's not a 403 error, rethrow it
        throw error;
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      throw error.response?.data?.error || 'Could not retrieve balance.';
    }
  },

  addPages: async (pages) => {
    try {
      const response = await api.post('/balance/add-pages', { pages });
      return response.data;
    } catch (error) {
      console.error('Failed to add pages:', error);
      throw error.response?.data?.error || 'Failed to add translation pages.';
    }
  },
  
  // Method for purchasing pages
  purchasePages: async (pages, email) => {
    try {
      const response = await api.post('/balance/purchase/pages', { 
        pages, 
        email 
      });
      return response.data;
    } catch (error) {
      console.error('Failed to create payment:', error);
      throw error.response?.data?.error || 'Failed to process payment.';
    }
  }
};

// ✅ Export the API instance
export default api;