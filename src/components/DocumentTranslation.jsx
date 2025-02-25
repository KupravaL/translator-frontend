import { useState, useEffect, useRef } from 'react';
import { Copy, Check, FileText, Download, Languages, Loader2 } from 'lucide-react';
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

  const [translationStatus, setTranslationStatus] = useState({
    isLoading: false,
    progress: 0,
    error: null,
    translatedText: null,
    fileName: null,
    direction: 'ltr',
  });

  const [isCopied, setIsCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [abortController, setAbortController] = useState(null);

  // Register auth interceptor on mount
  useEffect(() => {
    registerAuthInterceptor();
  }, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

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
      error: null,
      translatedText: null,
      fileName: file.name,
      direction: toLang === 'fa' || toLang === 'ar' ? 'rtl' : 'ltr',
    });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setTranslationStatus((prev) => ({
          ...prev,
          progress: Math.min(prev.progress + 5, 90),
        }));
      }, 1000);

      const result = await documentService.translateDocument(file, fromLang, toLang);

      clearInterval(progressInterval);

      if (!result.translatedText) {
        throw new Error('No translated text received from the server');
      }

      setTranslationStatus({
        isLoading: false,
        progress: 100,
        error: null,
        translatedText: result.translatedText,
        fileName: file.name,
        direction: result.direction || 'ltr',
      });

      toast.success(`Translation completed!`);
    } catch (error) {
      console.error('Translation error:', error);
      setTranslationStatus((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error.name === 'AbortError'
            ? 'Translation timed out. Please try again with a smaller document or contact support.'
            : error.response?.data?.error || 'An unexpected error occurred during translation',
      }));
    } finally {
      setAbortController(null);
    }
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

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setTranslationStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Translation cancelled',
      }));
      toast.info('Translation cancelled');
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
                    <span>Translating <span className="font-medium">{translationStatus.fileName}</span>...</span>
                  </div>
                  <span className="font-medium">{Math.round(translationStatus.progress)}%</span>
                </div>
                <div className="progress-container">
                  <div 
                    className="progress-bar"
                    style={{ width: `${translationStatus.progress}%` }}
                  />
                </div>
                <p className="text-xs text-indigo-700 mt-2 italic">This may take a few minutes depending on document size</p>
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
                  <span className="status-badge status-badge-success">
                    Translated
                  </span>
                </div>

                <div
                  ref={contentRef}
                  className="document-preview"
                  style={{
                    direction: translationStatus.direction,
                    textAlign: translationStatus.direction === 'rtl' ? 'right' : 'left',
                    fontFamily: translationStatus.direction === 'rtl' ? 'Tahoma, Arial' : 'inherit',
                  }}
                  dangerouslySetInnerHTML={{ __html: translationStatus.translatedText }}
                />
                
                <div className="mt-2 text-xs text-gray-500 text-right">
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
            <div className="card hover:shadow-md transition-shadow">
              <div className="rounded-full bg-indigo-100 w-12 h-12 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Preserve Formatting</h3>
              <p className="text-gray-600">Maintain original document layout, tables, and styles in the translated output.</p>
            </div>
            
            <div className="card hover:shadow-md transition-shadow">
              <div className="rounded-full bg-indigo-100 w-12 h-12 flex items-center justify-center mb-4">
                <Languages className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Multiple Languages</h3>
              <p className="text-gray-600">Support for 13+ languages including Spanish, French, German, Chinese, and Arabic.</p>
            </div>
            
            <div className="card hover:shadow-md transition-shadow">
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