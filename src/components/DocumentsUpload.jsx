import { useState, useRef } from 'react'
import { Upload, X, FileText, ArrowRightLeft } from 'lucide-react'

const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'fa', label: 'Persian' },
  { value: 'ka', label: 'Georgian'}
]

export default function DocumentsUpload({ onTranslate, isLoading, onCancel }) {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [fromLang, setFromLang] = useState('en')
  const [toLang, setToLang] = useState('ru')
  
  const fileInputRef = useRef(null)
  
  // Handle file drop
  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }
  
  // Handle file selection from dialog
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }
  
  // Process selected file
  const handleFile = (file) => {
    if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
      alert('Unsupported file type. Please upload a PDF or image file.')
      return
    }
    
    if (file.size > 20 * 1024 * 1024) { // 20MB
      alert('File too large. Maximum size is 20MB.')
      return
    }
    
    setFile(file)
  }
  
  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }
  
  // Open file dialog
  const onButtonClick = () => {
    fileInputRef.current.click()
  }
  
  // Reset file selection
  const resetFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
  
  // Swap languages
  const swapLanguages = () => {
    setFromLang(toLang)
    setToLang(fromLang)
  }
  
  // Handle translation
  const handleTranslate = () => {
    if (file && fromLang && toLang) {
      onTranslate(file, fromLang, toLang)
    }
  }
  
  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1">
          <label htmlFor="fromLang" className="block text-sm font-medium text-gray-700 mb-1">
            From Language
          </label>
          <div className="form-select-container">
            <select
              id="fromLang"
              className="form-select w-full"
              value={fromLang}
              onChange={(e) => setFromLang(e.target.value)}
              disabled={isLoading}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="hidden sm:flex items-end pb-1">
          <button 
            onClick={swapLanguages} 
            className="p-2 rounded-full hover:bg-gray-100"
            disabled={isLoading}
            title="Swap languages"
          >
            <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
          </button>
        </div>
        
        <div className="flex-1">
          <label htmlFor="toLang" className="block text-sm font-medium text-gray-700 mb-1">
            To Language
          </label>
          <div className="form-select-container">
            <select
              id="toLang"
              className="form-select w-full"
              value={toLang}
              onChange={(e) => setToLang(e.target.value)}
              disabled={isLoading}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {!file ? (
        <div 
          className={`upload-area ${
            dragActive ? 'upload-area-active' : 'upload-area-inactive'
          }`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={SUPPORTED_FILE_TYPES.join(',')}
            onChange={handleFileChange}
            disabled={isLoading}
          />
          
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
              <Upload className="w-8 h-8 text-indigo-600" />
            </div>
            <p className="text-lg font-medium text-gray-700">
              Drag & drop or click to upload
            </p>
            <p className="text-sm text-gray-500">
              Supported formats: PDF, JPEG, PNG, WEBP (max 20MB)
            </p>
            <button
              type="button"
              onClick={onButtonClick}
              className="button-primary mt-2"
              disabled={isLoading}
            >
              Select File
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center mr-3">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.split('/')[1].toUpperCase()}
                </p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={resetFile}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
              disabled={isLoading}
              title="Remove file"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-6">
            {isLoading ? (
              <button
                type="button"
                onClick={onCancel}
                className="button-secondary w-full sm:w-auto"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTranslate}
                className="button-primary w-full sm:w-auto"
                disabled={!file || !fromLang || !toLang}
              >
                Translate Document
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}