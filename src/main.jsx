import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { Toaster } from 'sonner'
import App from './App.jsx'
import './index.css'

// Add COOP header for the main application
if (typeof window !== 'undefined') {
  // This is client-side code
  const metaTag = document.createElement('meta');
  metaTag.httpEquiv = 'Cross-Origin-Opener-Policy';
  metaTag.content = 'same-origin-allow-popups';
  document.head.appendChild(metaTag);
}

// Get Clerk publishable key from environment variables
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClerkProvider publishableKey={clerkPubKey}>
        <Toaster position="top-right" richColors closeButton />
        <App />
      </ClerkProvider>
    </BrowserRouter>
  </React.StrictMode>,
)