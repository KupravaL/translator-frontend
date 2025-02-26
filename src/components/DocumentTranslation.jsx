import { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Check, FileText, Download, Languages, Loader2, X } from 'lucide-react';
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
  const { registerAuthInterceptor } = useApiAuth();
  const contentRef = useRef(null);
  const statusCheckTimeoutRef = useRef(null);
  const pollAttemptRef = useRef(0);
  const lastStatusRef = useRef(null);
  const statusUpdateIntervalRef = useRef(null);
  
  // Keep track of consecutive failures
  const [consecFailures, setConsecFailures] = useState(0);
  // For UI updates showing time since last status update
  const [timeCounter, setTimeCounter] = useState(0);
  
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
        setTimeCounter(Math.floor((Date.now() - translationStatus.lastStatusUpdate) / 1000));
      }, 1000);
    }
    
    return () => {
      if (statusUpdateIntervalRef.current) {
        clearInterval(statusUpdateIntervalRef.current);
      }
    };
  }, [translationStatus.isLoading, translationStatus.lastStatusUpdate]);

  // Helper function to determine polling interval based on current state
  const getPollInterval = useCallback(() => {
    const { status, progress } = translationStatus;
    const failures = consecFailures;
    
    // Base timing parameters
    let baseInterval = 2000; // 2 seconds default
    
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
    
    // Add jitter to prevent synchronized requests
    // This adds a random amount between -500ms and +500ms
    const jitter = Math.floor(Math.random() * 1000) - 500;
    
    // Apply backoff for consecutive failures
    // Using exponential backoff with a cap
    const maxBackoff = 20000; // 20 seconds maximum
    const failureBackoff = failures > 0 ? Math.min(Math.pow(1.5, failures) * 1000, maxBackoff) : 0;
    
    // Combine base interval, jitter, and backoff
    const finalInterval = Math.max(1000, baseInterval + jitter + failureBackoff);
    
    console.log(`📊 Poll timing: base=${baseInterval}ms, jitter=${jitter}ms, backoff=${failureBackoff}ms, final=${finalInterval}ms`);
    
    return finalInterval;
  }, [translationStatus, consecFailures]);

  // Polling function with better error handling
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
      
      // Store latest status for comparison
      lastStatusRef.current = {
        status: statusData.status,
        progress: statusData.progress,
        currentPage: statusData.currentPage,
        totalPages: statusData.totalPages,
        timestamp: Date.now()
      };
      
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
        toast.error('Translation failed');
      } else {
        // Continue polling if still in progress
        const pollInterval = getPollInterval();
        console.log(`🔄 Scheduling next poll in ${pollInterval}ms`);
        statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, pollInterval);
      }
    } catch (error) {
      console.error('🚨 Status check error:', error);
      
      // Increase consecutive failures
      setConsecFailures(prev => prev + 1);
      
      // Check if we should give up (more than 15 consecutive failures)
      if (consecFailures >= 15) {
        console.error('🚨 Too many consecutive failures, giving up');
        setTranslationStatus(prev => ({
          ...prev,
          isLoading: false,
          error: 'Lost connection to the server. The translation may still be processing in the background.',
          status: 'unknown'
        }));
        toast.error('Lost connection to the server');
        return;
      }
      
      // Continue polling after a delay
      const pollInterval = getPollInterval();
      console.log(`🔄 Scheduling retry poll in ${pollInterval}ms after error`);
      statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, pollInterval);
    }
  }, [translationStatus, consecFailures, getPollInterval]);

  // Effect to start polling whenever processId changes
  useEffect(() => {
    if (translationStatus.processId && translationStatus.isLoading) {
      // Reset polling attempt counter
      pollAttemptRef.current = 0;
      
      // Start polling with small initial delay
      statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, 500);
      
      return () => {
        if (statusCheckTimeoutRef.current) {
          clearTimeout(statusCheckTimeoutRef.current);
        }
      };
    }
  }, [translationStatus.processId, translationStatus.isLoading, pollTranslationStatus]);
  
  // Effect to detect stuck translations
  useEffect(() => {
    if (!translationStatus.isLoading || !translationStatus.lastStatusUpdate) {
      return;
    }
    
    // Check if we've gone too long without a status update
    const checkStuckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - translationStatus.lastStatusUpdate;
      
      // If we haven't had a status update in 2 minutes, consider it stuck
      if (timeSinceLastUpdate > 2 * 60 * 1000) {
        console.warn(`⚠️ Translation might be stuck - no updates for ${Math.floor(timeSinceLastUpdate/1000)}s`);
        
        // If polling is also stuck, restart it
        if (statusCheckTimeoutRef.current) {
          clearTimeout(statusCheckTimeoutRef.current);
          statusCheckTimeoutRef.current = setTimeout(pollTranslationStatus, 1000);
        }
      }
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(checkStuckInterval);
  }, [translationStatus.isLoading, translationStatus.lastStatusUpdate, pollTranslationStatus]);

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
  
    setSelectedLanguage(toLang);
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
      lastStatusUpdate: Date.now()
    });
    
    // Reset consecutive failures
    setConsecFailures(0);
  
    try {
      // Initiate translation process
      const formData = new FormData();
      formData.append('file', file);
      formData.append('from_lang', fromLang);
      formData.append('to_lang', toLang);
  
      const response = await documentService.initiateTranslation(formData);
      
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
      
      toast.success('Translation started successfully');
      
      // Polling will start automatically via the useEffect
      
    } catch (error) {
      console.error('Translation initiation error:', error);
      setTranslationStatus(prev => ({
        ...prev,
        isLoading: false,
        status: 'failed',
        error: error.message || 'Failed to start translation process',
      }));
      toast.error(error.message || 'Failed to start translation');
    }
  };

  // Function to fetch completed translation
  const fetchTranslationResults = async (processId) => {
    try {
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
      
      toast.success('Translation completed!');
      
    } catch (error) {
      console.error('Result fetch error:', error);
      
      // If error is about translation not being complete yet, continue polling
      if (error.message && error.message.includes('not yet complete')) {
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
    
    setTranslationStatus(prev => ({
      ...prev,
      isLoading: false,
      status: 'cancelled',
      error: 'Translation cancelled by user',
    }));
    
    toast.info('Translation cancelled');
  };
  
  // Function to manually retry polling
  const handleRetryPolling = () => {
    if (!translationStatus.processId) return;
    
    console.log('🔄 Manually retrying polling...');
    setConsecFailures(0);
    
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
    if (translationStatus.status === 'pending') {
      return 'Initializing translation...';
    } else if (translationStatus.status === 'in_progress') {
      if (translationStatus.totalPages > 0) {
        return `Translating page ${translationStatus.currentPage} of ${translationStatus.totalPages}`;
      }
      return 'Processing translation...';
    } else if (translationStatus.status === 'completed') {
      return 'Translation completed!';
    } else if (translationStatus.status === 'failed') {
      return 'Translation failed';
    } else if (translationStatus.status === 'cancelled') {
      return 'Translation cancelled';
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
                    {consecFailures > 0 && (
                      <span className="ml-2 text-xs text-amber-600">
                        {consecFailures > 5 ? 'Connection issues...' : 'Retrying...'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{Math.round(translationStatus.progress)}%</span>
                    <button 
                      onClick={handleCancel} 
                      className="p-1 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
                      aria-label="Cancel translation"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                    style={{ width: `${translationStatus.progress}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-indigo-700">
                  <p className="italic">This may take a few minutes depending on document size</p>
                  <div className="flex items-center gap-4">
                    {translationStatus.totalPages > 0 && (
                      <p>Page {translationStatus.currentPage} of {translationStatus.totalPages}</p>
                    )}
                    {translationStatus.lastStatusUpdate && (
                      <p className="text-xs text-gray-500">
                        Last update: {formatTimeAgo(timeCounter)}
                      </p>
                    )}
                  </div>
                </div>
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