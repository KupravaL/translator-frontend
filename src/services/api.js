import { useEffect } from 'react';
import axios from 'axios';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

// Create axios instance with proper configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // Add timeout to prevent hanging requests
  timeout: 60000, // Increased from 30000 to 60000 ms
  // Enable credentials for CORS
  withCredentials: true,
});

// Store the token and interceptor ID for non-hook contexts
let authToken = null;
let requestInterceptorId = null;

// Enhanced Clerk Authentication Hook
export const useApiAuth = () => {
  const { getToken, isSignedIn } = useClerkAuth();
  
  const registerAuthInterceptor = async () => {
    try {
      // If an interceptor was already registered, remove it to prevent duplicates
      if (requestInterceptorId !== null) {
        api.interceptors.request.eject(requestInterceptorId);
        requestInterceptorId = null;
      }
      
      // Add a new interceptor with better token handling
      requestInterceptorId = api.interceptors.request.use(async (config) => {
        try {
          // Always get a fresh token for each request
          const token = await getToken();
          authToken = token; // Store for potential use outside hooks
          
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log(`🔐 Request to ${config.url}: Token attached`);
          } else {
            console.warn(`⚠️ Request to ${config.url}: No auth token available`);
          }
        } catch (error) {
          console.error('❌ Failed to retrieve authentication token:', error);
        }
        return config;
      });
      
      console.log('✅ Auth interceptor registered successfully');
    } catch (error) {
      console.error("❌ Failed to register auth interceptor:", error);
    }
  };

  // Register interceptor on mount and when auth state changes
  useEffect(() => {
    registerAuthInterceptor();
    
    // Return cleanup function
    return () => {
      if (requestInterceptorId !== null) {
        api.interceptors.request.eject(requestInterceptorId);
        requestInterceptorId = null;
      }
    };
  }, [isSignedIn]); // Re-register when sign-in state changes

  return { 
    registerAuthInterceptor
  };
};

// Enhanced Balance Service with better error handling
export const balanceService = {
  getBalance: async () => {
    try {
      console.log("🔄 Fetching user balance...");
      
      // First try the authenticated endpoint
      try {
        const response = await api.get('/balance/me/balance');
        console.log("✅ Balance fetched successfully:", response.data);
        return response.data;
      } catch (error) {
        // If we get an authentication error, try the debug endpoint
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          console.warn('⚠️ Authentication failed, trying debug endpoint');
          
          // Try the debug endpoint which has more verbose logging
          const debugResponse = await api.get('/balance/debug/balance');
          console.log('Debug balance response:', debugResponse.data);
          
          // If debug endpoint successfully authenticated, return that data
          if (debugResponse.data.authenticated && debugResponse.data.userId !== 'anonymous') {
            return {
              userId: debugResponse.data.userId,
              pagesBalance: debugResponse.data.pagesBalance,
              pagesUsed: debugResponse.data.pagesUsed,
              lastUsed: debugResponse.data.lastUsed
            };
          }
          
          // Otherwise, fall back to the public endpoint
          console.warn('⚠️ Debug endpoint not authenticated, using public balance endpoint');
          const publicResponse = await api.get('/balance/public/balance');
          return publicResponse.data;
        }
        
        // If it's not an auth error, rethrow it
        throw error;
      }
    } catch (error) {
      console.error('❌ Failed to fetch balance:', error);
      // Return a default balance instead of throwing to maintain UI functionality
      return {
        userId: 'anonymous',
        pagesBalance: 10,
        pagesUsed: 0,
        lastUsed: null
      };
    }
  },

  addPages: async (pages) => {
    console.log(`🔄 Adding ${pages} pages to balance...`);
    try {
      const response = await api.post('/balance/add-pages', { pages });
      console.log('✅ Pages added successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to add pages:', error);
      throw error.response?.data?.error || 'Failed to add translation pages.';
    }
  },
  
  purchasePages: async (pages, email) => {
    console.log(`🔄 Creating payment for ${pages} pages...`);
    try {
      const response = await api.post('/balance/purchase/pages', { 
        pages, 
        email 
      });
      console.log('✅ Payment created successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to create payment:', error);
      throw error.response?.data?.error || 'Failed to process payment.';
    }
  }
};

// Document Service with better logging
export const documentService = {
  initiateTranslation: async (formData) => {
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Initiating document translation...`);
    try {
      const response = await api.post('/documents/translate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Translation initiated in ${duration}ms, received processId: ${response.data.processId}`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Translation initiation failed after ${duration}ms:`, error);
      throw error;
    }
  },
  
  checkTranslationStatus: async (processId) => {
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Checking translation status for process: ${processId}`);
    try {
      const response = await api.get(`/documents/status/${processId}`);
      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Status check completed in ${duration}ms - Status: ${response.data.status}, Progress: ${response.data.progress}%`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Status check failed after ${duration}ms:`, error);
      if (error.code === 'ECONNABORTED') {
        console.error('Request timed out. The server might be processing a large document.');
      }
      throw error;
    }
  },
  
  getTranslationResult: async (processId) => {
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Fetching translation result for process: ${processId}`);
    try {
      const response = await api.get(`/documents/result/${processId}`);
      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Translation result fetched successfully in ${duration}ms, content length: ${response.data.translatedText?.length || 0} chars`);
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Result fetch failed after ${duration}ms:`, error);
      throw error;
    }
  },

  exportToPdf: async (text, fileName) => {
    console.log(`🔄 Exporting document to PDF: ${fileName}...`);
    try {
      const response = await api.post('/export/pdf', { text, fileName });
      console.log('✅ PDF exported successfully');
      return response.data;
    } catch (error) {
      console.error('❌ PDF export failed:', error);
      throw error.response?.data?.error || 'Export to PDF failed.';
    }
  },

  exportToDocx: async (text, fileName) => {
    console.log(`🔄 Exporting document to DOCX: ${fileName}...`);
    try {
      const response = await api.post('/export/docx', { text, fileName });
      console.log('✅ DOCX exported successfully');
      return response.data;
    } catch (error) {
      console.error('❌ DOCX export failed:', error);
      throw error.response?.data?.error || 'Export to DOCX failed.';
    }
  },

  exportToDriveAsPdf: async (content, fileName, options = {}) => {
    console.log(`🔄 Exporting to Google Drive as PDF: ${fileName}...`);
    try {
      const response = await api.post('/export/pdf', {
        text: content,
        fileName,
        saveToGoogleDrive: true,
        createFolder: options.createFolder || false,
        folderName: options.folderName || '',
        folderId: options.folderId || null
      });
      console.log('✅ PDF exported to Drive successfully');
      return response.data;
    } catch (error) {
      console.error('❌ Export to Google Drive as PDF failed:', error);
      throw error;
    }
  },
  
  exportToDriveAsDocx: async (content, fileName, options = {}) => {
    console.log(`🔄 Exporting to Google Drive as DOCX: ${fileName}...`);
    try {
      const response = await api.post('/export/docx', {
        text: content,
        fileName,
        saveToGoogleDrive: true,
        folderId: options.folderId || null,
        createFolder: options.createFolder || false,
        folderName: options.folderName || '',
      });
      console.log('✅ DOCX exported to Drive successfully');
      return response.data;
    } catch (error) {
      console.error('❌ Export to Google Drive as DOCX failed:', error);
      throw error;
    }
  }
};

// Export the API instance
export default api;