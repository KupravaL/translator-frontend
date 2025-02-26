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
  timeout: 60000, // 60 seconds timeout
  // Enable credentials for CORS
  withCredentials: true,
});

// Store the token and interceptor ID for non-hook contexts
let authToken = null;
let tokenExpiryTime = null;
let requestInterceptorId = null;

// Enhanced Clerk Authentication Hook with Token Refreshing
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
          // Check if we need a new token (if it's expired or not set)
          const now = Date.now();
          const tokenIsValid = authToken && tokenExpiryTime && now < tokenExpiryTime;
          
          if (!tokenIsValid) {
            // Get a fresh token with longer expiration
            const token = await getToken({ expiration: 60 * 60 }); // 1 hour expiration
            
            if (token) {
              // Store token and calculate expiry time (with 5 min buffer)
              authToken = token;
              tokenExpiryTime = now + (55 * 60 * 1000); // 55 minutes in ms
              console.log(`🔄 Token refreshed, valid for next 55 minutes`);
            } else {
              console.warn(`⚠️ No auth token available`);
            }
          }
          
          // Add the token to the request if available
          if (authToken) {
            config.headers.Authorization = `Bearer ${authToken}`;
          }
        } catch (error) {
          console.error('❌ Failed to retrieve authentication token:', error);
        }
        return config;
      });
      
      console.log('✅ Auth interceptor registered successfully');
      
      // Do an initial token fetch
      try {
        const token = await getToken({ expiration: 60 * 60 }); // 1 hour expiration
        if (token) {
          authToken = token;
          tokenExpiryTime = Date.now() + (55 * 60 * 1000); // 55 minutes
          console.log('✅ Initial token fetched successfully');
        }
      } catch (error) {
        console.error('❌ Failed to fetch initial token:', error);
      }
    } catch (error) {
      console.error("❌ Failed to register auth interceptor:", error);
    }
  };
  
  // Keep token refreshed in the background
  useEffect(() => {
    if (isSignedIn) {
      // Register the interceptor first
      registerAuthInterceptor();
      
      // Set up a background refresh every 50 minutes
      const refreshInterval = setInterval(async () => {
        try {
          const token = await getToken({ expiration: 60 * 60 }); // 1 hour
          if (token) {
            authToken = token;
            tokenExpiryTime = Date.now() + (55 * 60 * 1000);
            console.log('🔄 Background token refresh successful');
          }
        } catch (error) {
          console.error('❌ Background token refresh failed:', error);
        }
      }, 50 * 60 * 1000); // 50 minutes
      
      // Clean up interval
      return () => {
        clearInterval(refreshInterval);
        if (requestInterceptorId !== null) {
          api.interceptors.request.eject(requestInterceptorId);
          requestInterceptorId = null;
        }
      };
    }
  }, [isSignedIn]);

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

// Document Service with Improved Authentication Handling, Request Deduplication, and Timeout Handling
export const documentService = {
  // Store ongoing requests to prevent duplicates
  _activeRequests: new Map(),
  
  // Store processId -> status mapping to provide fallback information
  _lastKnownStatus: new Map(),
  
  // Helper function to handle authentication errors
  _handleAuthError: async (error, endpoint, retryCallback) => {
    if (error.response && error.response.status === 401) {
      console.warn(`⚠️ Authentication error for ${endpoint}, refreshing token and retrying...`);
      
      // Refresh token
      try {
        // Clear existing token to force refresh
        authToken = null;
        tokenExpiryTime = null;
        
        // Wait a moment for token refresh
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Retry the original request
        return await retryCallback();
      } catch (retryError) {
        console.error(`❌ Retry after token refresh failed for ${endpoint}:`, retryError);
        throw retryError;
      }
    }
    throw error;
  },

  // Method to create a fallback status based on last known state for a process ID
  _createFallbackStatus: (processId) => {
    const lastStatus = documentService._lastKnownStatus.get(processId);
    
    if (lastStatus) {
      // Include a timestamp to indicate this is a fallback status
      return {
        ...lastStatus,
        isFallback: true,
        timestamp: Date.now()
      };
    }
    
    // Default fallback if we have no previous status
    return {
      processId: processId,
      status: 'pending',
      progress: 0,
      currentPage: 0,
      totalPages: 0,
      isFallback: true,
      timestamp: Date.now()
    };
  },
  
  // Method to update the last known status for a process ID
  _updateLastKnownStatus: (processId, statusData) => {
    documentService._lastKnownStatus.set(processId, {
      ...statusData,
      timestamp: Date.now()
    });
  },
  
  initiateTranslation: async (formData) => {
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Initiating document translation...`);
    
    try {
      const response = await api.post('/documents/translate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Translation initiated in ${duration}ms, received processId: ${response.data.processId}`);
      
      // Initialize last known status
      if (response.data.processId) {
        documentService._updateLastKnownStatus(response.data.processId, {
          processId: response.data.processId,
          status: response.data.status || 'pending',
          progress: 0,
          currentPage: 0,
          totalPages: 0
        });
      }
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Translation initiation failed after ${duration}ms:`, error);
      
      // Handle authentication errors
      if (error.response && error.response.status === 401) {
        try {
          return await documentService._handleAuthError(
            error, 
            'translate', 
            () => documentService.initiateTranslation(formData)
          );
        } catch (retryError) {
          // If retry fails, continue with normal error handling
        }
      }
      
      // Enhanced error handling with specific error messages
      if (error.response) {
        if (error.response.status === 413) {
          throw new Error('File is too large. Maximum size is 20MB.');
        }
        
        if (error.response.data && error.response.data.error) {
          throw new Error(error.response.data.error);
        }
      }
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timed out. Please try again with a smaller file.');
      }
      
      throw new Error('Failed to initiate translation. Please try again later.');
    }
  },
  
  checkTranslationStatus: async (processId) => {
    // Deduplicate concurrent status checks for the same processId
    const requestKey = `status-${processId}`;
    
    // If there's already an active request for this processId, return its promise
    if (documentService._activeRequests.has(requestKey)) {
      console.log(`⏳ [${new Date().toISOString()}] Reusing existing status check for process: ${processId}`);
      return documentService._activeRequests.get(requestKey);
    }
    
    // Create an AbortController to handle timeouts
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout
    
    // Create a new request
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Checking translation status for process: ${processId}`);
    
    // Create the promise for this request
    const requestPromise = (async () => {
      try {
        const response = await api.get(`/documents/status/${processId}`, {
          signal: controller.signal,
          timeout: 8000 // Also set axios timeout
        });
        
        // Clear the timeout since the request completed
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        console.log(`✅ [${new Date().toISOString()}] Status check completed in ${duration}ms - Status: ${response.data.status}, Progress: ${response.data.progress}%`);
        
        // Update the last known status
        documentService._updateLastKnownStatus(processId, response.data);
        
        return response.data;
      } catch (error) {
        // Clear the timeout
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        
        // Handle timeout cases - both AbortController timeout and axios timeout
        if (
          error.name === 'AbortError' || 
          error.code === 'ECONNABORTED' || 
          error.message.includes('timeout') ||
          // Also treat 'pending' responses from Render.com as timeouts
          (error.response && error.response.status === 503)
        ) {
          console.log(`⏳ [${new Date().toISOString()}] Status check timed out or pending after ${duration}ms - providing fallback status`);
          
          // Return a fallback status from our cache or a default pending state
          return documentService._createFallbackStatus(processId);
        }
        
        // Handle authentication errors
        if (error.response && error.response.status === 401) {
          try {
            return await documentService._handleAuthError(
              error, 
              'status', 
              () => api.get(`/documents/status/${processId}`)
            ).then(response => {
              documentService._updateLastKnownStatus(processId, response.data);
              return response.data;
            });
          } catch (retryError) {
            // If auth retry fails, fall back to cached status
            console.log(`⚠️ Auth retry failed, using fallback status`);
            return documentService._createFallbackStatus(processId);
          }
        }
        
        console.error(`❌ [${new Date().toISOString()}] Status check failed after ${duration}ms:`, error);
        
        // For server errors, also use fallback status to keep UI working
        if (error.response && error.response.status >= 500) {
          console.log(`⚠️ Server error (${error.response.status}), using fallback status`);
          return documentService._createFallbackStatus(processId);
        }
        
        // For 404 errors, the translation might have been removed
        if (error.response && error.response.status === 404) {
          const errorData = {
            message: 'Translation process not found',
            statusCode: 404,
            shouldRetry: false
          };
          throw errorData;
        }
        
        // For other client errors, throw a structured error
        const errorData = {
          message: 'Failed to check translation status',
          statusCode: error.response?.status || 500,
          originalError: error.message,
          shouldRetry: true
        };
        
        throw errorData;
      } finally {
        // Remove this request from the active requests map
        documentService._activeRequests.delete(requestKey);
      }
    })();
    
    // Store the promise in the active requests map
    documentService._activeRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  },
  
  getTranslationResult: async (processId) => {
    // Deduplicate concurrent result fetches for the same processId
    const requestKey = `result-${processId}`;
    
    // If there's already an active request for this processId, return its promise
    if (documentService._activeRequests.has(requestKey)) {
      console.log(`⏳ [${new Date().toISOString()}] Reusing existing result fetch for process: ${processId}`);
      return documentService._activeRequests.get(requestKey);
    }
    
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout for results
    
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Fetching translation result for process: ${processId}`);
    
    // Create the promise for this request
    const requestPromise = (async () => {
      try {
        const response = await api.get(`/documents/result/${processId}`, {
          signal: controller.signal,
          timeout: 15000
        });
        
        // Clear timeout
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        console.log(`✅ [${new Date().toISOString()}] Translation result fetched successfully in ${duration}ms, content length: ${response.data.translatedText?.length || 0} chars`);
        
        // Update status to completed in our cache
        documentService._updateLastKnownStatus(processId, {
          processId: processId,
          status: 'completed',
          progress: 100,
          currentPage: response.data.metadata?.currentPage || 0,
          totalPages: response.data.metadata?.totalPages || 0
        });
        
        return response.data;
      } catch (error) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        console.error(`❌ [${new Date().toISOString()}] Result fetch failed after ${duration}ms:`, error);
        
        // Handle timeouts
        if (
          error.name === 'AbortError' || 
          error.code === 'ECONNABORTED' || 
          error.message.includes('timeout')
        ) {
          throw new Error('Request timed out while fetching translation results. The server might be busy processing a large document. Please try again in a moment.');
        }
        
        // Handle authentication errors
        if (error.response && error.response.status === 401) {
          try {
            return await documentService._handleAuthError(
              error, 
              'result', 
              () => api.get(`/documents/result/${processId}`)
            ).then(response => response.data);
          } catch (retryError) {
            // If retry fails, continue with normal error handling
          }
        }
        
        // Enhanced error handling with specific error messages
        if (error.response?.status === 404) {
          throw new Error('Translation not found. The process may have expired.');
        } else if (error.response?.status === 400) {
          throw new Error('Translation is not yet complete. Please wait until it finishes processing.');
        }
        
        throw new Error('Failed to fetch translation result. Please try again later.');
      } finally {
        // Remove this request from the active requests map
        documentService._activeRequests.delete(requestKey);
      }
    })();
    
    // Store the promise in the active requests map
    documentService._activeRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  },

  exportToPdf: async (text, fileName) => {
    console.log(`🔄 Exporting document to PDF: ${fileName}...`);
    try {
      const response = await api.post('/export/pdf', { text, fileName });
      console.log('✅ PDF exported successfully');
      return response.data;
    } catch (error) {
      console.error('❌ PDF export failed:', error);
      
      // Handle authentication errors
      if (error.response && error.response.status === 401) {
        try {
          return await documentService._handleAuthError(
            error, 
            'exportPdf', 
            () => api.post('/export/pdf', { text, fileName })
          ).then(response => response.data);
        } catch (retryError) {
          // If retry fails, continue with normal error handling
        }
      }
      
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
      
      // Handle authentication errors
      if (error.response && error.response.status === 401) {
        try {
          return await documentService._handleAuthError(
            error, 
            'exportDocx', 
            () => api.post('/export/docx', { text, fileName })
          ).then(response => response.data);
        } catch (retryError) {
          // If retry fails, continue with normal error handling
        }
      }
      
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