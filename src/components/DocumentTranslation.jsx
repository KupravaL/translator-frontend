import { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Check, FileText, Download, Languages, Loader2, X, RefreshCw } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { useApiAuth } from '../services/api';
import { documentService } from '../services/api';
import DocumentsUpload from '../components/DocumentsUpload';
import DocumentDownloadButton from '../components/DocumentDownloadButton';
import BalanceDisplay from '../components/BalanceDisplay';
import GoogleDriveButton from '../components/GoogleDriveButton';

export default function DocumentTranslationPage() {
  const { user, isLoaded } = useUser();
  const { registerAuthInterceptor, refreshToken } = useApiAuth(); // Updated to include refreshToken
  const contentRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const pollAttemptRef = useRef(0);
  const lastStatusRef = useRef(null);
  const statusUpdateIntervalRef = useRef(null);
  const forcedProgressRef = useRef(null);
  const [processStartTime, setProcessStartTime] = useState(null);
  
  const getProcessRuntime = useCallback(() => {
    if (!processStartTime) return 0;
    return Math.floor((Date.now() - processStartTime) / 1000);
  }, [processStartTime]);

  // Keep track of status check issues
  const [consecFailures, setConsecFailures] = useState(0);
  const [lastFallbackStatus, setLastFallbackStatus] = useState(false);
  const [statusCheckStalled, setStatusCheckStalled] = useState(false);
  
  // For UI updates showing time since last status update
  const [timeCounter, setTimeCounter] = useState(0);
  
  // Add simulated progress for stalled status checks
  const [simulatedProgress, setSimulatedProgress] = useState({
    active: false,
    value: 0,
    page: 0,
    total: 0
  });
  
  const [translationStatus, setTranslationStatus] = useState({
    isLoading: false,
    progress: 0,
    status: null, // 'pending', 'in_progress', 'completed', 'failed'
    error: null,
    translatedText: null,
    fileName: null,
    direction: 'ltr',
    processId: null,
    currentPage: 0,
    totalPages: 0,
    lastStatusUpdate: null
  });

  const [isCopied, setIsCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const ensureValidToken = useCallback(async () => {
    try {
      await refreshToken();
      // Invalidate balance cache to get fresh data after token refresh
      balanceService.invalidateCache();
    } catch (error) {
      console.error('Failed to refresh token:', error);
      // Continue anyway - the interceptors will handle auth errors
    }
  }, [refreshToken]);

  // Register auth interceptor on mount
  useEffect(() => {
    registerAuthInterceptor();
  }, [registerAuthInterceptor]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (statusCheckTimeoutRef.current) {
        clearTimeout(statusCheckTimeoutRef.current);
      }
      if (statusUpdateIntervalRef.current) {
        clearInterval(statusUpdateIntervalRef.current);
      }
      if (forcedProgressRef.current) {
        clearInterval(forcedProgressRef.current);
      }
    };
  }, []);
  
  // Effect to update the time counter for UI display of "last updated X seconds ago"
  useEffect(() => {
    // Clear any existing interval
    if (statusUpdateIntervalRef.current) {
      clearInterval(statusUpdateIntervalRef.current);
    }
    
    // Only run the counter when translation is actively loading
    if (translationStatus.isLoading && translationStatus.lastStatusUpdate) {
      // Set initial value
      setTimeCounter(Math.floor((Date.now() - translationStatus.lastStatusUpdate) / 1000));
      
      // Update every second
      statusUpdateIntervalRef.current = setInterval(() => {
        const secondsElapsed = Math.floor((Date.now() - translationStatus.lastStatusUpdate) / 1000);
        setTimeCounter(secondsElapsed);
        
        // If we've gone too long without a status update, flag it as stalled
        if (secondsElapsed > 30) {
          setStatusCheckStalled(true);
          
          // Start simulated progress if actual progress is stuck at 0
          if (translationStatus.progress === 0 && !simulatedProgress.active) {
            startSimulatedProgress();
          }
        }
      }, 1000);
    } else {
      setStatusCheckStalled(false);
      // Stop simulated progress when translation stops loading
      setSimulatedProgress({
        active: false,
        value: 0,
        page: 0,
        total: 0
      });
      
      if (forcedProgressRef.current) {
        clearInterval(forcedProgressRef.current);
        forcedProgressRef.current = null;
      }
    }
    
    return () => {
      if (statusUpdateIntervalRef.current) {
        clearInterval(statusUpdateIntervalRef.current);
      }
    };
  }, [translationStatus.isLoading, translationStatus.lastStatusUpdate, translationStatus.progress]);

  // Function to simulate progress when status check is stalled
  const startSimulatedProgress = useCallback(() => {
    if (forcedProgressRef.current) {
      clearInterval(forcedProgressRef.current);
    }
    
    // Start with small progress value
    setSimulatedProgress({
      active: true,
      value: 5,
      page: 1,
      // Estimate total pages based on file type or default to 5
      total: translationStatus.fileName?.toLowerCase().endsWith('.pdf') ? 5 : 1
    });
    
    // Slowly increase progress to show that something is happening
    forcedProgressRef.current = setInterval(() => {
      setSimulatedProgress(prev => {
        // Don't go beyond 90% with simulated progress
        if (prev.value >= 90) {
          return prev;
        }
        
        // Calculate next page if needed
        let nextPage = prev.page;
        if (prev.value > prev.page * (100 / prev.total)) {
          nextPage = Math.min(prev.page + 1, prev.total);
        }
        
        return {
          ...prev,
          value: Math.min(prev.value + 1, 90),
          page: nextPage
        };
      });
    }, 3000); // Increase every 3 seconds
    
    return () => {
      if (forcedProgressRef.current) {
        clearInterval(forcedProgressRef.current);
        forcedProgressRef.current = null;
      }
    };
  }, [translationStatus.fileName]);

  // Helper function to determine polling interval based on current state
  const getPollInterval = useCallback(() => {
    const { status, progress } = translationStatus;
    const failures = consecFailures;
    const isStalled = statusCheckStalled;
    
    // Base timing parameters
    let baseInterval = 2000; // 2 seconds default
    
    // If status checks are stalled, adjust polling strategy
    if (isStalled) {
      // More aggressive polling when stalled
      baseInterval = 1500;
    } else {
      // Adjust based on translation status
      if (status === 'pending') {
        baseInterval = 1500; // 1.5 seconds for pending
      } else if (status === 'in_progress') {
        // For in_progress, use more frequent polling during early stages
        // and less frequent polling during later stages
        if (progress < 25) {
          baseInterval = 2000; // 2 seconds for early stages
        } else if (progress < 75) {
          baseInterval = 3000; // 3 seconds for middle stages
        } else {
          baseInterval = 4000; // 4 seconds for later stages
        }
      }
    }
    
    // Add jitter to prevent synchronized requests
    // This adds a random amount between -500ms and +500ms
    const jitter = Math.floor(Math.random() * 1000) - 500;
    
    // Apply backoff for consecutive failures
    // Using exponential backoff with a cap
    const maxBackoff = 15000; // 15 seconds maximum
    const failureBackoff = failures > 0 ? Math.min(Math.pow(1.5, failures) * 1000, maxBackoff) : 0;
    
    // Combine base interval, jitter, and backoff
    const finalInterval = Math.max(1000, baseInterval + jitter + failureBackoff);
    
    console.log(`📊 Poll timing: base=${baseInterval}ms, jitter=${jitter}ms, backoff=${failureBackoff}ms, final=${finalInterval}ms`);
    
    return finalInterval;
  }, [translationStatus, consecFailures, statusCheckStalled]);

  // Polling function with better error handling and support for stalled status
  const pollTranslationStatus = useCallback(async () => {
    const { processId, isLoading } = translationStatus;
    
    // Only poll if we have a process ID and it's still loading
    if (!processId || !isLoading) {
      return;
    }
    
    // Log which attempt this is
    pollAttemptRef.current += 1;
    console.log(`🔄 Polling attempt #${pollAttemptRef.current} for process: ${processId}`);
    
    try {
      const statusData = await documentService.checkTranslationStatus(processId);
      
      // Reset consecutive failures on success
      setConsecFailures(0);
      
      // Update status in state
      setTranslationStatus(prev => ({
        ...prev,
        progress: statusData.progress,
        status: statusData.status,
        currentPage: statusData.currentPage,
        totalPages: statusData.totalPages,
        lastStatusUpdate: Date.now()
      }));
      
      // Check if translation completed or failed
      if (statusData.status === 'completed') {
        console.log('✅ Translation completed, fetching results');
        fetchTranslationResults(processId);
      } else if (statusData.status === 'failed') {
        console.error('❌ Translation failed according to status');
        setTranslationStatus(prev => ({
          ...prev,
          isLoading: false,
          error: 'Translation failed. Please try again.',
          status: 'failed'
        }));
      } else {
        // Continue polling if still in progress
        const pollInterval = getPollInterval();
        statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, pollInterval);
      }
    } catch (error) {
      console.error('🚨 Status check error:', error);
      
      // Increase consecutive failures
      setConsecFailures(prev => prev + 1);
      
      // Don't give up too easily - continue polling with exponential backoff
      // Only stop polling after a very high number of consecutive failures
      if (consecFailures > 20) {
        console.error('🚨 Too many consecutive failures, giving up');
        setTranslationStatus(prev => ({
          ...prev,
          isLoading: false,
          error: 'Lost connection to the server. The translation may still be processing in the background.',
          status: 'timeout', // Use timeout status instead of failed
          processId: processId // Keep the process ID for potential recovery
        }));
        
        toast.warning('Lost connection to the server. Your document might still be processing in the background.', {
          duration: 5000
        });
        return;
      }
      
      // Continue polling after a delay with exponential backoff
      const backoffTime = Math.min(2000 * Math.pow(1.5, consecFailures), 30000); // Up to 30 seconds
      console.log(`🔄 Scheduling retry poll in ${backoffTime}ms after error`);
      statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, backoffTime);
    }
  }, [translationStatus, consecFailures, getPollInterval]);
  

  useEffect(() => {
    if (translationStatus.processId && translationStatus.isLoading) {
      console.log("Starting polling for process ID:", translationStatus.processId);
      
      // Reset polling attempt counter
      pollAttemptRef.current = 0;
      
      // Start polling immediately
      pollTranslationStatus();
      
      return () => {
        if (statusCheckTimeoutRef.current) {
          clearTimeout(statusCheckTimeoutRef.current);
        }
      };
    } else {
      console.log("Not starting polling. processId:", translationStatus.processId, "isLoading:", translationStatus.isLoading);
    }
  }, [translationStatus.processId, translationStatus.isLoading]);
  
  // Effect to detect completely stuck translations
  useEffect(() => {
    if (!translationStatus.isLoading || !translationStatus.lastStatusUpdate) {
      return;
    }
    
    // Check if we've gone too long without a status update
    const checkStuckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - translationStatus.lastStatusUpdate;
      
      // If we haven't had a status update in 3 minutes, consider it stuck
      if (timeSinceLastUpdate > 3 * 60 * 1000) {
        console.warn(`⚠️ Translation might be completely stuck - no updates for ${Math.floor(timeSinceLastUpdate/1000)}s`);
        
        // If polling is also stuck, restart it
        if (statusCheckTimeoutRef.current) {
          clearTimeout(statusCheckTimeoutRef.current);
          statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, 1000);
        }
        
        // Notify user after 3 minutes of no updates
        toast.warning("The translation has been running for a while without updates. You can cancel and try again if needed.", {
          id: "translation-stuck",
          duration: 10000
        });
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(checkStuckInterval);
  }, [translationStatus.isLoading, translationStatus.lastStatusUpdate, pollTranslationStatus]);

// Improved onTranslate function with better timeout handling
  const onTranslate = async (file, fromLang, toLang) => {
    if (!file) {
      toast.error('Please upload a file before translating.');
      return;
    }

    if (!fromLang || !toLang) {
      toast.error('Please select both source and target languages.');
      return;
    }

    if (translationStatus.isLoading) {
      toast.error('A translation is already in progress.');
      return;
    }

    // Ensure token is valid before starting translation
    await ensureValidToken();

    setSelectedLanguage(toLang);
    
    // Store file info for potential recovery
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type,
      uploadTime: Date.now()
    };
    
    // Reset status tracking
    setConsecFailures(0);
    setLastFallbackStatus(false);
    setStatusCheckStalled(false);
    setSimulatedProgress({
      active: false,
      value: 0,
      page: 0,
      total: file.type.includes('pdf') ? Math.max(1, Math.floor(file.size / (100 * 1024))) : 1
    });
    
    // Set process start time for runtime tracking
    setProcessStartTime(Date.now());
    
    // Update status to pending
    setTranslationStatus({
      isLoading: true,
      progress: 0,
      status: 'pending',
      error: null,
      translatedText: null,
      fileName: file.name,
      direction: toLang === 'fa' || toLang === 'ar' ? 'rtl' : 'ltr',
      processId: null,
      currentPage: 0,
      totalPages: 0,
      lastStatusUpdate: Date.now(),
      fileInfo: fileInfo
    });

    try {
      // Prepare form data for upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('from_lang', fromLang);
      formData.append('to_lang', toLang);

      // Show notification for large files
      if (file.size > 5 * 1024 * 1024) {
        toast.info(
          `This is a large file (${(file.size / (1024 * 1024)).toFixed(2)}MB). ` +
          `The translation may take several minutes.`,
          { duration: 5000 }
        );
      }

      // Initiate translation process
      const response = await documentService.initiateTranslation(formData);
      
      // Check if response indicates it was recovered after timeout
      if (response.recoveredAfterTimeout) {
        toast.success('Translation was found after timeout! Continuing to monitor progress...');
      } else {
        toast.success('Translation started successfully');
      }
      
      if (!response.processId) {
        throw new Error('No process ID received from the server');
      }
      
      // Update state with process ID
      setTranslationStatus(prev => ({
        ...prev,
        processId: response.processId,
        status: response.status || 'pending',
        lastStatusUpdate: Date.now()
      }));
      
      // Polling will start automatically via the useEffect
      
    } catch (error) {
      console.error('Translation initiation error:', error);
      
      // Special handling for timeouts - might actually be processing in background
      if (error.message && (
          error.message.includes('timeout') || 
          error.message.includes('taking longer than expected')
      )) {
        toast.warning(
          error.message || 
          'The server is taking longer than expected to respond. Your document might be processing in the background.',
          { duration: 8000 }
        );
        
        // Check if we can get active translations to find our process
        setTranslationStatus(prev => ({
          ...prev,
          isLoading: false,
          status: 'timeout',
          error: 'The server timed out while processing the request. Your document might still be processing in the background.',
          canRetryCheck: true
        }));
        
        // Try to find the translation automatically after a moment
        setTimeout(() => {
          attemptRecoveryAfterTimeout();
        }, 3000);
        
      } else {
        // Normal error handling
        setTranslationStatus(prev => ({
          ...prev,
          isLoading: false,
          status: 'failed',
          error: error.message || 'Failed to start translation process',
        }));
        toast.error(error.message || 'Failed to start translation');
      }
    }
  };

  // Improved recovery function that uses the backend API
  const attemptRecoveryAfterTimeout = async () => {
    const { fileInfo } = translationStatus;
    
    if (!fileInfo) {
      toast.error("Cannot recover: missing file information");
      return;
    }
    
    // Show recovery in progress
    toast.info("Attempting to recover translation status...");
    
    // Update UI to show we're checking
    setTranslationStatus(prev => ({
      ...prev,
      isLoading: true,
      status: 'checking',
      error: null,
      lastStatusUpdate: Date.now()
    }));
    
    try {
      // First, try to find by file name
      const foundTranslation = await documentService.findTranslationByFile(fileInfo.name);
      
      if (foundTranslation) {
        console.log("Successfully found translation process:", foundTranslation);
        
        setTranslationStatus(prev => ({
          ...prev,
          processId: foundTranslation.processId,
          status: foundTranslation.status,
          progress: foundTranslation.progress || 0,
          currentPage: foundTranslation.currentPage || 0,
          totalPages: foundTranslation.totalPages || 0,
          isLoading: true,
          lastStatusUpdate: Date.now()
        }));
        
        // Start polling immediately
        pollTranslationStatus();
        
        toast.success("Recovery successful! Translation found and status updated.");
        return;
      }
      
      // If we couldn't find by file name, try the active translations list
      const activeTranslations = await documentService.listActiveTranslations();
      
      // Find a recent translation within the last few minutes
      const recentTime = fileInfo.uploadTime - (10 * 60 * 1000); // 10 minutes ago
      const matchingTranslation = activeTranslations.find(t => {
        const createdTime = new Date(t.createdAt).getTime();
        return createdTime > recentTime;
      });
      
      if (matchingTranslation) {
        console.log("Found a recent translation that might match:", matchingTranslation);
        
        setTranslationStatus(prev => ({
          ...prev,
          processId: matchingTranslation.processId,
          status: matchingTranslation.status,
          progress: matchingTranslation.progress || 0,
          currentPage: matchingTranslation.currentPage || 0,
          totalPages: matchingTranslation.totalPages || 0,
          isLoading: true,
          lastStatusUpdate: Date.now()
        }));
        
        // Start polling
        pollTranslationStatus();
        
        toast.success("Found a recent translation! Monitoring progress...");
        return;
      }
      
      // Finally, check local storage for recent translations
      try {
        const recentTranslations = JSON.parse(localStorage.getItem('recentTranslations') || '[]');
        
        // Find a matching translation by file name
        const savedTranslation = recentTranslations.find(t => t.fileName === fileInfo.name);
        
        if (savedTranslation && savedTranslation.processId) {
          console.log("Found translation in local storage:", savedTranslation);
          
          // Verify it's valid by checking its status
          try {
            const statusData = await documentService.checkTranslationStatus(savedTranslation.processId);
            
            setTranslationStatus(prev => ({
              ...prev,
              processId: savedTranslation.processId,
              status: statusData.status,
              progress: statusData.progress || 0,
              currentPage: statusData.currentPage || 0,
              totalPages: statusData.totalPages || 0,
              isLoading: true,
              lastStatusUpdate: Date.now()
            }));
            
            // Start polling
            pollTranslationStatus();
            
            toast.success("Recovered translation from local cache!");
            return;
          } catch (statusError) {
            console.log("Translation in local storage is no longer valid:", statusError);
          }
        }
      } catch (storageError) {
        console.warn("Failed to check local storage:", storageError);
      }
      
      // If all attempts failed, show an error
      throw new Error("Could not find any active translation for this file");
      
    } catch (error) {
      console.error("Recovery attempt failed:", error);
      toast.error("Could not recover the translation. Please try again.");
      
      setTranslationStatus(prev => ({
        ...prev,
        isLoading: false,
        status: 'failed',
        error: "Recovery attempt failed. Please try uploading the file again."
      }));
    }
  };

  // Quick status check button handler
  const handleCheckStatus = async () => {
    const { fileInfo } = translationStatus;
    
    if (!fileInfo) {
      toast.error("Cannot check status: missing file information");
      return;
    }
    
    toast.info("Checking translation status...");
    
    try {
      const foundTranslation = await documentService.findTranslationByFile(fileInfo.name);
      
      if (foundTranslation) {
        setTranslationStatus(prev => ({
          ...prev,
          processId: foundTranslation.processId,
          status: foundTranslation.status,
          progress: foundTranslation.progress || 0,
          currentPage: foundTranslation.currentPage || 0,
          totalPages: foundTranslation.totalPages || 0,
          isLoading: true,
          lastStatusUpdate: Date.now()
        }));
        
        // Start polling
        pollTranslationStatus();
        
        toast.success("Found your translation! Status updated.");
      } else {
        toast.warning("No translation found for this file.");
      }
    } catch (error) {
      console.error("Status check failed:", error);
      toast.error("Failed to check translation status.");
    }
  };

  // Improved fetchTranslationResults function with partial result handling
  const fetchTranslationResults = async (processId) => {
    try {
      // Ensure token is valid before fetching results
      if (translationStatus.status === 'completed') {
        await ensureValidToken();
      }
      
      // First try with normal request
      const resultResponse = await documentService.getTranslationResult(processId);
      
      setTranslationStatus({
        isLoading: false,
        progress: 100,
        status: 'completed',
        error: null,
        translatedText: resultResponse.translatedText,
        fileName: resultResponse.metadata.originalFileName,
        direction: resultResponse.direction,
        processId: processId,
        currentPage: resultResponse.metadata.currentPage || 0,
        totalPages: resultResponse.metadata.totalPages || 0,
        lastStatusUpdate: Date.now()
      });
      
      // Stop simulated progress
      if (simulatedProgress.active) {
        setSimulatedProgress({
          active: false,
          value: 0,
          page: 0,
          total: 0
        });
        
        if (forcedProgressRef.current) {
          clearInterval(forcedProgressRef.current);
          forcedProgressRef.current = null;
        }
      }
      
      toast.success('Translation completed!');
      
    } catch (error) {
      console.error('Result fetch error:', error);
      
      // Try fetching partial results if available
      if (error.message && (
          error.message.includes('not completed') || 
          error.response?.status === 400
      )) {
        console.log('Translation not complete yet, trying to fetch partial results...');
        
        try {
          // Add partial=true parameter to get whatever is ready
          const partialResponse = await documentService.getTranslationResult(processId, true);
          
          if (partialResponse && partialResponse.translatedText) {
            setTranslationStatus({
              isLoading: false,
              progress: Math.min(100, translationStatus.progress || 0),
              status: 'partial',
              partialResults: true,
              error: null,
              translatedText: partialResponse.translatedText,
              fileName: partialResponse.metadata.originalFileName,
              direction: partialResponse.direction,
              processId: processId,
              currentPage: partialResponse.metadata.currentPage || 0,
              totalPages: partialResponse.metadata.totalPages || 0,
              lastStatusUpdate: Date.now()
            });
            
            toast.info('Partial translation results available', {
              description: 'The translation is still in progress, but partial results are available.'
            });
            
            return;
          }
        } catch (partialError) {
          console.error('Failed to fetch partial results:', partialError);
        }
        
        // If partial results fetch fails, continue polling
        console.log('Translation not yet complete, continuing to poll...');
        // Reset status to in_progress and continue polling
        setTranslationStatus(prev => ({
          ...prev,
          status: 'in_progress',
          lastStatusUpdate: Date.now()
        }));
        
        // Resume polling after a short delay
        statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, 2000);
      } else if (error.response && error.response.status === 401) {
        // Authentication error - retry after a moment
        console.log('Authentication error when fetching results, retrying shortly...');
        
        setTimeout(async () => {
          try {
            await fetchTranslationResults(processId);
          } catch (retryError) {
            console.error('Failed to fetch results on retry:', retryError);
            setTranslationStatus(prev => ({
              ...prev,
              isLoading: false,
              status: 'failed',
              error: 'Authentication error when fetching results. Please try again.',
            }));
            toast.error('Authentication error');
          }
        }, 2000);
      } else {
        // Otherwise, show the error
        setTranslationStatus(prev => ({
          ...prev,
          isLoading: false,
          status: 'failed',
          error: error.message || 'Failed to fetch translation results',
        }));
        toast.error(error.message || 'Failed to fetch translation results');
      }
    }
  };
  
  // Cancel translation function
  const handleCancel = () => {
    if (statusCheckTimeoutRef.current) {
      clearTimeout(statusCheckTimeoutRef.current);
      statusCheckTimeoutRef.current = null;
    }
    
    if (forcedProgressRef.current) {
      clearInterval(forcedProgressRef.current);
      forcedProgressRef.current = null;
    }
    
    setTranslationStatus(prev => ({
      ...prev,
      isLoading: false,
      status: 'cancelled',
      error: 'Translation cancelled by user',
    }));
    
    setSimulatedProgress({
      active: false,
      value: 0,
      page: 0,
      total: 0
    });
    
    toast.info('Translation cancelled');
  };
  
  // Function to manually retry polling
  const handleRetryPolling = () => {
    if (!translationStatus.processId) return;
    
    console.log('🔄 Manually retrying polling...');
    setConsecFailures(0);
    setStatusCheckStalled(false);
    
    setTranslationStatus(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      status: prev.status === 'failed' || prev.status === 'unknown' ? 'in_progress' : prev.status,
      lastStatusUpdate: Date.now()
    }));
    
    // Start polling immediately
    pollTranslationStatus();
    
    toast.info('Retrying translation status check...');
  };

  const handleCopyText = async () => {
    try {
      if (!contentRef.current) return;
      const text = contentRef.current.innerText;
      await navigator.clipboard.writeText(text);
      
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast.success('Text copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text:', err);
      toast.error('Failed to copy text to clipboard');
    }
  };

  // Generate status message based on current state
  const getStatusMessage = () => {
    if (statusCheckStalled) {
      return 'Processing translation (status updates delayed)...';
    }
    
    if (translationStatus.status === 'pending') {
      return 'Initializing translation...';
    } else if (translationStatus.status === 'in_progress') {
      if (simulatedProgress.active) {
        return `Translating page ${simulatedProgress.page} of ${simulatedProgress.total} (estimated)`;
      } else if (translationStatus.totalPages > 0) {
        // Add time estimate if available
        if (translationStatus.estimatedTimeRemaining) {
          const minutes = Math.floor(translationStatus.estimatedTimeRemaining / 60);
          const seconds = translationStatus.estimatedTimeRemaining % 60;
          return `Translating page ${translationStatus.currentPage} of ${translationStatus.totalPages} (est. ${minutes}m ${seconds}s remaining)`;
        }
        return `Translating page ${translationStatus.currentPage} of ${translationStatus.totalPages}`;
      }
      return 'Processing translation...';
    } else if (translationStatus.status === 'completed') {
      return 'Translation completed!';
    } else if (translationStatus.status === 'partial') {
      return 'Partial translation available';
    } else if (translationStatus.status === 'failed') {
      return 'Translation failed';
    } else if (translationStatus.status === 'stalled') {
      return 'Translation stalled';
    } else if (translationStatus.status === 'cancelled') {
      return 'Translation cancelled';
    } else if (translationStatus.status === 'timeout') {
      return 'Request timed out';
    } else if (translationStatus.status === 'checking') {
      return 'Checking translation status...';
    }
    return 'Preparing translation...';
  };
  
  // Helper function to format the "last updated" time
  const formatTimeAgo = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
    } else {
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
    }
  };
  
  // Get the current progress percentage to display
  const getProgressPercentage = () => {
    if (simulatedProgress.active) {
      return simulatedProgress.value;
    }
    return translationStatus.progress;
  };
  
  // Get current page info to display
  const getCurrentPageInfo = () => {
    if (simulatedProgress.active && simulatedProgress.total > 0) {
      return {
        current: simulatedProgress.page,
        total: simulatedProgress.total,
        isEstimated: true
      };
    } else if (translationStatus.totalPages > 0) {
      return {
        current: translationStatus.currentPage,
        total: translationStatus.totalPages,
        isEstimated: false
      };
    }
    return null;
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
          <p className="text-gray-500 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="py-12 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4">
            <Languages className="h-16 w-16 text-indigo-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 text-center bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
            Document Translation
          </h1>
          <p className="text-lg text-gray-600 text-center max-w-2xl">
            Welcome, <span className="font-medium text-indigo-600">{user?.firstName || user?.username || 'User'}</span>! 
            Translate your documents while preserving the original formatting.
          </p>
        </div>
  
        {/* Balance Card */}
        <BalanceDisplay />
  
        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8 border border-gray-100">
          {/* Card Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-6 py-5">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-white">Translation Tool</h2>
                <p className="text-indigo-200 text-sm">Upload documents in various formats</p>
              </div>
              <div className="hidden sm:block">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  PDF, JPEG, PNG, WEBP support
                </span>
              </div>
            </div>
          </div>
  
          {/* Upload Section */}
          <div className="p-6">
            <DocumentsUpload onTranslate={onTranslate} isLoading={translationStatus.isLoading} onCancel={handleCancel} />
            
            {/* Progress Bar */}
            {translationStatus.isLoading && (
              <div className="mt-6 bg-indigo-50 p-4 rounded-lg">
                <div className="flex justify-between text-sm text-gray-700 mb-2">
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin text-indigo-600" />
                    <span>{getStatusMessage()}</span>
                    
                    {/* Status indicators */}
                    <div className="flex ml-2 gap-1">
                      {consecFailures > 0 && (
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                          consecFailures > 5 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-blue-50 text-blue-600'
                        }`}>
                          {consecFailures > 5 ? 'Connection issues' : 'Retrying...'}
                        </span>
                      )}
                      
                      {statusCheckStalled && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          Status delayed
                        </span>
                      )}
                      
                      {simulatedProgress.active && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          Estimated
                        </span>
                      )}
                      
                      {translationStatus.partialResults && (
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                          Partial results
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{Math.round(getProgressPercentage())}%</span>
                    <button 
                      onClick={handleCancel} 
                      className="p-1 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
                      aria-label="Cancel translation"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                
                {/* Progress bar with improved styling based on status */}
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ease-out ${
                      simulatedProgress.active 
                        ? 'bg-blue-400' 
                        : statusCheckStalled 
                          ? 'bg-amber-500'
                          : translationStatus.partialResults
                            ? 'bg-purple-500'
                            : 'bg-indigo-600'
                    }`}
                    style={{ width: `${getProgressPercentage()}%` }}
                  />
                </div>
                
                <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-indigo-700">
                  <p className="italic">
                    {statusCheckStalled
                      ? "Status updates are delayed. Translation is still processing."
                      : "This may take a few minutes depending on document size"
                    }
                  </p>
                  <div className="flex items-center gap-4">
                    {getCurrentPageInfo() && (
                      <p>
                        Page {getCurrentPageInfo().current} of {getCurrentPageInfo().total}
                        {getCurrentPageInfo().isEstimated && " (est.)"}
                      </p>
                    )}
                    {translationStatus.lastStatusUpdate && (
                      <div className="flex items-center">
                        <p className={`text-xs ${timeCounter > 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                          Last update: {formatTimeAgo(timeCounter)}
                        </p>
                        {timeCounter > 30 && (
                          <button
                            onClick={handleRetryPolling}
                            className="ml-2 p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700"
                            title="Force refresh status"
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Add warning for long-running translations */}
                {getProcessRuntime() > 5 * 60 && (
                  <div className="mt-3 text-xs bg-amber-50 p-2 rounded border border-amber-100 text-amber-800">
                    <p className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      This translation has been running for {Math.floor(getProcessRuntime() / 60)} minutes. Larger documents may take 10+ minutes to complete.
                    </p>
                  </div>
                )}
  
                {/* Add additional guidance if we've been stuck for a long time */}
                {getProcessRuntime() > 15 * 60 && timeCounter > 120 && (
                  <div className="mt-2 text-xs bg-amber-100 p-2 rounded border border-amber-200 text-amber-900">
                    <p className="flex items-center font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Translation is taking longer than expected
                    </p>
                    <ul className="ml-5 mt-1 list-disc text-amber-800">
                      <li>The server may be processing a queue of documents</li>
                      <li>Very large files can take 30+ minutes</li>
                      <li>You can cancel and try again with a smaller document</li>
                    </ul>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={handleCancel}
                        className="px-2 py-1 bg-white border border-amber-300 rounded text-amber-700 hover:bg-amber-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRetryPolling}
                        className="px-2 py-1 bg-amber-500 rounded text-white hover:bg-amber-600"
                      >
                        Refresh Status
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
  
            {/* Error Message */}
            {!translationStatus.isLoading && translationStatus.error && (
              <div className="mt-6 bg-red-50 p-4 rounded-lg border border-red-100">
                <div className="flex items-start text-red-800">
                  <div className="shrink-0 mt-0.5">
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium">Translation failed</h3>
                    <p className="mt-1 text-sm">{translationStatus.error}</p>
                    {translationStatus.processId && (
                      <button 
                        onClick={handleRetryPolling}
                        className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                      >
                        Retry status check
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Timeout Recovery UI */}
            {!translationStatus.isLoading && translationStatus.status === 'timeout' && (
              <div className="mt-6 bg-amber-50 p-4 rounded-lg border border-amber-100">
                <div className="flex items-start">
                  <div className="shrink-0 mt-0.5">
                    <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-amber-800">Translation request timed out</h3>
                    <p className="mt-1 text-sm text-amber-700">
                      The server took too long to respond, but your document might still be processing in the background.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button 
                        onClick={handleCheckStatus}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-amber-600 hover:bg-amber-700"
                      >
                        <RefreshCw size={14} className="mr-1" />
                        Check status
                      </button>
                      <button 
                        onClick={attemptRecoveryAfterTimeout}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-amber-800 bg-amber-100 hover:bg-amber-200"
                      >
                        <Loader2 size={14} className="mr-1 animate-spin" />
                        Attempt recovery
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Status display for partial results */}
            {!translationStatus.isLoading && translationStatus.status === 'partial' && translationStatus.translatedText && (
              <div className="mt-6 bg-purple-50 p-4 rounded-lg border border-purple-100">
                <div className="flex items-start">
                  <div className="shrink-0 mt-0.5">
                    <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-purple-800">Partial translation available</h3>
                    <p className="mt-1 text-sm text-purple-700">
                      We've retrieved the translation progress so far. The full document may still be processing.
                    </p>
                    
                    <div className="flex mt-3 gap-3">
                      <button 
                        onClick={handleRetryPolling}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                      >
                        <RefreshCw size={14} className="mr-1" />
                        Check for updates
                      </button>
                      <button 
                        onClick={() => setTranslationStatus(prev => ({ ...prev, isLoading: false, status: 'completed' }))}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-purple-800 bg-purple-100 hover:bg-purple-200"
                      >
                        <Check size={14} className="mr-1" />
                        Accept partial results
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
  
            {/* Status display for stalled translations */}
            {!translationStatus.isLoading && translationStatus.status === 'stalled' && (
              <div className="mt-6 bg-red-50 p-4 rounded-lg border border-red-100">
                <div className="flex items-start">
                  <div className="shrink-0 mt-0.5">
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium">Translation stalled</h3>
                    <p className="mt-1 text-sm">The translation has been running for too long without progress. This might be due to document complexity or server issues.</p>
                    <div className="mt-3 flex gap-3">
                      <button 
                        onClick={() => {
                          setTranslationStatus(prev => ({
                            ...prev,
                            isLoading: false,
                            status: 'cancelled',
                            error: null
                          }));
                        }}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                      >
                        Cancel translation
                      </button>
                      <button 
                        onClick={handleRetryPolling}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Try one more time
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
  
            {/* Translation Results */}
            {translationStatus.translatedText && (
              <div className="mt-8 border-t pt-6">
                <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-indigo-600" /> 
                    Translated Document
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyText}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                      disabled={!translationStatus.translatedText}
                    >
                      {isCopied ? <Check size={16} /> : <Copy size={16} />}
                      {isCopied ? "Copied" : "Copy Text"}
                    </button>
                    <DocumentDownloadButton
                      text={translationStatus.translatedText}
                      language={selectedLanguage}
                      onError={(error) => toast.error(error)}
                      onSuccess={() => toast.success('Document downloaded successfully!')}
                      disabled={!translationStatus.translatedText || translationStatus.isLoading}
                      className="flex items-center gap-2"
                    />
                    <GoogleDriveButton
                      htmlContent={translationStatus.translatedText}
                      fileName={translationStatus.fileName ? `translated_${translationStatus.fileName.replace(/\.(pdf|jpe?g|png|webp|heic)$/i, '.docx')}` : 'translated_document.docx'}
                      onError={(error) => toast.error(error)}
                      onSuccess={() => toast.success('Document saved to Google Drive successfully!')}
                      disabled={!translationStatus.translatedText || translationStatus.isLoading}
                      className="flex items-center gap-2"
                    />
                  </div>
                </div>
  
                <div className="mb-2 flex items-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <Check className="w-3 h-3 mr-1" />
                    Translated
                  </span>
                  {translationStatus.status === 'partial' && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      Partial Results
                    </span>
                  )}
                </div>
  
                <div
                  ref={contentRef}
                  className="document-preview p-6 border rounded-lg bg-white"
                  style={{
                    direction: translationStatus.direction,
                    textAlign: translationStatus.direction === 'rtl' ? 'right' : 'left',
                    fontFamily: translationStatus.direction === 'rtl' ? 'Tahoma, Arial' : 'inherit',
                  }}
                  dangerouslySetInnerHTML={{ __html: translationStatus.translatedText }}
                />
                
                <div className="mt-2 text-xs text-gray-500 text-right flex items-center justify-end gap-2">
                  <FileText className="h-3 w-3" />
                  Original file: {translationStatus.fileName}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Features Section */}
        <div className="mt-12 mb-8">
          <h2 className="text-2xl font-bold text-center mb-8 text-gray-800">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="rounded-full bg-indigo-100 w-12 h-12 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Preserve Formatting</h3>
              <p className="text-gray-600">Maintain original document layout, tables, and styles in the translated output.</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="rounded-full bg-indigo-100 w-12 h-12 flex items-center justify-center mb-4">
                <Languages className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Multiple Languages</h3>
              <p className="text-gray-600">Support for 13+ languages including Spanish, French, German, Chinese, and Arabic.</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="rounded-full bg-indigo-100 w-12 h-12 flex items-center justify-center mb-4">
                <Download className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Export Options</h3>
              <p className="text-gray-600">Download translated documents in PDF or DOCX format for easy sharing.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}