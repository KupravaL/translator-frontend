import { useState } from 'react';
import { ShoppingCart, CreditCard, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { balanceService } from '../services/api';

export default function PurchasePages({ onSuccess, className = "" }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pageAmount, setPageAmount] = useState(10);
  const [email, setEmail] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseInfo, setPurchaseInfo] = useState(null);
  const [step, setStep] = useState(1);

  // Predefined package options
  const packageOptions = [
    { pages: 10, label: '10 pages', price: 10 },
    { pages: 50, label: '50 pages', price: 50 },
    { pages: 100, label: '100 pages', price: 100 },
  ];

  // Custom amount handling
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setStep(1);
    setPurchaseInfo(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Reset state when closing
    setIsPurchasing(false);
    setPageAmount(10);
    setEmail('');
    setCustomAmount('');
    setIsCustom(false);
  };

  const handleCustomAmountChange = (e) => {
    const value = e.target.value;
    // Only allow numbers
    if (/^\d*$/.test(value)) {
      setCustomAmount(value);
      if (value) {
        setPageAmount(parseInt(value, 10));
      } else {
        setPageAmount(0);
      }
    }
  };

  const handlePackageSelect = (pages) => {
    setPageAmount(pages);
    setIsCustom(false);
    setCustomAmount('');
  };

  const handlePurchase = async () => {
    if (pageAmount <= 0) {
      toast.error('Please select a valid number of pages');
      return;
    }

    setIsPurchasing(true);

    try {
      // Use the balance service to purchase pages
      const result = await balanceService.purchasePages(pageAmount, email);
      
      // Set the purchase info for display
      setPurchaseInfo(result.payment);
      
      // Move to confirmation step
      setStep(2);
      
      toast.success('Purchase initiated successfully!');
      
      // If there's an onSuccess callback, call it
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('Purchase failed:', error);
      toast.error(typeof error === 'string' ? error : 'Failed to process purchase');
    } finally {
      setIsPurchasing(false);
    }
  };

  // Helper function to copy bank account to clipboard
  const copyBankAccount = () => {
    if (purchaseInfo?.bankAccount) {
      navigator.clipboard.writeText(purchaseInfo.bankAccount);
      toast.success('Bank account copied to clipboard');
    }
  };

  // Helper function to copy order ID to clipboard
  const copyOrderId = () => {
    if (purchaseInfo?.orderId) {
      navigator.clipboard.writeText(purchaseInfo.orderId);
      toast.success('Order ID copied to clipboard');
    }
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className={`button-primary flex items-center gap-2 ${className}`}
      >
        <ShoppingCart size={16} />
        <span>Buy Pages</span>
      </button>

      {/* Modal Backdrop */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          {/* Modal Content */}
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-6 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold text-white">Purchase Translation Pages</h2>
                  <p className="text-indigo-200 text-sm">Add more pages to your account</p>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="text-white hover:text-indigo-200"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {step === 1 ? (
                // Step 1: Select pages and provide email
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Package
                    </label>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {packageOptions.map((pkg) => (
                        <button
                          key={pkg.pages}
                          type="button"
                          onClick={() => handlePackageSelect(pkg.pages)}
                          className={`py-3 px-4 border ${
                            !isCustom && pageAmount === pkg.pages
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                          } rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                          <div className="font-bold">{pkg.label}</div>
                          <div className="text-xs mt-1">{pkg.price} GEL</div>
                        </button>
                      ))}
                    </div>

                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                        <input
                          type="checkbox"
                          checked={isCustom}
                          onChange={() => setIsCustom(!isCustom)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        Custom amount
                      </label>
                      {isCustom && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={customAmount}
                            onChange={handleCustomAmountChange}
                            placeholder="Enter number of pages"
                            className="form-input"
                          />
                          <p className="mt-1 text-sm text-gray-500">
                            Price: {pageAmount} GEL (1 GEL per page)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-6">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email (for payment confirmation)
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="form-input"
                    />
                  </div>

                  <div className="flex justify-between pt-4 border-t">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="button-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePurchase}
                      disabled={pageAmount <= 0 || isPurchasing}
                      className="button-primary flex items-center gap-2"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard size={16} />
                          Purchase {pageAmount} Pages
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                // Step 2: Payment instructions
                <>
                  <div className="mb-6">
                    <div className="bg-green-50 p-4 rounded-lg mb-6">
                      <div className="flex items-start">
                        <div className="shrink-0 pt-0.5">
                          <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-lg font-medium text-green-800">Order Created Successfully</h3>
                          <p className="text-green-700 mt-1">
                            Please complete payment using the details below.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Order ID:</h4>
                        <div className="flex items-center">
                          <code className="bg-gray-100 px-3 py-2 rounded-md text-sm font-mono flex-1">
                            {purchaseInfo?.orderId}
                          </code>
                          <button 
                            onClick={copyOrderId} 
                            className="ml-2 p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-md"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Include this as payment reference
                        </p>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Amount to Pay:</h4>
                        <p className="text-lg font-bold text-indigo-700">{purchaseInfo?.amount} GEL</p>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Bank Account:</h4>
                        <div className="flex items-center">
                          <code className="bg-gray-100 px-3 py-2 rounded-md text-sm font-mono flex-1">
                            {purchaseInfo?.bankAccount}
                          </code>
                          <button 
                            onClick={copyBankAccount} 
                            className="ml-2 p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-md"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="bg-amber-50 p-4 rounded-lg mt-4">
                        <p className="text-sm text-amber-800">
                          <strong>Important:</strong> After making the payment, an administrator will review and confirm your payment. 
                          Once confirmed, the pages will be added to your account automatically.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="button-primary"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}