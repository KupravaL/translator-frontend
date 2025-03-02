import { useState, useEffect, useCallback } from 'react';
import { CreditCard, RefreshCw, Plus, ShoppingCart } from 'lucide-react';
import { balanceService } from '../services/api';
import { toast } from 'sonner';
import PurchasePages from './PurchasePages';
import AddPages from './AddPages';

export default function BalanceDisplay() {
  const [balance, setBalance] = useState({
    pagesBalance: null,
    pagesUsed: null,
    lastUsed: null,
    isLoading: true,
    error: null,
    isFromCache: false
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch balance on component mount
  const fetchBalance = useCallback(async (showToast = false) => {
    try {
      setIsRefreshing(true);
      const balanceData = await balanceService.getBalance();
      
      setBalance({
        pagesBalance: balanceData.pagesBalance,
        pagesUsed: balanceData.pagesUsed,
        lastUsed: balanceData.lastUsed,
        isLoading: false,
        error: null,
        isFromCache: balanceData.isFromCache || false,
        isDefault: balanceData.isDefault || false
      });
      
      if (showToast) {
        if (balanceData.isFromCache) {
          toast.info('Using cached balance. Will update when connection is restored.');
        } else if (balanceData.isDefault) {
          toast.warning('Unable to fetch your balance. Showing default values.');
        } else {
          toast.success('Balance refreshed successfully!');
        }
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      setBalance(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load balance'
      }));
      
      if (showToast) {
        toast.error('Failed to refresh balance.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    
    // Set up periodic refresh every 2 minutes
    const intervalId = setInterval(() => {
      fetchBalance();
    }, 2 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [fetchBalance]);

  const handleManualRefresh = () => {
    // Invalidate cache first to force a fresh fetch
    balanceService.invalidateCache();
    fetchBalance(true);
  };

  // Handle balance update after purchase or add pages
  const handleBalanceUpdate = () => {
    // Short delay to allow backend to update
    setTimeout(() => {
      balanceService.invalidateCache();
      fetchBalance(true);
    }, 500);
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8 border border-gray-100">
      <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center">
          <CreditCard className="h-5 w-5 text-indigo-600 mr-2" />
          <h3 className="text-lg font-medium text-gray-800">Pages Balance</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-md text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            title="Refresh balance"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="px-6 py-4">
        {balance.isLoading ? (
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        ) : balance.error ? (
          <div className="text-red-500 text-sm flex items-center">
            <span>Error: {balance.error}</span>
            <button 
              onClick={handleManualRefresh}
              className="ml-2 text-indigo-600 underline hover:text-indigo-800"
            >
              Retry
            </button>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="flex items-center mb-1">
                  <span className="text-gray-600">Available Pages:</span>
                  <span className="font-semibold text-indigo-700 text-lg ml-2">{balance.pagesBalance}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500">Pages Used:</span>
                  <span className="text-gray-700 ml-2">{balance.pagesUsed}</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <AddPages 
                  onSuccess={handleBalanceUpdate} 
                  className="text-sm px-3 py-1.5"
                />
                <PurchasePages 
                  onSuccess={handleBalanceUpdate}
                  className="text-sm px-3 py-1.5"
                />
              </div>
            </div>
            
            {balance.isFromCache && (
              <div className="mt-2 text-amber-600 text-xs flex items-center">
                <span>Using cached balance data</span>
                <button 
                  onClick={handleManualRefresh}
                  className="ml-1 text-indigo-600 hover:text-indigo-800"
                >
                  Refresh
                </button>
              </div>
            )}
            {balance.isDefault && (
              <div className="mt-2 text-red-600 text-xs flex items-center">
                <span>Using default balance. Please sign in again.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}