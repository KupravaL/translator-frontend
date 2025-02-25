import { useState, useEffect } from 'react';
import { Download, FileText, File, ChevronDown, Loader2, Cloud, Folder, ChevronRight, Plus, ArrowLeft } from 'lucide-react';
import { documentService, useApiAuth } from '../services/api';
import googleDriveService from '../services/googleDriveService';
import { toast } from 'sonner';

// Folder Selector Component
function FolderSelector({ onSelect, onCancel, googleDriveService }) {
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderStack, setFolderStack] = useState([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async (folderId = null) => {
    setIsLoading(true);
    try {
      const foldersData = await googleDriveService.listFolders(folderId);
      setFolders(foldersData);
      setCurrentFolder(folderId);
    } catch (error) {
      console.error('Error loading folders:', error);
      toast.error('Failed to load Google Drive folders');
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToFolder = (folder) => {
    setFolderStack([...folderStack, { id: currentFolder, name: getFolderName() }]);
    loadFolders(folder.id);
  };

  const navigateBack = () => {
    if (folderStack.length > 0) {
      const prevFolder = folderStack[folderStack.length - 1];
      setFolderStack(folderStack.slice(0, -1));
      loadFolders(prevFolder.id);
    }
  };

  const getFolderName = () => {
    if (!currentFolder) return 'My Drive';
    const folder = folders.find(f => f.id === currentFolder);
    return folder ? folder.name : 'Selected Folder';
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    setIsLoading(true);
    try {
      const newFolder = await googleDriveService.createFolder(newFolderName, currentFolder);
      setNewFolderName('');
      setIsCreatingFolder(false);
      toast.success(`Folder "${newFolderName}" created successfully`);
      loadFolders(currentFolder);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFolder = () => {
    onSelect({
      id: currentFolder,
      name: getFolderName()
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden w-full max-w-md">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium">Select Google Drive Folder</h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
          &times;
        </button>
      </div>

      {/* Breadcrumb navigation */}
      <div className="px-4 py-2 bg-gray-50 flex items-center space-x-1 text-sm overflow-x-auto">
        <button 
          onClick={() => { setFolderStack([]); loadFolders(null); }}
          className="text-blue-600 hover:underline flex items-center whitespace-nowrap"
        >
          My Drive
        </button>
        
        {folderStack.map((folder, index) => (
          <div key={folder.id || index} className="flex items-center whitespace-nowrap">
            <ChevronRight size={14} className="text-gray-500 mx-1" />
            <button 
              onClick={() => {
                const newStack = folderStack.slice(0, index + 1);
                setFolderStack(newStack.slice(0, -1));
                loadFolders(folder.id);
              }}
              className="text-blue-600 hover:underline"
            >
              {folder.name}
            </button>
          </div>
        ))}
        
        {currentFolder && !folderStack.find(f => f.id === currentFolder) && (
          <>
            <ChevronRight size={14} className="text-gray-500 mx-1" />
            <span className="font-medium whitespace-nowrap">{getFolderName()}</span>
          </>
        )}
      </div>

      {/* Folder list */}
      <div className="p-4 max-h-60 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-2">
            {currentFolder && (
              <button 
                onClick={navigateBack}
                className="flex items-center w-full p-2 hover:bg-gray-100 rounded text-left"
              >
                <ArrowLeft size={18} className="text-gray-500 mr-2" />
                <span>Back</span>
              </button>
            )}
            
            {folders.length === 0 && !isCreatingFolder && (
              <div className="text-gray-500 text-center py-4">
                No folders found. Create a new folder?
              </div>
            )}
            
            {folders.map(folder => (
              <div 
                key={folder.id}
                className="flex items-center p-2 hover:bg-gray-100 rounded cursor-pointer"
                onClick={() => navigateToFolder(folder)}
              >
                <Folder size={18} className="text-blue-600 mr-2" />
                <span>{folder.name}</span>
              </div>
            ))}
            
            {isCreatingFolder && (
              <div className="flex items-center p-2 bg-blue-50 rounded">
                <Folder size={18} className="text-blue-600 mr-2" />
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="New folder name"
                  className="flex-1 border-none bg-transparent focus:outline-none"
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                  }}
                />
                <button 
                  onClick={handleCreateFolder}
                  className="text-blue-600 text-sm font-medium ml-2"
                >
                  Create
                </button>
                <button 
                  onClick={() => setIsCreatingFolder(false)}
                  className="text-gray-500 text-sm ml-2"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-200 flex justify-between">
        <button
          onClick={() => setIsCreatingFolder(true)}
          className="flex items-center text-blue-600 text-sm font-medium"
          disabled={isLoading}
        >
          <Plus size={16} className="mr-1" />
          New Folder
        </button>
        
        <div className="space-x-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSelectFolder}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            disabled={isLoading}
          >
            Save Here
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Download Button Component
export default function DocumentDownloadButton({ 
  text, 
  language, 
  onError, 
  onSuccess, 
  disabled,
  className 
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isGoogleDriveAuthenticated, setIsGoogleDriveAuthenticated] = useState(false);
  const [isCheckingAuthStatus, setIsCheckingAuthStatus] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [exportingType, setExportingType] = useState(null);
  const { registerAuthInterceptor } = useApiAuth();

  // Register auth interceptor and check auth status on mount
  useEffect(() => {
    registerAuthInterceptor();
    checkGoogleDriveAuthStatus();
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.download-dropdown-container')) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const checkGoogleDriveAuthStatus = async () => {
    setIsCheckingAuthStatus(true);
    try {
      const status = await googleDriveService.checkAuthStatus();
      setIsGoogleDriveAuthenticated(status.authenticated);
    } catch (error) {
      console.error('Failed to check Google Drive auth status:', error);
    } finally {
      setIsCheckingAuthStatus(false);
    }
  };

  const handleExport = async (type) => {
    if (disabled || isExporting) return;
    
    setIsExporting(true);
    setExportType(type);
    
    try {
      const fileName = `translated_document_${new Date().getTime()}.${type}`;
      
      let result;
      if (type === 'pdf') {
        result = await documentService.exportToPdf(text, fileName);
      } else if (type === 'docx') {
        result = await documentService.exportToDocx(text, fileName);
      }
      
      // Create and download the file
      const linkSource = `data:application/${type === 'pdf' ? 'pdf' : 'vnd.openxmlformats-officedocument.wordprocessingml.document'};base64,${result[type === 'pdf' ? 'pdfData' : 'docxData']}`;
      const downloadLink = document.createElement('a');
      
      downloadLink.href = linkSource;
      downloadLink.download = fileName;
      downloadLink.click();
      
      toast.success(`Document exported as ${type.toUpperCase()} successfully`);
      onSuccess?.();
    } catch (error) {
      console.error(`Export to ${type} failed:`, error);
      toast.error(error.response?.data?.error || `Failed to export as ${type.toUpperCase()}`);
      onError?.(error.response?.data?.error || `Failed to export as ${type.toUpperCase()}`);
    } finally {
      setIsExporting(false);
      setExportType(null);
      setShowDropdown(false);
    }
  };

  // Handle Google Drive authentication
  const handleGoogleDriveAuth = async () => {
    try {
      await googleDriveService.authenticate();
      await checkGoogleDriveAuthStatus();
      toast.success('Connected to Google Drive');
    } catch (error) {
      console.error('Google Drive authentication error:', error);
      toast.error('Failed to connect to Google Drive');
    }
  };

  // Initiate folder selection for Drive export
  const handleExportToDriveWithFolder = (type) => {
    if (!isGoogleDriveAuthenticated) {
      handleGoogleDriveAuth().then(() => {
        if (isGoogleDriveAuthenticated) {
          setExportingType(type);
          setShowFolderSelector(true);
          setShowDropdown(false);
        }
      });
    } else {
      setExportingType(type);
      setShowFolderSelector(true);
      setShowDropdown(false);
    }
  };

  // Export directly to Google Drive
  const handleExportToDrive = async (type, folder = null) => {
    if (disabled || isExporting) return;
    
    setIsExporting(true);
    setExportType(`drive-${type}`);
    
    try {
      // Check if authenticated first
      if (!isGoogleDriveAuthenticated) {
        await handleGoogleDriveAuth();
        // Check again after authentication attempt
        const status = await googleDriveService.checkAuthStatus();
        if (!status.authenticated) {
          throw new Error('Google Drive authentication required');
        }
        setIsGoogleDriveAuthenticated(true);
      }
      
      const fileName = `translated_document_${new Date().getTime()}.${type}`;
      
      // Include folder information if provided
      const options = folder ? { folderId: folder.id } : {};
      
      let result;
      if (type === 'pdf') {
        result = await documentService.exportToDriveAsPdf(text, fileName, options);
      } else if (type === 'docx') {
        result = await documentService.exportToDriveAsDocx(text, fileName, options);
      }
      
      console.log('Export response:', result);
      
      // More flexible success checking
      if (
        (result.success) || 
        (result.drive_info?.success) ||
        (result.message && typeof result.message === 'string' && result.message.toLowerCase().includes('success')) ||
        (typeof result === 'string' && result.toLowerCase().includes('success')) ||
        result.web_view_link || 
        result.drive_info?.web_view_link ||
        result.file_id ||
        result.drive_info?.file_id
      ) {
        // Determine the view link if available
        const viewLink = 
          result.drive_info?.web_view_link || 
          result.web_view_link || 
          null;
        
        const folderText = folder ? ` to "${folder.name}"` : '';
        
        toast.success(`Successfully saved to Google Drive${folderText} as ${type.toUpperCase()}!`, {
          description: 'Your document is now available in your Drive',
          ...(viewLink && {
            action: {
              label: 'View',
              onClick: () => window.open(viewLink, '_blank')
            }
          })
        });
        
        onSuccess?.();
      } else {
        // If we got here but the response contains a success message, it's actually successful
        if (
          (result.message && typeof result.message === 'string' && 
          (result.message.toLowerCase().includes('success') || 
           result.message.toLowerCase().includes('generated')))
        ) {
          const folderText = folder ? ` to "${folder.name}"` : '';
          toast.success(`Successfully saved to Google Drive${folderText} as ${type.toUpperCase()}!`);
          onSuccess?.();
        } else {
          throw new Error(
            result.message || 
            result.error || 
            `Failed to save to Google Drive as ${type.toUpperCase()}`
          );
        }
      }
    } catch (error) {
      console.error(`Export to Drive as ${type} failed:`, error);
      
      // Don't treat success messages as errors
      if (
        error.message && 
        (error.message.toLowerCase().includes('success') || 
         error.message.toLowerCase().includes('generated successfully'))
      ) {
        const folderText = folder ? ` to "${folder.name}"` : '';
        toast.success(`Successfully saved to Google Drive${folderText} as ${type.toUpperCase()}!`);
        onSuccess?.();
      } else {
        // Improved error handling with specific messages
        if (error.message?.includes('token') || error.message?.includes('authentication')) {
          toast.error('Authentication error. Please reconnect to Google Drive.');
          setIsGoogleDriveAuthenticated(false);
        } else {
          toast.error(error.message || `Failed to export to Google Drive as ${type.toUpperCase()}`);
          onError?.(error.message || `Failed to export to Google Drive as ${type.toUpperCase()}`);
        }
      }
    } finally {
      setIsExporting(false);
      setExportType(null);
      setShowDropdown(false);
      setShowFolderSelector(false);
    }
  };

  return (
    <div className={`relative download-dropdown-container ${className}`}>
      <button
        type="button"
        className="button-primary flex items-center gap-2"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled || isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {exportType?.startsWith('drive') 
              ? `Saving to Drive...` 
              : `Exporting ${exportType?.toUpperCase()}...`}
          </>
        ) : (
          <>
            <Download size={16} />
            Download <ChevronDown size={14} className="ml-1" />
          </>
        )}
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg z-10 border border-gray-100 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-700">Download Options</h3>
          </div>
          
          <div className="p-1">
            {/* Local download options */}
            <button
              className="flex items-center w-full px-3 py-2.5 text-sm text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md"
              onClick={() => handleExport('pdf')}
            >
              <div className="bg-red-100 rounded-md p-1.5 mr-2.5">
                <FileText size={16} className="text-red-600" />
              </div>
              Download as PDF
            </button>
            <button
              className="flex items-center w-full px-3 py-2.5 text-sm text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md"
              onClick={() => handleExport('docx')}
            >
              <div className="bg-blue-100 rounded-md p-1.5 mr-2.5">
                <File size={16} className="text-blue-600" />
              </div>
              Download as DOCX
            </button>
            
            {/* Divider */}
            <div className="my-1 border-t border-gray-100"></div>
            
            {/* Google Drive options */}
            <div className="px-3 py-2">
              <div className="flex items-center">
                <Cloud size={16} className="mr-2 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Google Drive</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 mb-2">Save directly to your Google Drive</p>
              
              {isGoogleDriveAuthenticated ? (
                <div className="flex flex-col gap-1">
                  <button
                    className="flex items-center w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md"
                    onClick={() => handleExportToDriveWithFolder('pdf')}
                  >
                    <div className="bg-red-50 rounded-md p-1 mr-2">
                      <FileText size={14} className="text-red-500" />
                    </div>
                    Save to Drive as PDF
                  </button>
                  <button
                    className="flex items-center w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-md"
                    onClick={() => handleExportToDriveWithFolder('docx')}
                  >
                    <div className="bg-blue-50 rounded-md p-1 mr-2">
                      <File size={14} className="text-blue-500" />
                    </div>
                    Save to Drive as DOCX
                  </button>
                </div>
              ) : (
                <button
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md hover:bg-gray-50 flex items-center justify-center gap-2"
                  onClick={handleGoogleDriveAuth}
                  disabled={isCheckingAuthStatus}
                >
                  {isCheckingAuthStatus ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Cloud size={14} />
                  )}
                  Connect to Google Drive
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Folder Selector Modal */}
      {showFolderSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <FolderSelector
            onSelect={(folder) => {
              setSelectedFolder(folder);
              handleExportToDrive(exportingType, folder);
            }}
            onCancel={() => setShowFolderSelector(false)}
            googleDriveService={googleDriveService}
          />
        </div>
      )}
    </div>
  );
}