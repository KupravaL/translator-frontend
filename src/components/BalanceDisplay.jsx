import { useState, useEffect } from 'react';
import { Database, PlusCircle, CreditCard, CheckCircle2, Cloud, Loader2, DollarSign, X, FileText, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { balanceService, useApiAuth } from '../services/api';
import googleDriveService from '../services/googleDriveService';

export default function BalanceDisplay() {
  const { registerAuthInterceptor } = useApiAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [pagesToAdd, setPagesToAdd] = useState(10);
  const [pagesToPurchase, setPagesToPurchase] = useState(1);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [email, setEmail] = useState("");
  const [currentPayment, setCurrentPayment] = useState(null);

  // Register Auth Interceptor and check auth status on mount
  useEffect(() => {
    registerAuthInterceptor();
    checkAuthStatus();
    fetchBalance();
  }, []);

  // Function to fetch balance data
  const fetchBalance = async () => {
    setIsLoading(true);
    try {
      const data = await balanceService.getBalance();
      setBalance(data);
      setIsError(false);
    } catch (error) {
      console.error('Balance fetch error:', error);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Set up periodic refetch (every 60 seconds)
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchBalance();
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  // Check authentication status
  const checkAuthStatus = async () => {
    try {
      const status = await googleDriveService.checkAuthStatus();
      setIsAuthenticated(status.authenticated);
    } catch (error) {
      console.error('Failed to check Google Drive auth status:', error);
    }
  };

  // Handle authentication
  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    try {
      await googleDriveService.authenticate();
      await checkAuthStatus();
      toast.success('Successfully connected to Google Drive');
    } catch (error) {
      console.error('Authentication error:', error);
      toast.error('Google Drive authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle adding pages
  const handleAddPages = async () => {
    if (pagesToAdd < 1) {
      toast.error('Pages must be greater than 0');
      return;
    }
    
    setIsPending(true);
    try {
      await balanceService.addPages(pagesToAdd);
      toast.success(`Successfully added ${pagesToAdd} pages to your balance`);
      await fetchBalance();  // Refresh balance after adding pages
      setIsAdding(false);
    } catch (error) {
      console.error('Add pages error:', error);
      toast.error(error.response?.data?.error || 'Failed to add pages');
    } finally {
      setIsPending(false);
    }
  };
  
  // Handle page purchase form submission
  const handlePurchaseFormSubmit = async (e) => {
    e.preventDefault();
    
    if (pagesToPurchase < 1) {
      toast.error('Pages must be greater than 0');
      return;
    }
    
    if (!email) {
      toast.warning('Please enter your email to receive invoice and payment instructions');
      return;
    }
    
    setIsPending(true);
    try {
      const result = await balanceService.purchasePages(pagesToPurchase, email);
      setCurrentPayment(result.payment);
      setShowInvoice(true);
      setIsPurchasing(false);
      
      toast.success('Payment request created', {
        description: 'Invoice and payment instructions have been sent to your email'
      });
    } catch (error) {
      console.error('Purchase error:', error);
      toast.error(error.response?.data?.error || 'Failed to process payment');
    } finally {
      setIsPending(false);
    }
  };
  
  // Close invoice modal
  const closeInvoice = () => {
    setShowInvoice(false);
    setCurrentPayment(null);
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="balance-display bg-white/50">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
            <Database className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="animate-pulse h-5 w-36 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Error State
  if (isError) {
    return (
      <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-center text-red-800 border border-red-200">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mr-3">
          <Database className="h-4 w-4 text-red-500" />
        </div>
        <span className="text-sm">Failed to load balance. Please refresh the page.</span>
      </div>
    );
  }

  return (
    <div className="balance-display">
      {/* Invoice Modal */}
      {showInvoice && currentPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative">
            <button 
              onClick={closeInvoice}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
            
            <div className="text-center mb-6">
              <div className="flex items-center justify-center mb-2">
                <FileText className="text-indigo-600 h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Payment Invoice</h2>
              <p className="text-gray-500 text-sm">Order ID: {currentPayment.orderId}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Pages:</span>
                <span className="font-medium">{currentPayment.pages}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Price per page:</span>
                <span className="font-medium">1 GEL</span>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-indigo-600">{currentPayment.amount} GEL</span>
              </div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg mb-4">
              <h3 className="font-medium text-green-800 mb-2">Payment Instructions</h3>
              <p className="text-sm text-gray-700 mb-2">Please transfer the payment to:</p>
              <div className="bg-white p-3 rounded border border-gray-200 font-mono text-sm overflow-x-auto mb-2">
                {currentPayment.bankAccount}
              </div>
              <p className="text-sm text-gray-700">Please include your <span className="font-semibold">Order ID</span> in the payment reference.</p>
            </div>
            
            <div className="flex items-center bg-blue-50 p-4 rounded-lg mb-4">
              <Mail className="text-blue-500 mr-2 h-5 w-5 flex-shrink-0" />
              <p className="text-sm text-gray-700">
                We've sent these payment instructions to your email ({email}).
              </p>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
              Once your payment is processed, the pages will be added to your balance.
            </p>
            
            <div className="flex justify-end">
              <button 
                onClick={closeInvoice}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
            <Database className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <span className="text-sm text-gray-500">Translation Balance</span>
            <div className="font-semibold text-gray-800">
              <span className="text-indigo-600">{balance?.pagesBalance || 0}</span> pages
            </div>
          </div>
        </div>

        {/* Purchase Pages UI */}
        {isPurchasing ? (
          <form onSubmit={handlePurchaseFormSubmit} className="flex items-center gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                <input
                  type="number"
                  className="w-20 px-3 py-2 border-none focus:outline-none focus:ring-0"
                  min="1"
                  value={pagesToPurchase}
                  onChange={(e) => setPagesToPurchase(parseInt(e.target.value) || 1)}
                  required
                />
                <span className="pr-3 text-sm text-gray-500">pages</span>
              </div>
              
              <div className="flex flex-col w-full">
                <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                  <input
                    type="email"
                    className="w-full px-3 py-2 border-none focus:outline-none focus:ring-0"
                    placeholder="Your email address *"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <span className="text-xs text-gray-500 mt-1">
                  Required to receive invoice and payment instructions
                </span>
              </div>
              
              <div className="text-sm text-gray-600">
                Total: <span className="font-semibold">{pagesToPurchase} GEL</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                className="button-primary text-sm py-1.5 px-3 flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Purchase</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="button-secondary text-sm py-1.5 px-3 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg"
                onClick={() => setIsPurchasing(false)}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Add Pages UI */}
            {isAdding ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                  <input
                    type="number"
                    className="w-24 px-3 py-2 border-none focus:outline-none focus:ring-0"
                    min="1"
                    value={pagesToAdd}
                    onChange={(e) => setPagesToAdd(parseInt(e.target.value) || 0)}
                  />
                  <span className="pr-3 text-sm text-gray-500">pages</span>
                </div>
                <button
                  className="button-primary text-sm py-1.5 px-3 flex items-center gap-1"
                  onClick={handleAddPages}
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Add Pages</span>
                    </>
                  )}
                </button>
                <button
                  className="button-secondary text-sm py-1.5 px-3"
                  onClick={() => setIsAdding(false)}
                  disabled={isPending}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  className="flex items-center text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg gap-1 transition-colors"
                  onClick={() => setIsAdding(true)}
                >
                  <PlusCircle className="h-4 w-4" />
                  Add Pages
                </button>
                
                <button
                  className="flex items-center text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg gap-1 transition-colors"
                  onClick={() => {
                    setPagesToPurchase(1);
                    setIsPurchasing(true);
                  }}
                >
                  <DollarSign className="h-4 w-4" />
                  Buy Pages
                </button>
              </div>
            )}
          </>
        )}

        {/* Google Drive Authentication Button */}
        <button
          className={`flex items-center text-sm text-white px-3 py-1.5 rounded-lg gap-1 transition-colors ${
            isAuthenticated ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
          onClick={handleAuthenticate}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Cloud className="h-4 w-4" />
              {isAuthenticated ? 'Connected to Drive' : 'Connect to Drive'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}