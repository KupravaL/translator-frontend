// Google Drive functionality temporarily disabled
import { XCircle } from 'lucide-react';

export default function GoogleDriveSettings() {
  return (
    <div className="p-4 bg-white rounded-lg shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <XCircle className="h-5 w-5 text-gray-400 mr-3" />
          <h3 className="text-base font-medium text-gray-700">Google Drive</h3>
        </div>
        <div className="text-sm text-gray-500">
          Temporarily disabled
        </div>
      </div>
      
      <div className="mt-2 text-sm text-gray-500">
        Google Drive integration is temporarily unavailable.
      </div>
    </div>
  );
}