import { useState, useEffect, useRef } from 'react';
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
    totalPages: 0
  });

  const [isCopied, setIsCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [retryCount, setRetryCount] = useState(0);

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
    };
  }, []);

  // Status polling with adaptive retry and backoff
  useEffect(() => {
    const pollStatus = async () => {
      // Only poll if we have a process ID and it's still loading
      if (!translationStatus.processId || !translationStatus.isLoading) {
        return;
      }

      try {
        const statusData = await documentService.checkTranslationStatus(translationStatus.processId);
        
        // Reset retry count on successful status check
        setRetryCount(0);
        
        // Update status in state
        setTranslationStatus(prev => ({
          ...prev,
          progress: statusData.progress,
          status: statusData.status,
          currentPage: statusData.currentPage,
          totalPages: statusData.totalPages
        }));
        
        // Check if translation completed or failed
        if (statusData.status === 'completed') {
          fetchTranslationResults(translationStatus.processId);
        } else if (statusData.status === 'failed') {
          setTranslationStatus(prev => ({
            ...prev,
            isLoading: false,
            error: 'Translation failed. Please try again.',
            status: 'failed'
          }));
          toast.error('Translation failed');
        } else {
          // Continue polling if still in progress
          // Use adaptive polling interval (faster for pending, slower for in_progress)
          const pollInterval = statusData.status === 'pending' ? 2000 : 3000;
          statusCheckTimeoutRef.current = setTimeout(pollStatus, pollInterval);
        }
      } catch (error) {
        console.error('Status check error:', error);
        
        // Increment retry count
        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);
        
        // Implement exponential backoff up to a maximum of 10 seconds
        // Formula: min(maxDelay, baseDelay * 2^retryCount)
        const baseDelay = 1000; // 1 second base
        const maxDelay = 10000; // 10 seconds maximum
        const delay = Math.min(maxDelay, baseDelay * Math.pow(1.5, newRetryCount));
        
        // If we've tried too many times (10+), stop polling and show an error
        if (newRetryCount > 10) {
          setTranslationStatus(prev => ({
            ...prev,
            isLoading: false,
            error: 'Lost connection to the server. The translation may still be processing in the background.',
            status: 'unknown'
          }));
          toast.error('Lost connection to the server');
        } else {
          // Log retry attempt with backoff delay
          console.log(`Retrying status check in ${Math.round(delay / 1000)} seconds (attempt ${newRetryCount})...`);
          statusCheckTimeoutRef.current = setTimeout(pollStatus, delay);
        }
      }
    };

    // Start polling if processId exists and is loading
    if (translationStatus.processId && translationStatus.isLoading) {
      // Initial delay before first poll
      statusCheckTimeoutRef.current = setTimeout(pollStatus, 1000);
    }

    return () => {
      if (statusCheckTimeoutRef.current) {
        clearTimeout(statusCheckTimeoutRef.current);
      }
    };
  }, [translationStatus.processId, translationStatus.isLoading, retryCount]);

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
      totalPages: 0
    });
  
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
      
      // Reset retry count
      setRetryCount(0);
      
      // Update state with process ID
      setTranslationStatus(prev => ({
        ...prev,
        processId: response.processId,
        status: response.status || 'pending'
      }));
      
      toast.success('Translation started successfully');
      
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
        totalPages: resultResponse.metadata.totalPages || 0
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
          status: 'in_progress'
        }));
        
        // Resume polling after a short delay
        statusCheckTimeoutRef.current = setTimeout(() => {
          setRetryCount(0); // Reset retry count
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
                  {translationStatus.totalPages > 0 && (
                    <p>Page {translationStatus.currentPage} of {translationStatus.totalPages}</p>
                  )}
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
                  <div className="ml-3">
                    <h3 className="text-sm font-medium">Translation failed</h3>
                    <p className="mt-1 text-sm">{translationStatus.error}</p>
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