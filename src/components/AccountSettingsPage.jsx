import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { UserCog, CreditCard, ExternalLink, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { balanceService, useApiAuth } from '../services/api';
import GoogleDriveSettings from './GoogleDriveSettings';

export default function AccountSettings() {
  const { user, isLoaded } = useUser();
  const { registerAuthInterceptor } = useApiAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [balance, setBalance] = useState(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Register auth interceptor on mount
  useEffect(() => {
    registerAuthInterceptor();
    fetchUserBalance();
  }, []);

  // Fetch user balance
  const fetchUserBalance = async () => {
    setIsLoadingBalance(true);
    try {
      const data = await balanceService.getBalance();
      setBalance(data);
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      toast.error('Failed to load account balance');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Account Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage your profile, integrations, and preferences
          </p>
        </div>

        {/* Tabs and Content */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
          <div className="flex border-b border-gray-200">
            <button
              className={`px-4 py-4 text-sm font-medium flex items-center gap-2 ${
                activeTab === 'profile'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('profile')}
            >
              <UserCog className="h-4 w-4" />
              Profile
            </button>
            <button
              className={`px-4 py-4 text-sm font-medium flex items-center gap-2 ${
                activeTab === 'integrations'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('integrations')}
            >
              <Cloud className="h-4 w-4" />
              Integrations
            </button>
            <button
              className={`px-4 py-4 text-sm font-medium flex items-center gap-2 ${
                activeTab === 'billing'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('billing')}
            >
              <CreditCard className="h-4 w-4" />
              Billing
            </button>
          </div>

          <div className="p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-800">Profile Information</h2>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-full overflow-hidden">
                    {user.imageUrl ? (
                      <img 
                        src={user.imageUrl} 
                        alt={user.fullName || user.username} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-600 text-lg font-bold">
                        {(user.firstName?.[0] || '') + (user.lastName?.[0] || '')}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium text-gray-800">
                      {user.fullName || user.username}
                    </h3>
                    <p className="text-gray-600">{user.primaryEmailAddress?.emailAddress}</p>
                    <div className="mt-2">
                      <a 
                        href="https://accounts.clerk.dev/user" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm inline-flex items-center text-indigo-600 hover:text-indigo-700"
                      >
                        Edit profile on Clerk <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
                
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">Account Information</h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-gray-900">{user.primaryEmailAddress?.emailAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">User ID</dt>
                      <dd className="mt-1 text-sm text-gray-500 font-mono">{user.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Created On</dt>
                      <dd className="mt-1 text-gray-900">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Last Sign In</dt>
                      <dd className="mt-1 text-gray-900">
                        {new Date(user.lastSignInAt).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-800">Integrations</h2>
                <p className="text-gray-600">
                  Connect your account with external services to enhance your experience.
                </p>
                
                {/* Google Drive Integration */}
                <div className="mt-6">
                  <GoogleDriveSettings />
                </div>
                
                {/* Placeholder for future integrations */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mt-4">
                  <p className="text-sm text-gray-600">
                    More integrations coming soon! Stay tuned for additional features.
                  </p>
                </div>
              </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-800">Billing & Usage</h2>
                
                {/* Current Balance */}
                <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">Current Balance</h3>
                  
                  {isLoadingBalance ? (
                    <div className="animate-pulse h-10 bg-gray-200 rounded w-48"></div>
                  ) : balance ? (
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-bold text-indigo-600">{balance.pagesBalance}</span>
                      <span className="text-gray-600 pb-1">pages remaining</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">Unable to load balance information</div>
                  )}
                  
                  <div className="mt-4 text-sm text-gray-600">
                    <p className="mb-2">You have used {balance?.pagesUsed || 0} pages so far.</p>
                    <p>Each page costs approximately 1 credit from your balance.</p>
                  </div>
                  
                  <div className="mt-4">
                    <button
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                      onClick={() => window.location.href = '/'}
                    >
                      Add More Pages
                    </button>
                  </div>
                </div>
                
                {/* Pricing Information */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">Pricing Information</h3>
                  <div className="text-sm text-gray-600">
                    <p className="mb-2">Our standard pricing:</p>
                    <ul className="list-disc ml-5 space-y-1">
                      <li>10 free pages for new accounts</li>
                      <li>$0.10 per additional page</li>
                      <li>Bulk discounts available for high-volume usage</li>
                    </ul>
                    <p className="mt-3">
                      For special pricing or enterprise plans, please contact our support team.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}