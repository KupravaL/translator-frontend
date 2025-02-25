// Google Drive functionality temporarily disabled
// This component is currently disabled

import { useState } from 'react';
import { Folder } from 'lucide-react';

export default function FolderSelector({ onSelect, onCancel }) {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden w-full max-w-md p-4 text-center">
      <h3 className="text-lg font-medium mb-4">Google Drive Functionality Disabled</h3>
      <p className="text-gray-500 mb-4">
        The Google Drive integration has been temporarily disabled.
      </p>
      <div className="flex justify-center">
        <Folder className="text-gray-400 w-12 h-12 mb-4" />
      </div>
      <button
        onClick={onCancel}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Close
      </button>
    </div>
  );
}