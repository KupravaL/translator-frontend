import { useState, useEffect } from 'react';
import { useApiAuth } from '../services/api';

export default function TokenDebugInfo() {
  const { getTokenDiagnostics, refreshToken } = useApiAuth();
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Fetch token diagnostics on component mount and every minute
  useEffect(() => {
    fetchTokenInfo();
    
    const interval = setInterval(() => {
      fetchTokenInfo();
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  const fetchTokenInfo = async () => {
    try {
      const info = await getTokenDiagnostics();
      setTokenInfo(info);
    } catch (error) {
      console.error('Failed to fetch token info:', error);
    }
  };

  const handleRefreshToken = async () => {
    setLoading(true);
    try {
      await refreshToken();
      await fetchTokenInfo();
    } catch (error) {
      console.error('Failed to refresh token:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!tokenInfo) return null;

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8 border border-gray-100">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-white">JWT Token Info</h2>
            <p className="text-indigo-200 text-sm">Debug information for authentication token</p>
          </div>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="bg-white/20 text-white px-2 py-1 text-sm rounded-md hover:bg-white/30"
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>
      
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-sm text-gray-500">Current Token Status</div>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-3 h-3 rounded-full ${
                tokenInfo.currentToken?.remainingMinutes > 15 
                  ? 'bg-green-500' 
                  : tokenInfo.currentToken?.remainingMinutes > 5 
                    ? 'bg-yellow-500' 
                    : 'bg-red-500'
              }`}></div>
              <div className="font-medium">
                {tokenInfo.error 
                  ? 'Error retrieving token' 
                  : `Expires in ${tokenInfo.currentToken?.remainingMinutes || 0} minutes`
                }
              </div>
            </div>
          </div>
          
          <button
            onClick={handleRefreshToken}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : 'Refresh Token'}
          </button>
        </div>
        
        {tokenInfo.error ? (
          <div className="bg-red-50 p-4 rounded-md text-red-800 text-sm">
            {tokenInfo.error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="text-xs text-gray-500 mb-1">Issued At</div>
                <div className="text-sm font-medium">{tokenInfo.currentToken?.issuedAt}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="text-xs text-gray-500 mb-1">Expires At</div>
                <div className="text-sm font-medium">{tokenInfo.currentToken?.expiresAt}</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="text-xs text-gray-500 mb-1">Total Lifespan</div>
                <div className="text-sm font-medium">{tokenInfo.currentToken?.lifespanMinutes} minutes</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-md">
                <div className="text-xs text-gray-500 mb-1">Remaining Time</div>
                <div className="text-sm font-medium">{tokenInfo.currentToken?.remainingMinutes} minutes</div>
              </div>
            </div>
            
            {showDetails && tokenInfo.history && tokenInfo.history.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-3">Token History</h3>
                <div className="overflow-auto max-h-96">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lifespan</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issued At</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires At</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tokenInfo.history.map((entry, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {entry.source}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {Math.floor(entry.lifespan / 60)} min
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                            {new Date(entry.issuedAt * 1000).toLocaleTimeString()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                            {new Date(entry.expiresAt * 1000).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            <div className="mt-4 text-xs text-gray-500">
              <p>You can also use <code>window.checkTokenInfo()</code> in the browser console to check token information manually.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}