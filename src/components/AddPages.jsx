import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { balanceService } from '../services/api';

export default function AddPages({ onSuccess, className = "", isAdmin = false }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pageAmount, setPageAmount] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentId, setPaymentId] = useState('');

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Reset state when closing
    setPageAmount(1);
    setIsProcessing(false);
    setPaymentId('');
  };

  const handleAddPages = async () => {
    if (pageAmount <= 0) {
      toast.error('Please enter a valid number of pages');
      return;
    }

    setIsProcessing(true);

    try {
      // Use the balance service to add pages
      const result = await balanceService.addPages(pageAmount, paymentId || undefined);
      
      toast.success(`Successfully added ${result.addedPages} pages to your balance!`);
      
      // Close the modal
      handleCloseModal();
      
      // If there's an onSuccess callback, call it
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error) {
      console.error('Failed to add pages:', error);
      toast.error(typeof error === 'string' ? error : 'Failed to add pages to your balance');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className={`button-secondary flex items-center gap-2 ${className}`}
      >
        <Plus size={16} />
        <span>{isAdmin ? 'Add Pages (Admin)' : 'Add Pages'}</span>
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
                  <h2 className="text-xl font-semibold text-white">
                    {isAdmin ? 'Add Pages (Admin)' : 'Add Pages to Balance'}
                  </h2>
                  <p className="text-indigo-200 text-sm">
                    {isAdmin 
                      ? 'Add translation pages to user balance' 
                      : 'Add pages to your translation balance'}
                  </p>
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
              <div className="mb-6">
                <label htmlFor="pageAmount" className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Pages to Add
                </label>
                <input
                  type="number"
                  id="pageAmount"
                  min="1"
                  value={pageAmount}
                  onChange={(e) => setPageAmount(parseInt(e.target.value, 10) || 0)}
                  className="form-input"
                />
              </div>

              {isAdmin && (
                <div className="mb-6">
                  <label htmlFor="paymentId" className="block text-sm font-medium text-gray-700 mb-2">
                    Payment ID (Optional)
                  </label>
                  <input
                    type="text"
                    id="paymentId"
                    value={paymentId}
                    onChange={(e) => setPaymentId(e.target.value)}
                    placeholder="Enter payment ID if applicable"
                    className="form-input"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If provided, this will be linked to the payment record
                  </p>
                </div>
              )}

              {!isAdmin && (
                <div className="bg-amber-50 p-4 rounded-lg mb-6">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> This is a direct method to add pages to your balance.
                    For normal purchases, please use the "Buy Pages" button.
                  </p>
                </div>
              )}

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
                  onClick={handleAddPages}
                  disabled={pageAmount <= 0 || isProcessing}
                  className="button-primary flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Add {pageAmount} Pages
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}