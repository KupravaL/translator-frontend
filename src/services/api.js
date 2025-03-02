import { useEffect, useCallback } from 'react';
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
let tokenIssuedAt = null;
let tokenLifespan = null;
let requestInterceptorId = null;
let responseInterceptorId = null;
let isRefreshing = false;
let refreshPromise = null;
let refreshCallbacks = [];

// Function to decode a JWT token without verifying signature
const decodeToken = (token) => {
  try {
    // Extract the payload part (second segment) of the JWT
    const payload = token.split('.')[1];
    // Decode base64url-encoded payload
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

// Function to log token information
const logTokenInfo = (token, source = "unknown") => {
  const decodedToken = decodeToken(token);
  if (!decodedToken) {
    console.error('Failed to decode token');
    return;
  }
  
  const now = Math.floor(Date.now() / 1000);
  const exp = decodedToken.exp;
  const iat = decodedToken.iat;
  
  if (!exp || !iat) {
    console.error('Token missing expiration or issued-at claims');
    return;
  }
  
  // Calculate token lifespan and remaining time
  const lifespan = exp - iat;
  const lifespanMinutes = Math.floor(lifespan / 60);
  
  const remaining = exp - now;
  const remainingMinutes = Math.floor(remaining / 60);
  const remainingSeconds = remaining % 60;
  
  // Format dates for logging
  const issuedDate = new Date(iat * 1000).toISOString();
  const expiryDate = new Date(exp * 1000).toISOString();
  
  // Save token info in global variables
  tokenIssuedAt = iat;
  tokenExpiryTime = exp;
  tokenLifespan = lifespan;
  
  // Create detailed log message
  const logMessage = `
🔐 TOKEN INFO (${source}):
  Issued at: ${issuedDate}
  Expires at: ${expiryDate}
  Total lifespan: ${lifespanMinutes} minutes (${lifespan} seconds)
  Remaining time: ${remainingMinutes}m ${remainingSeconds}s
  Subject: ${decodedToken.sub || 'N/A'}
  Issuer: ${decodedToken.iss || 'N/A'}
  Audience: ${decodedToken.aud || 'N/A'}
  `;
  
  // Log token info to console
  console.log(logMessage);
  
  // Store token diagnostic info in localStorage for debugging
  try {
    const tokenHistory = JSON.parse(localStorage.getItem('tokenHistory') || '[]');
    tokenHistory.push({
      timestamp: Date.now(),
      source,
      issuedAt: iat,
      expiresAt: exp,
      lifespan,
      remaining,
      sub: decodedToken.sub
    });
    
    // Keep only the last 10 entries
    while (tokenHistory.length > 10) {
      tokenHistory.shift();
    }
    
    localStorage.setItem('tokenHistory', JSON.stringify(tokenHistory));
  } catch (e) {
    console.warn('Failed to store token history:', e);
  }
  
  return {
    issuedAt: iat,
    expiresAt: exp,
    lifespan,
    remaining
  };
};

// Enhanced Clerk Authentication Hook with Token Refreshing
export const useApiAuth = () => {
  const { getToken, isSignedIn } = useClerkAuth();
  
  // Function to refresh the token
  const refreshToken = useCallback(async () => {
    // If already refreshing, return the existing promise
    if (isRefreshing) {
      return refreshPromise;
    }
    
    try {
      isRefreshing = true;
      console.log('🔄 Refreshing authentication token...');
      
      // Request a token with explicit expiration (1 hour)
      refreshPromise = getToken({ expiration: 60 * 60 }); 
      
      const token = await refreshPromise;
      
      if (token) {
        // Log detailed token information
        const tokenInfo = logTokenInfo(token, "refresh");
        
        // Store token and calculate expiry time (with 5 min buffer)
        authToken = token;
        if (tokenInfo) {
          tokenExpiryTime = Date.now() + ((tokenInfo.remaining - 300) * 1000); // 5 minute buffer
        }
        
        console.log(`🔄 Token refreshed, valid for next ${Math.floor((tokenExpiryTime - Date.now()) / 60000)} minutes`);
        
        // Call all queued callbacks with the new token
        refreshCallbacks.forEach(callback => callback(token));
        refreshCallbacks = [];
      } else {
        console.warn(`⚠️ No auth token available during refresh`);
      }
      
      return token;
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
      throw error;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }, [getToken]);
  
  // Function to get token diagnostics for debugging
  const getTokenDiagnostics = useCallback(async () => {
    try {
      // Get current token
      const token = authToken || await getToken({ expiration: 60 * 60 });
      if (!token) {
        return { error: 'No token available' };
      }
      
      // Decode and log token info
      const tokenInfo = logTokenInfo(token, "diagnostic");
      
      // Get token history from localStorage
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem('tokenHistory') || '[]');
      } catch (e) {
        console.warn('Failed to parse token history:', e);
      }
      
      return {
        currentToken: {
          issuedAt: new Date(tokenInfo.issuedAt * 1000).toISOString(),
          expiresAt: new Date(tokenInfo.expiresAt * 1000).toISOString(),
          lifespanMinutes: Math.floor(tokenInfo.lifespan / 60),
          remainingMinutes: Math.floor(tokenInfo.remaining / 60)
        },
        history: history,
        tokenState: {
          isRefreshing,
          callbacksWaiting: refreshCallbacks.length
        }
      };
    } catch (error) {
      console.error('Error getting token diagnostics:', error);
      return { error: String(error) };
    }
  }, [getToken]);
  
  const registerAuthInterceptor = useCallback(async () => {
    try {
      // If an interceptor was already registered, remove it to prevent duplicates
      if (requestInterceptorId !== null) {
        api.interceptors.request.eject(requestInterceptorId);
        requestInterceptorId = null;
      }
      
      if (responseInterceptorId !== null) {
        api.interceptors.response.eject(responseInterceptorId);
        responseInterceptorId = null;
      }
      
      // Add a new request interceptor with better token handling
      requestInterceptorId = api.interceptors.request.use(async (config) => {
        try {
          // Check if we need a new token (if it's expired or not set)
          const now = Date.now();
          const tokenIsValid = authToken && tokenExpiryTime && now < tokenExpiryTime;
          
          if (!tokenIsValid) {
            // Get a fresh token with longer expiration
            const token = await refreshToken();
            
            if (token) {
              // Token is set in refreshToken
              console.log(`🔑 New token applied to request: ${config.url}`);
            } else {
              console.warn(`⚠️ No auth token available for request: ${config.url}`);
            }
          } else {
            // If token is valid but getting close to expiry (within 10 minutes), refresh in background
            if (tokenExpiryTime && (tokenExpiryTime - now < 10 * 60 * 1000)) {
              console.log(`🔄 Token expiring soon (${Math.floor((tokenExpiryTime - now) / 60000)}m remaining), refreshing in background`);
              // Don't await - refresh in background
              refreshToken().catch(e => console.warn('Background token refresh failed:', e));
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
      
      // Add a response interceptor to handle token expiration
      responseInterceptorId = api.interceptors.response.use(
        response => {
          // Check for token expiration warning headers
          if (response.headers['x-token-expiring-soon'] === 'true') {
            console.log('⚠️ Token is expiring soon, refreshing...');
            refreshToken();
          }
          return response;
        },
        async error => {
          const originalRequest = error.config;
          
          // Only handle 401 errors for non-refresh requests
          if (error.response?.status === 401 && 
              error.response?.data?.tokenExpired && 
              !originalRequest._retry) {
            
            // Mark this request as retried
            originalRequest._retry = true;
            
            try {
              // If we're already refreshing, wait for that to complete
              let token;
              if (isRefreshing) {
                token = await new Promise((resolve) => {
                  refreshCallbacks.push(resolve);
                });
              } else {
                token = await refreshToken();
              }
              
              // Retry the original request with the new token
              if (token) {
                originalRequest.headers['Authorization'] = `Bearer ${token}`;
                return api(originalRequest);
              }
            } catch (refreshError) {
              console.error('❌ Token refresh failed during response handling:', refreshError);
            }
          }
          
          return Promise.reject(error);
        }
      );
      
      console.log('✅ Auth interceptor registered successfully');
      
      // Do an initial token fetch
      try {
        if (!authToken) {
          console.log('🔍 Fetching initial token...');
          // Request a token with explicit expiration (1 hour)
          const token = await getToken({ expiration: 60 * 60 });
          
          if (token) {
            // Log and store token info
            logTokenInfo(token, "initial");
            authToken = token;
            
            console.log('✅ Initial token fetched successfully');
          }
        }
      } catch (error) {
        console.error('❌ Failed to fetch initial token:', error);
      }
    } catch (error) {
      console.error("❌ Failed to register auth interceptor:", error);
    }
  }, [refreshToken, getToken]);
  
  // Keep token refreshed in the background
  useEffect(() => {
    if (isSignedIn) {
      // Register the interceptor first
      registerAuthInterceptor();
      
      // We'll declare a variable to store the interval ID
      let intervalId = null;
      
      // Set up background refresh
      const setupInterval = async () => {
        try {
          // Get initial token to determine lifespan
          const token = await getToken({ expiration: 60 * 60 });
          if (token) {
            const tokenInfo = logTokenInfo(token, "interval-setup");
            if (tokenInfo && tokenInfo.lifespan) {
              // Calculate refresh interval at 3/4 of token lifespan
              const refreshInterval = Math.floor(tokenInfo.lifespan * 0.75) * 1000;
              console.log(`🔄 Setting up background refresh every ${Math.floor(refreshInterval/60000)} minutes`);
              
              intervalId = setInterval(async () => {
                try {
                  await refreshToken();
                } catch (error) {
                  console.error('❌ Background token refresh failed:', error);
                }
              }, refreshInterval);
            }
          }
        } catch (error) {
          console.error('Failed to set up token refresh interval:', error);
          
          // Fallback to default 45 minute interval if we couldn't determine token lifespan
          intervalId = setInterval(async () => {
            try {
              await refreshToken();
            } catch (error) {
              console.error('❌ Background token refresh failed:', error);
            }
          }, 45 * 60 * 1000); // 45 minutes
        }
      };
      
      // Call the setup function
      setupInterval();
      
      // Return the cleanup function directly
      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
        
        if (requestInterceptorId !== null) {
          api.interceptors.request.eject(requestInterceptorId);
          requestInterceptorId = null;
        }
        if (responseInterceptorId !== null) {
          api.interceptors.response.eject(responseInterceptorId);
          responseInterceptorId = null;
        }
      };
    }
  }, [isSignedIn, registerAuthInterceptor, refreshToken, getToken]);
  
  return { 
    registerAuthInterceptor,
    refreshToken,
    getTokenDiagnostics
  };
};

// Enhanced Balance Service with better error handling and token expiration handling
export const balanceService = {
  // Store last valid balance for fallback
  _lastValidBalance: null,
  _lastFetchTime: null,
  
  getBalance: async () => {
    try {
      console.log("🔄 Fetching user balance...");
      
      // Check if we've fetched balance recently (within 10 seconds) and have a valid record
      const now = Date.now();
      if (balanceService._lastValidBalance && 
          balanceService._lastFetchTime && 
          (now - balanceService._lastFetchTime < 10000)) {
        console.log("📦 Using cached balance from recent fetch");
        return balanceService._lastValidBalance;
      }
      
      // First try the authenticated endpoint
      try {
        const response = await api.get('/balance/me/balance');
        console.log("✅ Balance fetched successfully:", response.data);
        
        // Update cache
        balanceService._lastValidBalance = response.data;
        balanceService._lastFetchTime = now;
        
        return response.data;
      } catch (error) {
        // If we get an authentication error, try the debug endpoint
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          console.warn('⚠️ Authentication failed, trying debug endpoint');
          
          // Check if the error indicates token expiration
          if (error.response.headers['x-token-expired'] === 'true' || 
              error.response.data?.tokenExpired === true) {
            console.warn('⚠️ Token expired, fall back to cache if available');
            // If we have a valid cached balance, use it while token refreshes in background
            if (balanceService._lastValidBalance) {
              return {
                ...balanceService._lastValidBalance,
                isFromCache: true
              };
            }
          }
          
          // Try the debug endpoint which has more verbose logging
          try {
            const debugResponse = await api.get('/balance/debug/balance');
            console.log('Debug balance response:', debugResponse.data);
            
            // If debug endpoint successfully authenticated, return that data
            if (debugResponse.data.authenticated && debugResponse.data.userId !== 'anonymous') {
              const balance = {
                userId: debugResponse.data.userId,
                pagesBalance: debugResponse.data.pagesBalance,
                pagesUsed: debugResponse.data.pagesUsed,
                lastUsed: debugResponse.data.lastUsed
              };
              
              // Update cache
              balanceService._lastValidBalance = balance;
              balanceService._lastFetchTime = now;
              
              return balance;
            }
          } catch (debugError) {
            console.warn('Debug endpoint failed:', debugError);
          }
          
          // Otherwise, fall back to the public endpoint
          console.warn('⚠️ Debug endpoint not authenticated, using public balance endpoint');
          try {
            const publicResponse = await api.get('/balance/public/balance');
            
            // Don't cache anonymous/public balance
            if (publicResponse.data.userId !== 'anonymous') {
              balanceService._lastValidBalance = publicResponse.data;
              balanceService._lastFetchTime = now;
            }
            
            return publicResponse.data;
          } catch (publicError) {
            console.warn('Public endpoint failed:', publicError);
            throw publicError;
          }
        }
        
        // If it's not an auth error, rethrow it
        throw error;
      }
    } catch (error) {
      console.error('❌ Failed to fetch balance:', error);
      
      // Return a cached balance if available, otherwise use default
      if (balanceService._lastValidBalance) {
        console.log('📦 Using cached balance after error');
        return {
          ...balanceService._lastValidBalance,
          isFromCache: true
        };
      }
      
      // Return a default balance instead of throwing to maintain UI functionality
      return {
        userId: 'anonymous',
        pagesBalance: 10,
        pagesUsed: 0,
        lastUsed: null,
        isDefault: true
      };
    }
  },
  
  addPages: async (pages) => {
    console.log(`🔄 Adding ${pages} pages to balance...`);
    try {
      const response = await api.post('/balance/add-pages', { pages });
      console.log('✅ Pages added successfully:', response.data);
      
      // Update cache to reflect new balance
      if (response.data.success && response.data.newBalance) {
        if (balanceService._lastValidBalance) {
          balanceService._lastValidBalance.pagesBalance = response.data.newBalance;
          balanceService._lastFetchTime = Date.now();
        }
      }
      
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
  },
  
  // Method to manually invalidate cache
  invalidateCache: () => {
    balanceService._lastValidBalance = null;
    balanceService._lastFetchTime = null;
    console.log('📦 Balance cache invalidated');
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
  

  // List active translations
  listActiveTranslations: async () => {
    try {
      console.log("🔄 Fetching active translations...");
      const response = await api.get('/documents/active');
      console.log("✅ Retrieved active translations:", response.data.translations.length);
      return response.data.translations;
    } catch (error) {
      console.error("❌ Failed to fetch active translations:", error);
      return [];
    }
  },

  // Find translation by file name
  findTranslationByFile: async (fileName) => {
    try {
      console.log(`🔄 Searching for translation of file: ${fileName}`);
      const response = await api.get(`/documents/find?file_name=${encodeURIComponent(fileName)}`);
      console.log("✅ Found translation:", response.data);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log("⚠️ No translation found for file:", fileName);
        return null;
      }
      console.error("❌ Error finding translation:", error);
      throw error;
    }
  },

  // Update the initiateTranslation method to handle timeouts better
  initiateTranslation: async (formData) => {
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Initiating document translation...`);
    
    // Extract file name for potential recovery
    const file = formData.get('file');
    const fileName = file ? file.name : 'unknown';
    console.log(`📄 Starting translation for file: ${fileName}`);
    
    try {
      const response = await api.post('/documents/translate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60 seconds
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Translation initiated in ${duration}ms, received processId: ${response.data.processId}`);
      
      // Store in local storage for recovery purposes
      try {
        const translationInfo = {
          processId: response.data.processId,
          fileName: fileName,
          timestamp: Date.now(),
          status: response.data.status || 'pending'
        };
        // Keep a history of recent translations for recovery
        const recentTranslations = JSON.parse(localStorage.getItem('recentTranslations') || '[]');
        recentTranslations.unshift(translationInfo); // Add to beginning
        // Keep only last 10
        if (recentTranslations.length > 10) {
          recentTranslations.pop();
        }
        localStorage.setItem('recentTranslations', JSON.stringify(recentTranslations));
        console.log("📦 Saved translation info to local storage for recovery");
      } catch (storageError) {
        console.warn("⚠️ Failed to save to local storage:", storageError);
      }
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Translation initiation failed after ${duration}ms:`, error);
      
      // For timeouts, try to recover immediately
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.log("⏳ Upload request timed out, but the server might still be processing it");
        
        // First try to find the translation using the backend API
        try {
          // Give the server a moment to create the record
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const foundTranslation = await documentService.findTranslationByFile(fileName);
          if (foundTranslation) {
            console.log("🔍 Found translation after timeout:", foundTranslation.processId);
            // Return the found translation
            return {
              success: true,
              message: "Translation process found after timeout",
              processId: foundTranslation.processId,
              status: foundTranslation.status,
              recoveredAfterTimeout: true
            };
          }
        } catch (recoveryError) {
          console.warn("⚠️ Failed to recover translation after timeout:", recoveryError);
        }
        
        throw new Error(
          'The server is taking longer than expected to respond. ' +
          'Your file might be processing in the background. ' +
          'You can try checking the status in a few moments.'
        );
      }
      
      throw error;
    }
  },
  
  checkTranslationStatus: async (processId) => {
    try {
      // Use a longer timeout for status checks
      const response = await api.get(`/documents/status/${processId}`, {
        timeout: 15000 // 15 seconds timeout
      });
      return response.data;
    } catch (error) {
      // For network errors or timeouts, don't immediately fail
      // Instead return a "pending" status to allow continued polling
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || !error.response) {
        console.warn(`Network issue while checking status for ${processId} - assuming still pending`);
        return {
          processId: processId,
          status: 'pending',
          progress: 0,
          currentPage: 0,
          totalPages: 0,
          isNetworkEstimate: true
        };
      }
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
  },

  getTranslationResult: async (processId, allowPartial = false) => {
    // Deduplicate concurrent result fetches for the same processId
    const requestKey = `result-${processId}-${allowPartial ? 'partial' : 'complete'}`;
    
    // If there's already an active request for this processId, return its promise
    if (documentService._activeRequests.has(requestKey)) {
      console.log(`⏳ [${new Date().toISOString()}] Reusing existing result fetch for process: ${processId}`);
      return documentService._activeRequests.get(requestKey);
    }
    
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout for results
    
    const startTime = Date.now();
    console.log(`🔄 [${new Date().toISOString()}] Fetching translation result for process: ${processId} (partial=${allowPartial})`);
    
    // Create the promise for this request
    const requestPromise = (async () => {
      try {
        const url = allowPartial 
          ? `documents/result/${processId}?partial=true` 
          : `documents/result/${processId}`;
        
        const response = await api.get(url, {
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
          status: allowPartial ? 'partial' : 'completed',
          progress: allowPartial ? Math.min(95, response.data.metadata?.progress || 0) : 100,
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
              () => api.get(allowPartial ? `documents/result/${processId}?partial=true` : `documents/result/${processId}`)
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
  }
};

// Add a global function for checking token info from browser console
window.checkTokenInfo = async () => {
  try {
    // Get token from Clerk
    const token = await window.Clerk.session.getToken({ expiration: 60 * 60 });
    return logTokenInfo(token, "manual-check");
  } catch (error) {
    console.error('Error checking token info:', error);
    return { error: String(error) };
  }
};

// Export the API instance
export default api;