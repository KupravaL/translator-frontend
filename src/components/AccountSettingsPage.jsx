import { useState } from 'react';
import { UserProfile, useUser } from '@clerk/clerk-react';
import TokenDebugInfo from './TokenDebug';

export default function AccountSettingsPage() {
  const { user, isLoaded } = useUser();
  const [showTokenDebug, setShowTokenDebug] = useState(false);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-center bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
            Account Settings
          </h1>
          <p className="text-lg text-gray-600 text-center max-w-2xl mx-auto">
            Manage your account information and preferences
          </p>
        </div>

        {/* Token Debug Toggle */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setShowTokenDebug(!showTokenDebug)}
            className="text-sm px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            {showTokenDebug ? 'Hide Token Debug' : 'Show Token Debug'}
          </button>
        </div>
        
        {/* Token Debug Info */}
        {showTokenDebug && <TokenDebugInfo />}

        {/* User Profile */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-6 py-4">
            <h2 className="text-xl font-semibold text-white">Your Profile</h2>
            <p className="text-indigo-200 text-sm">Manage your personal information</p>
          </div>
          <div className="p-6">
            <UserProfile />
          </div>
        </div>
      </div>
    </div>
  );
}