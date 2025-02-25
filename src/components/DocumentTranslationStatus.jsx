import { useState } from 'react'
import { Download, FileText, File, ChevronDown, Loader2 } from 'lucide-react'
import { documentService } from '../services/api'

export default function DocumentDownloadButton({ 
  text, 
  language, 
  onError, 
  onSuccess, 
  disabled,
  className 
}) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportType, setExportType] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const handleExport = async (type) => {
    if (disabled || isExporting) return
    
    setIsExporting(true)
    setExportType(type)
    
    try {
      const fileName = `translated_document_${new Date().getTime()}.${type}`
      
      let result
      if (type === 'pdf') {
        result = await documentService.exportToPdf(text, fileName)
      } else if (type === 'docx') {
        result = await documentService.exportToDocx(text, fileName)
      }
      
      // Create and download the file
      const linkSource = `data:application/${type === 'pdf' ? 'pdf' : 'vnd.openxmlformats-officedocument.wordprocessingml.document'};base64,${result[type === 'pdf' ? 'pdfData' : 'docxData']}`
      const downloadLink = document.createElement('a')
      
      downloadLink.href = linkSource
      downloadLink.download = fileName
      downloadLink.click()
      
      onSuccess?.()
    } catch (error) {
      console.error(`Export to ${type} failed:`, error)
      onError?.(error.response?.data?.error || `Failed to export as ${type.toUpperCase()}`)
    } finally {
      setIsExporting(false)
      setExportType(null)
      setShowDropdown(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        className="button-primary flex items-center gap-2"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled || isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Exporting {exportType?.toUpperCase()}...
          </>
        ) : (
          <>
            <Download size={16} />
            Download <ChevronDown size={14} className="ml-1" />
          </>
        )}
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg z-10 border border-gray-100 py-1 overflow-hidden">
          <button
            className="flex items-center w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            onClick={() => handleExport('pdf')}
          >
            <div className="bg-red-100 rounded-md p-1.5 mr-2.5">
              <FileText size={16} className="text-red-600" />
            </div>
            Export as PDF
          </button>
          <button
            className="flex items-center w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            onClick={() => handleExport('docx')}
          >
            <div className="bg-blue-100 rounded-md p-1.5 mr-2.5">
              <File size={16} className="text-blue-600" />
            </div>
            Export as DOCX
          </button>
        </div>
      )}
    </div>
  )
}